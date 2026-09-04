// THRN AI engine — Cloudflare Workers AI (GPT-OSS).
// This is the ONLY AI backend for THRN. No Gemini / Claude / OpenAI direct APIs.

export const WORKERS_AI_MODEL = "@cf/openai/gpt-oss-120b";
export const WORKERS_AI_FALLBACK_MODEL = "@cf/openai/gpt-oss-20b";

export interface WorkersAITurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface WorkersAIBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

/** Workers AI responses come back in a few shapes depending on model family. */
export function extractWorkersAIText(result: unknown): string {
  if (!result) return "";
  if (typeof result === "string") return result.trim();

  const data = result as Record<string, any>;

  if (typeof data.response === "string") return data.response.trim();
  if (typeof data.output_text === "string") return data.output_text.trim();

  // Responses-API style: output[] -> content[] -> { type: "output_text", text }
  if (Array.isArray(data.output)) {
    const text = data.output
      .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
      .filter((block: any) => typeof block?.text === "string" && block?.type !== "reasoning")
      .map((block: any) => block.text)
      .join("")
      .trim();
    if (text) return text;
  }

  // Chat-completions style
  const choice = data.choices?.[0];
  if (choice) {
    const content = choice.message?.content ?? choice.text;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content.map((b: any) => (typeof b?.text === "string" ? b.text : "")).join("").trim();
    }
  }

  if (typeof data.result === "object") return extractWorkersAIText(data.result);
  return "";
}

function buildInput(system: string, messages: WorkersAITurn[]) {
  return {
    messages: [{ role: "system", content: system }, ...messages],
    max_tokens: 2048,
    temperature: 0.5,
  };
}

/** Run GPT-OSS through the Workers AI binding (production Worker / Pages Function). */
export async function runWorkersAIBinding(
  ai: WorkersAIBinding,
  system: string,
  messages: WorkersAITurn[]
): Promise<string> {
  const input = buildInput(system, messages);
  for (const model of [WORKERS_AI_MODEL, WORKERS_AI_FALLBACK_MODEL]) {
    try {
      const text = extractWorkersAIText(await ai.run(model, input));
      if (text) return text;
    } catch (error) {
      console.error(`[THRN Workers AI] ${model} failed:`, error);
    }
  }
  return "";
}

/**
 * Run GPT-OSS through the Cloudflare Workers AI REST API.
 * Used by the local dev server, which has no Workers AI binding.
 * Credentials are Cloudflare-native (account id + API token), not an AI vendor key.
 */
export async function runWorkersAIRest(
  accountId: string,
  apiToken: string,
  system: string,
  messages: WorkersAITurn[]
): Promise<string> {
  const input = buildInput(system, messages);
  for (const model of [WORKERS_AI_MODEL, WORKERS_AI_FALLBACK_MODEL]) {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify(input),
        }
      );
      if (!res.ok) {
        console.error(`[THRN Workers AI REST] ${model} ${res.status}:`, await res.text().catch(() => ""));
        continue;
      }
      const text = extractWorkersAIText(await res.json());
      if (text) return text;
    } catch (error) {
      console.error(`[THRN Workers AI REST] ${model} failed:`, error);
    }
  }
  return "";
}
