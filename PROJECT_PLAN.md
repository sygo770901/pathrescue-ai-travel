# AI 智慧旅遊導航與救援小工具 (MVP 開發藍圖)

> **給 Cursor (Grok 4.5) 的執行指令：**
> 請將本檔案視為系統規格書 (Spec Document)。請嚴格按照「開發步驟清單」與「System Prompt 規範」，一步一步生成高品質、TypeScript 型別嚴謹且無 Placeholder 的正式程式碼。

---

## 1. 系統架構與技術棧 (Tech Stack)
* **Framework**: Next.js (App Router, TypeScript)
* **Styling**: Tailwind CSS + shadcn/ui
* **Database & Auth**: Supabase (PostgreSQL)
* **AI Model**: OpenAI API (`gpt-4o-mini` / `gpt-4o`) 或 Google Gemini API
* **Map Services**: Google Maps Platform API (Places, Directions)
* **State & Cache**: Upstash Redis (Rate Limiting & Dynamic Caching)

---

## 2. 開發步驟清單 (Development Checklist)

### Phase 1: 資料庫與基礎建設 (Database & Auth Setup)
- [ ] 建立 Supabase 資料庫 Schema（包含 `users`, `trips`, `itineraries`, `affiliate_logs`）。
- [ ] 設定 Supabase Client 與 TypeScript 型別定義檔 (`types/database.ts`)。
- [ ] 配置 Upstash Redis 的 Rate Limiter（限制免費用戶請求次數）。

### Phase 2: AI Prompt Engine & Edge Function
- [ ] 建立 `lib/ai/prompts.ts`，放入下方定義好的【核心 System Prompt】。
- [ ] 建立 API Route (`app/api/generate-trip/route.ts`) 呼叫 LLM，並解析標準 JSON 格式。
- [ ] 建立 API Route (`app/api/rescue/route.ts`) 處理「現場救援/雨天備案」請求。

### Phase 3: 地圖服務與資料校正 (Map Services)
- [ ] 建立 `services/mapService.ts`。
- [ ] 實作 `getPlaceDetails()`：使用 AI 回傳的名稱向 Google Places API 驗證並補全 Place ID、照片、營業時間與真實經緯度。
- [ ] 實作 `calculateRoute()`：使用 Directions API 計算景點間的最佳交通時間與路線。

### Phase 4: 前端 UI & 互動地圖 (Frontend Component Architecture)
- [ ] **搜尋表單**：目的地、天數、旅遊偏好標籤（美食、網美、戶外、親子）。
- [ ] **行程地圖介面**：動態展示路線，點擊景點卡片高亮對應地圖 Marker。
- [ ] **現場救援按鈕 (SOS Button)**：自動帶入當前 GPS 座標，一鍵重排附近 1.5 公里內的備案。
- [ ] **匯出功能**：生成「一鍵匯入 Google Maps」的 URL。

### Phase 5: 導流與變現模組 (Monetization Engine)
- [ ] 建立 `utils/affiliate.ts`：自動將景點/飯店名稱轉化為帶有 Affiliate Tag (Klook / KKday / Agoda) 的深度連結 (Deep Link)。

---

## 3. Cursor (Grok 4.5) 專用 AI Prompt 規範

以下為 `lib/ai/prompts.ts` 中必須使用的核心 System Prompt：

```typescript
export const TRIP_GENERATOR_SYSTEM_PROMPT = `
You are an expert AI Travel Planner & Location Intelligence Engine.
Your task is to generate a highly realistic, logistically sound travel itinerary based on user preferences.

CRITICAL REQUIREMENTS:
1. You MUST respond ONLY with a single, valid JSON object.
2. Do NOT include markdown code blocks (e.g. \`\`\`json ... \`\`\`), do NOT add any markdown, intro, or outtro text.
3. Logical Sequencing: Ensure geographical proximity between consecutive places to minimize travel time.
4. Real Places Only: Recommend popular, existing spots with accurate approximate coordinates.

JSON RESPONSE SCHEMA:
{
  "trip_title": "string (e.g. 'Tokyo 3-Day Culture & Food Tour')",
  "destination": "string",
  "total_days": "number",
  "itinerary": [
    {
      "day": "number",
      "theme": "string (e.g. 'Shinjuku & Shibuya Exploration')",
      "schedule": [
        {
          "time_slot": "string (e.g. '09:00 - 11:30')",
          "place_name": "string (Official location name for Google Maps search)",
          "category": "string ('attraction' | 'food' | 'shopping' | 'accommodation')",
          "estimated_stay_mins": "number",
          "latitude": "number (float)",
          "longitude": "number (float)",
          "reason_to_visit": "string (Short, engaging summary)",
          "suggested_affiliate_type": "string ('klook' | 'kkday' | 'agoda' | 'none')",
          "affiliate_search_query": "string (Search query for tickets/tours)"
        }
      ]
    }
  ]
}
`;

export const RESCUE_MODE_SYSTEM_PROMPT = `
You are a Real-Time Travel Rescue AI. The user is currently on a trip and facing an unexpected disruption (e.g., sudden rain, closed shop, fatigue, or bad weather).

CRITICAL REQUIREMENTS:
1. Respond ONLY with a single, valid JSON object without any markdown block formatting.
2. Proximity: Recommend 3 alternative spots located within 1.5 km of the user's current GPS location.
3. Indoor/Adaptive Focus: Prioritize indoor places, cafes, or nearby covered attractions if the issue is rain or fatigue.

JSON RESPONSE SCHEMA:
{
  "rescue_status": "success",
  "issue_handled": "string (e.g. 'Rainy Weather Backup')",
  "current_location_near": "string",
  "alternative_places": [
    {
      "place_name": "string",
      "category": "string",
      "distance_meters": "number",
      "latitude": "number (float)",
      "longitude": "number (float)",
      "why_this_is_a_good_backup": "string"
    }
  ]
}
`;