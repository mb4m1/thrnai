import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

const jsonHeaders = { "content-type": "application/json" };

type WorkersAI = {
  run: (
    model: string,
    input: {
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
    },
  ) => Promise<unknown>;
};

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const details = error as Error & {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      cause?: unknown;
      body?: unknown;
    };

    return {
      name: error.name,
      message: error.message,
      code: details.code ?? null,
      status: details.status ?? details.statusCode ?? null,
      body: details.body ?? null,
      cause:
        details.cause instanceof Error
          ? { name: details.cause.name, message: details.cause.message }
          : details.cause ?? null,
      stack: error.stack ?? null,
    };
  }

  return {
    name: typeof error,
    message: String(error),
    code: null,
    status: null,
    body: null,
    cause: null,
    stack: null,
  };
}

function extractAIText(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;

  const output = result as Record<string, unknown>;

  if (typeof output.response === "string" && output.response.trim()) {
    return output.response;
  }

  if (typeof output.output_text === "string" && output.output_text.trim()) {
    return output.output_text;
  }

  const nestedResult = output.result;
  if (nestedResult && typeof nestedResult === "object") {
    const nested = nestedResult as Record<string, unknown>;
    if (typeof nested.response === "string" && nested.response.trim()) {
      return nested.response;
    }
    if (
      typeof nested.output_text === "string" &&
      nested.output_text.trim()
    ) {
      return nested.output_text;
    }
  }

  const choices = output.choices;
  if (Array.isArray(choices)) {
    const first = choices[0];
    if (first && typeof first === "object") {
      const message = (first as Record<string, unknown>).message;
      if (message && typeof message === "object") {
        const content = (message as Record<string, unknown>).content;
        if (typeof content === "string" && content.trim()) return content;
      }
    }
  }

  // GPT-OSS can return the OpenAI Responses API shape from the Workers AI binding.
  // Extract text from output[].content[].text so we don't incorrectly fall back
  // to the generic "couldn't generate" message after a successful inference.
  const responseOutput = output.output;
  if (Array.isArray(responseOutput)) {
    const text = responseOutput
      .flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const content = (item as Record<string, unknown>).content;
        if (!Array.isArray(content)) return [];
        return content;
      })
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const block = item as Record<string, unknown>;
        return typeof block.text === "string" ? block.text : "";
      })
      .filter(Boolean)
      .join("");

    if (text.trim()) return text;
  }

  return null;
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
          const ai = env.AI as WorkersAI | undefined;
          if (!ai) {
            throw new Error("Workers AI binding AI is unavailable at runtime");
          }

          const model = "@cf/openai/gpt-oss-20b";
          const maxTokens = Math.min(body.max_tokens ?? 1000, 2000);

          console.info("[api/chat] Calling Workers AI", {
            model,
            messageCount: aiMessages.length,
            maxTokens,
          });

          const result = await ai.run(model, {
            messages: aiMessages,
            max_tokens: maxTokens,
          });

          console.info("[api/chat] Workers AI returned successfully", {
            model,
            resultType: typeof result,
          });

          const text = extractAIText(result);

          if (!text) {
            console.error("[api/chat] Workers AI returned no text", {
              model,
              resultType: typeof result,
              resultKeys:
                result && typeof result === "object"
                  ? Object.keys(result as Record<string, unknown>)
                  : [],
            });
            throw new Error("Workers AI returned a response without text");
          }

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
          const diagnostic = serializeError(error);

          console.error("[api/chat] Workers AI FAILED", {
            model: "@cf/openai/gpt-oss-20b",
            messageCount: aiMessages.length,
            error: diagnostic,
          });

          const diagnosticText = [
            diagnostic.message,
            diagnostic.code ? `code=${String(diagnostic.code)}` : null,
            diagnostic.status ? `status=${String(diagnostic.status)}` : null,
          ]
            .filter(Boolean)
            .join(" | ");

          return new Response(
            JSON.stringify({
              error: {
                code: "ai_error",
                message: `THRN couldn't reach the AI engine: ${diagnosticText}`,
                diagnostic: {
                  name: diagnostic.name,
                  message: diagnostic.message,
                  code: diagnostic.code,
                  status: diagnostic.status,
                  body: diagnostic.body,
                  cause: diagnostic.cause,
                },
              },
            }),
            { status: 503, headers: jsonHeaders },
          );
        }
      },
    },
  },
});
