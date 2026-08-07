import { createFileRoute } from "@tanstack/react-router";

interface ChatMessage {
  role: "user" | "assistant";
  // Plain text, or multimodal content blocks (image_url / file / text).
  content: string | Array<Record<string, unknown>>;
}


const jsonHeaders = { "content-type": "application/json" };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: { message: "AI is not configured" } }),
            { status: 500, headers: jsonHeaders },
          );
        }

        let body: {
          system?: string;
          messages?: ChatMessage[];
          max_tokens?: number;
        };
        try {
          body = await request.json();
        } catch {
          return new Response(
            JSON.stringify({ error: { message: "Invalid JSON body" } }),
            { status: 400, headers: jsonHeaders },
          );
        }

        const messages = Array.isArray(body.messages) ? body.messages : [];
        const openaiMessages: Array<{ role: string; content: unknown }> = [];
        if (body.system) openaiMessages.push({ role: "system", content: body.system });
        for (const m of messages) {
          if (!m) continue;
          const ok = typeof m.content === "string" || Array.isArray(m.content);
          if (!ok) continue;
          if (m.role !== "user" && m.role !== "assistant") continue;
          openaiMessages.push({ role: m.role, content: m.content });
        }


        // Transient upstream/infra failures (cold starts, gateway restarts,
        // network blips) are retried with exponential backoff + jitter.
        const RETRYABLE_STATUS = new Set([408, 425, 500, 502, 503, 504, 522, 524]);
        const MAX_ATTEMPTS = 3;

        const callUpstream = () =>
          fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "Lovable-API-Key": apiKey,
              "X-Lovable-AIG-SDK": "native-fetch",
            },
            body: JSON.stringify({
              // THRN™ 1.0 AI Marketing Consultant — foundation model: OpenAI GPT.
              // To upgrade to a future GPT version, change this identifier only.
              model: "openai/gpt-5.5",
              messages: openaiMessages,
              stream: true,
              max_completion_tokens: Math.min(body.max_tokens ?? 1000, 2000),
            }),
          });

        let upstream: Response | null = null;
        let lastStatus = 0;
        let lastDetail = "";
        let lastCode = "upstream_error";

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          let res: Response;
          try {
            res = await callUpstream();
          } catch (err) {
            lastStatus = 0;
            lastCode = "network_error";
            lastDetail = err instanceof Error ? err.message : "Network request failed";
            if (attempt < MAX_ATTEMPTS) {
              await new Promise((r) => setTimeout(r, 300 * 2 ** (attempt - 1) + Math.random() * 200));
              continue;
            }
            break;
          }

          if (res.ok && res.body) {
            upstream = res;
            break;
          }

          lastStatus = res.status;
          lastDetail = (await res.text().catch(() => "")) || `Upstream responded ${res.status}`;
          lastCode =
            res.status === 429
              ? "rate_limited"
              : res.status === 402
                ? "payment_required"
                : RETRYABLE_STATUS.has(res.status) || !res.body
                  ? "upstream_unavailable"
                  : "upstream_error";

          const retryable = RETRYABLE_STATUS.has(res.status) || (res.ok && !res.body);
          if (retryable && attempt < MAX_ATTEMPTS) {
            const retryAfter = Number(res.headers.get("retry-after"));
            const wait = Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(retryAfter * 1000, 4000)
              : 300 * 2 ** (attempt - 1) + Math.random() * 200;
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          break;
        }

        if (!upstream || !upstream.body) {
          const status =
            lastStatus === 429 || lastStatus === 402
              ? lastStatus
              : lastCode === "network_error" || lastCode === "upstream_unavailable"
                ? 503
                : 500;
          const message =
            lastCode === "rate_limited"
              ? "THRN is handling a lot of requests right now. Please try again in a moment."
              : lastCode === "payment_required"
                ? "AI usage limit reached. Please top up to keep chatting."
                : lastCode === "network_error" || lastCode === "upstream_unavailable"
                  ? "THRN couldn't reach the AI engine (temporary issue). Please retry."
                  : "THRN hit an unexpected error talking to the AI engine.";
          console.error("[api/chat] upstream failed", {
            code: lastCode,
            status: lastStatus,
            attempts: MAX_ATTEMPTS,
            detail: lastDetail.slice(0, 500),
          });
          return new Response(
            JSON.stringify({
              error: { code: lastCode, message, retryable: status === 503 || status === 429, detail: lastDetail.slice(0, 500) },
            }),
            { status, headers: { ...jsonHeaders, ...(status === 503 ? { "retry-after": "2" } : {}) } },
          );
        }


        // Transform OpenAI-style SSE to Anthropic-style events expected by the client.
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            let buf = "";
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith("data:")) continue;
                  const raw = trimmed.slice(5).trim();
                  if (!raw) continue;
                  if (raw === "[DONE]") {
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    continue;
                  }
                  try {
                    const evt = JSON.parse(raw);
                    const text: string | undefined = evt?.choices?.[0]?.delta?.content;
                    if (text) {
                      const out = {
                        type: "content_block_delta",
                        delta: { type: "text_delta", text },
                      };
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify(out)}\n\n`));
                    }
                  } catch {
                    /* skip malformed */
                  }
                }
              }
            } catch (err) {
              controller.error(err);
              return;
            }
            controller.close();
          },
        });

        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache, no-transform",
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
});
