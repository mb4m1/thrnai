# THRN roadmap

- [x] Fix build failure (missing `build:dev` script)
- [x] AI backend uses Cloudflare Workers AI with GPT-OSS only
  - Removed Gemini / Claude / OpenAI / gateway calls from all `/api/chat` paths
  - Shared engine helper: `src/workersAI.ts` (`@cf/openai/gpt-oss-120b`, fallback `-20b`)
  - `AI` binding wired in `wrangler.json`, `src/worker.ts`, `functions/api/chat.ts`
  - Local dev (`server.ts`) proxies Workers AI via Cloudflare REST when
    `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` exist; otherwise heuristic reply
  - No frontend or marketing-framework changes
