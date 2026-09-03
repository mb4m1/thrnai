# THRN roadmap

- [x] Fix build failure (missing `build:dev` script)
- [ ] AI backend must use Cloudflare Workers AI with the GPT-OSS model only
  - Remove Gemini / Claude / OpenAI / gateway calls from `/api/chat` paths
  - Wire `AI` binding in `wrangler.json` + `src/worker.ts` + `functions/api/chat.ts`
  - Local dev (`server.ts`) proxies Workers AI via Cloudflare REST when account creds exist
  - No frontend or marketing-framework changes
