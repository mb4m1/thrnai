import { createFileRoute } from "@tanstack/react-router";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
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
        const openaiMessages: Array<{ role: string; content: string }> = [];
        if (body.system) openaiMessages.push({ role: "system", content: body.system });
        for (const m of messages) {
          if (!m || typeof m.content !== "string") continue;
          if (m.role !== "user" && m.role !== "assistant") continue;
          openaiMessages.push({ role: m.role, content: m.content });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Lovable-API-Key": apiKey,
            "X-Lovable-AIG-SDK": "native-fetch",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: openaiMessages,
            stream: true,
            max_tokens: Math.min(body.max_tokens ?? 1000, 2000),
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text().catch(() => "");
          const status = upstream.status === 429 || upstream.status === 402 ? upstream.status : 500;
          return new Response(
            JSON.stringify({ error: { message: errText || "Upstream error" } }),
            { status, headers: jsonHeaders },
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
