import { createFileRoute } from "@tanstack/react-router";

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

const jsonHeaders = { "content-type": "application/json" };

type WorkersAI = {
  run: (
    model: string,
    input: { messages: Array<{ role: string; content: string }>; max_tokens: number },
  ) => Promise<unknown>;
};

type CloudflareRuntimeEnv = {
  AI?: WorkersAI;
};

declare global {
  var __THRN_CF_ENV: CloudflareRuntimeEnv | undefined;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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

        const aiMessages = [
          ...(body.system
            ? [{ role: "system" as const, content: body.system }]
            : []),
          ...messages
            .filter(
              (m) =>
                m &&
                (m.role === "user" || m.role === "assistant") &&
                (typeof m.content === "string" || Array.isArray(m.content)),
            )
            .map((m) => ({
              role: m.role,
              content:
                typeof m.content === "string"
                  ? m.content
                  : m.content
                      .map((block) =>
                        typeof block?.text === "string" ? block.text : "",
                      )
                      .join(""),
            })),
        ];

        try {
          const ai = globalThis.__THRN_CF_ENV?.AI;
          if (!ai) {
            throw new Error("Workers AI binding AI is unavailable at runtime");
          }

          const result = await ai.run("@cf/openai/gpt-oss-20b", {
            messages: aiMessages,
            max_tokens: Math.min(body.max_tokens ?? 1000, 2000),
          });

          const output = result as {
            response?: string;
            output_text?: string;
            result?: { response?: string };
          };

          const text =
            output.response ??
            output.output_text ??
            output.result?.response ??
            "THRN couldn't generate a response.";

          const event = {
            type: "content_block_delta",
            delta: {
              type: "text_delta",
              text,
            },
          };

          const streamData =
            `data: ${JSON.stringify(event)}\n\n` +
            `data: [DONE]\n\n`;

          return new Response(streamData, {
            status: 200,
            headers: {
              "content-type": "text/event-stream",
              "cache-control": "no-cache, no-transform",
            },
          });
        } catch (error) {
          console.error("[api/chat] Workers AI failed", error);

          const message =
            error instanceof Error ? error.message : String(error);

          return new Response(
            JSON.stringify({
              error: {
                code: "ai_error",
                message: `THRN couldn't reach the AI engine: ${message}`,
              },
            }),
            { status: 503, headers: jsonHeaders },
          );
        }
      },
    },
  },
});
