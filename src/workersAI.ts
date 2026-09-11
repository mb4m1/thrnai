// THRN AI engine — Cloudflare Workers AI.
// GPT-OSS remains the default engine. An optional LoRA can be enabled only when
// a compatible fine-tune has been trained and uploaded to Workers AI.

export const WORKERS_AI_MODEL = "@cf/openai/gpt-oss-120b";
export const WORKERS_AI_FALLBACK_MODEL = "@cf/openai/gpt-oss-20b";

export interface WorkersAITurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface WorkersAIBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface WorkersAILoRAOptions {
  /** Workers AI fine-tune name or id. */
  lora?: string;
  /** LoRA-compatible Workers AI model, e.g. a model ending in -lora. */
  loraModel?: string;
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

/** Run Workers AI with an optional THRN LoRA. The LoRA path is opt-in. */
export async function runWorkersAIBinding(
  ai: WorkersAIBinding,
  system: string,
  messages: WorkersAITurn[],
  options: WorkersAILoRAOptions = {}
): Promise<string> {
  const input = buildInput(system, messages);

  // Only attempt a LoRA when explicitly configured. If it fails, fall back to
  // the existing production GPT-OSS path instead of breaking chat.
  if (options.lora && options.loraModel) {
    try {
      const text = extractWorkersAIText(
        await ai.run(options.loraModel, { ...input, lora: options.lora })
      );
      if (text) return text;
    } catch (error) {
      console.error(`[THRN Workers AI LoRA] ${options.loraModel} failed:`, error);
    }
  }

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
 * Run Workers AI through the Cloudflare Workers AI REST API.
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
