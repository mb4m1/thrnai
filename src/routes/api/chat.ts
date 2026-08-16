import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

interface ChatMessage { role: "user" | "assistant"; content: string | Array<Record<string, unknown>>; }
const jsonHeaders = { "content-type": "application/json" };
type WorkersAI = { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };
function extractAIText(result: unknown): string | null {
  if (typeof result === "string" && result.trim()) return result;
  if (!result || typeof result !== "object") return null;
  const root = result as Record<string, unknown>;
  for (const key of ["response", "output_text", "text", "content", "generated_text", "result"]) {
    const value = root[key];
    if (typeof value === "string" && value.trim()) return value;
    const nested = extractAIText(value); if (nested) return nested;
  }
  for (const key of ["choices", "output"]) {
    const value = root[key];
    if (Array.isArray(value)) for (const item of value) { const text = extractAIText(item); if (text) return text; }
  }
  return null;
}
export const Route = createFileRoute("/api/chat")({ server: { handlers: { POST: async ({ request }) => {
  let body: { system?: string; messages?: ChatMessage[]; max_tokens?: number };
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: { message: "Invalid JSON body" } }), { status: 400, headers: jsonHeaders }); }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const aiMessages = [...(body.system ? [{ role: "system", content: body.system }] : []), ...messages.filter((m) => m && (m.role === "user" || m.role === "assistant")).map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : m.content.map((block) => typeof block?.text === "string" ? block.text : "").join("") }))];
  try {
    const ai = env.AI as WorkersAI | undefined; if (!ai) throw new Error("Workers AI binding AI is unavailable at runtime");
    const model = "@cf/openai/gpt-oss-20b"; const maxTokens = Math.min(body.max_tokens ?? 1000, 2000);
    console.info("[api/chat] Calling Workers AI", { model, messageCount: aiMessages.length, maxTokens });
    const result = await ai.run(model, { messages: aiMessages, max_tokens: maxTokens });
    console.info("[api/chat] Workers AI RAW RESULT", { model, resultType: typeof result, resultKeys: result && typeof result === "object" ? Object.keys(result as Record<string, unknown>) : [], resultPreview: typeof result === "string" ? result.slice(0, 1000) : JSON.stringify(result).slice(0, 4000) });
    const text = extractAIText(result); if (!text) throw new Error("Workers AI returned a response without text");
    const event = { type: "content_block_delta", delta: { type: "text_delta", text } };
    return new Response(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`, { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" } });
  } catch (error) { const message = error instanceof Error ? error.message : String(error); console.error("[api/chat] Workers AI FAILED", { model: "@cf/openai/gpt-oss-20b", error: message }); return new Response(JSON.stringify({ error: { code: "ai_error", message: `THRN couldn't reach the AI engine: ${message}` } }), { status: 503, headers: jsonHeaders }); }
} } } });