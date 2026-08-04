# PathRescue — AI 智慧旅遊導航與救援

Next.js App Router MVP，依 `PROJECT_PLAN.md` 實作。

## 快速開始

1. 複製環境變數：

```bash
cp .env.example .env.local
```

2. 填入環境變數（見 `.env.example`）：

**零費用測試建議：**
- `AI_PROVIDER=gemini`
- `GEMINI_API_KEY`（到 [Google AI Studio](https://aistudio.google.com/apikey) 免費申請）
- **先不要填** `GOOGLE_MAPS_API_KEY`（避免 Maps 計費）
- OpenAI 可留空

之後要切到 OpenAI：設 `AI_PROVIDER=openai` 並填 `OPENAI_API_KEY`。

3. 在 Supabase SQL Editor 執行：

`supabase/migrations/20260803100000_create_core_tables.sql`

4. 安裝並啟動：

```bash
npm install
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)。

## 已完成模組

| Phase | 內容 |
|------|------|
| 1 | Schema、TypeScript 型別、Supabase Client、Upstash Rate Limiter |
| 2 | `prompts.ts`、`/api/generate-trip`、`/api/rescue` |
| 3 | `mapService.ts`（Places 校正 + Directions） |
| 4 | 搜尋表單、行程地圖、SOS、Google Maps 匯出 |
| 5 | `utils/affiliate.ts`（Klook / KKday / Agoda Deep Link） |
| PWA | `@ducanh2912/next-pwa`、manifest、離線快取行程 |
| Share | `/share/[tripId]` 唯讀分享、Dynamic OG、複製分享連結 |

### 分享功能注意

請在 Supabase SQL Editor 再執行：

`supabase/migrations/20260804100000_trip_public_sharing.sql`

這樣 `is_public` 與公開讀取政策才會生效。

## 主要 API

### `POST /api/generate-trip`

```json
{
  "destination": "東京",
  "total_days": 3,
  "preferences": ["food", "photo"],
  "notes": "想吃拉麵",
  "locale": "zh-TW"
}
```

### `POST /api/rescue`

```json
{
  "latitude": 35.6595,
  "longitude": 139.7005,
  "issue": "突然下雨，需要室內備案",
  "radius_meters": 1500
}
```
