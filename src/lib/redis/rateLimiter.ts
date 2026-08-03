import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const FREE_TIER_DAILY_LIMIT = Number(
  process.env.FREE_TIER_DAILY_LIMIT ?? '5',
);

let redis: Redis | null = null;
let freeTierLimiter: Ratelimit | null = null;

function getRedis(): Redis {
  if (redis) return redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN',
    );
  }

  redis = new Redis({ url, token });
  return redis;
}

function getFreeTierLimiter(): Ratelimit {
  if (freeTierLimiter) return freeTierLimiter;

  freeTierLimiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(FREE_TIER_DAILY_LIMIT, '1 d'),
    analytics: true,
    prefix: 'ai-travel:free-tier',
  });

  return freeTierLimiter;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  /** True when Redis is not configured — request is allowed through. */
  bypassed: boolean;
}

/**
 * Rate-limit free-tier users by a stable identifier (user id or IP).
 * Pro users should skip this check at the call site.
 * If Upstash env vars are missing (local/dev), requests are allowed.
 */
export async function checkFreeTierRateLimit(
  identifier: string,
): Promise<RateLimitResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return {
      success: true,
      limit: FREE_TIER_DAILY_LIMIT,
      remaining: FREE_TIER_DAILY_LIMIT,
      reset: Date.now() + 86_400_000,
      bypassed: true,
    };
  }

  const result = await getFreeTierLimiter().limit(identifier);

  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
    bypassed: false,
  };
}

export function getFreeTierDailyLimit(): number {
  return FREE_TIER_DAILY_LIMIT;
}
