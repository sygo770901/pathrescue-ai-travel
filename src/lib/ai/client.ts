import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export type AiProvider = 'gemini' | 'openai';

/**
 * Free-tier friendly models for new Gemini API users (2026).
 * Older 2.0 / 2.5 IDs often return 404 "no longer available to new users"
 * or free-tier quota limit: 0.
 */
const GEMINI_FALLBACK_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-flash-latest',
] as const;

const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

let openaiClient: OpenAI | null = null;
let geminiClient: GoogleGenerativeAI | null = null;
let lastUsedGeminiModel: string | null = null;

/**
 * Resolve which provider to use.
 * Default: gemini (free-tier friendly for local testing).
 */
export function getAiProvider(): AiProvider {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();

  if (explicit === 'gemini' || explicit === 'openai') {
    return explicit;
  }

  if (process.env.GEMINI_API_KEY) return 'gemini';
  if (process.env.OPENAI_API_KEY) return 'openai';

  return 'gemini';
}

export function getActiveModel(): string {
  const provider = getAiProvider();

  if (provider === 'gemini') {
    return lastUsedGeminiModel ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  }

  return process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
}

function getGeminiModelCandidates(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const unique = new Set<string>([primary, ...GEMINI_FALLBACK_MODELS]);
  return Array.from(unique);
}

export function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith('在這裡貼')) {
    throw new Error('Missing OPENAI_API_KEY');
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

export function getGeminiClient(): GoogleGenerativeAI {
  if (geminiClient) return geminiClient;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.startsWith('在這裡貼')) {
    throw new Error(
      'Missing GEMINI_API_KEY. Get a free key at https://aistudio.google.com/apikey',
    );
  }

  geminiClient = new GoogleGenerativeAI(apiKey);
  return geminiClient;
}

/**
 * Extract the first complete JSON value (object/array) from messy LLM output.
 * Handles markdown fences, leading prose, and trailing junk after the JSON.
 */
export function extractJsonPayload(raw: string): string {
  const trimmed = raw.trim();
  const withoutFences = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```[\s\S]*$/i, '')
    .trim();

  const start = withoutFences.search(/[\{\[]/);
  if (start < 0) {
    throw new Error('AI 回傳內容找不到 JSON，請再試一次');
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < withoutFences.length; i += 1) {
    const ch = withoutFences[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch);
      continue;
    }

    if (ch === '}' || ch === ']') {
      const open = stack.pop();
      if (
        (ch === '}' && open !== '{') ||
        (ch === ']' && open !== '[') ||
        open === undefined
      ) {
        throw new Error('AI 回傳的 JSON 括號不匹配，請再試一次');
      }
      if (stack.length === 0) {
        return withoutFences.slice(start, i + 1);
      }
    }
  }

  throw new Error(
    'AI 回傳的行程 JSON 不完整（天數較長時較常見）。系統會嘗試分段重產，或請改較短天數再試。',
  );
}

/**
 * Strip accidental markdown fences / trailing junk and parse JSON from LLM output.
 */
export function parseStrictJson<T>(raw: string): T {
  const payload = extractJsonPayload(raw);
  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`行程資料解析失敗：${message}。請再試一次。`);
  }
}

function isRetryableGeminiModelError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('429') ||
    message.includes('404') ||
    message.includes('Too Many Requests') ||
    message.includes('Not Found') ||
    message.includes('no longer available') ||
    message.includes('quota') ||
    message.includes('RESOURCE_EXHAUSTED')
  );
}

function toUserFriendlyAiError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (isRetryableGeminiModelError(error)) {
    return new Error(
      '目前可用的 Gemini 免費模型都無法回應（模型已下架或額度用完）。請到 Google AI Studio 確認可用模型，或建立新專案的 API Key 後再試。',
    );
  }

  return new Error(message);
}

async function chatJsonWithOpenAI(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
}): Promise<string> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  const completion = await client.chat.completions.create({
    model,
    temperature: params.temperature ?? 0.7,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: params.systemPrompt },
      { role: 'user', content: params.userPrompt },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  return content;
}

async function generateWithGeminiModel(
  modelName: string,
  params: {
    systemPrompt: string;
    userPrompt: string;
    temperature?: number;
    maxOutputTokens?: number;
  },
): Promise<string> {
  const client = getGeminiClient();

  const model = client.getGenerativeModel({
    model: modelName,
    systemInstruction: params.systemPrompt,
    generationConfig: {
      temperature: params.temperature ?? 0.7,
      responseMimeType: 'application/json',
      // Long multi-day itineraries need large headroom
      maxOutputTokens: params.maxOutputTokens ?? 16384,
    },
  });

  const result = await model.generateContent(params.userPrompt);
  const content = result.response.text();

  if (!content) {
    throw new Error(`Gemini (${modelName}) returned an empty response`);
  }

  return content;
}

async function chatJsonWithGemini(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const candidates = getGeminiModelCandidates();
  let lastError: unknown;

  for (const modelName of candidates) {
    try {
      const content = await generateWithGeminiModel(modelName, params);
      lastUsedGeminiModel = modelName;
      console.info(`[ai] Gemini success with model: ${modelName}`);
      return content;
    } catch (error) {
      lastError = error;
      console.warn(
        `[ai] Gemini model failed: ${modelName}`,
        error instanceof Error ? error.message : error,
      );

      if (!isRetryableGeminiModelError(error)) {
        throw toUserFriendlyAiError(error);
      }
      // 404 / 429 / quota → try next model
    }
  }

  throw toUserFriendlyAiError(lastError);
}

/**
 * Provider-agnostic JSON chat completion.
 * Controlled by AI_PROVIDER / available API keys.
 */
export async function chatJsonCompletion(params: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const provider = getAiProvider();

  if (provider === 'openai') {
    return chatJsonWithOpenAI(params);
  }

  return chatJsonWithGemini(params);
}

export function getAiRuntimeInfo(): {
  provider: AiProvider;
  model: string;
} {
  return {
    provider: getAiProvider(),
    model: getActiveModel(),
  };
}
