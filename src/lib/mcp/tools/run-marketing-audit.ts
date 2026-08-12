import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";

const AUDIT_SYSTEM = [
  "You are THRN™ 1.0, an advanced AI Marketing Auditor operating as a senior marketer.",
  "Validate the dataset first: if core metrics (spend, clicks, impressions, conversions or revenue) are missing,",
  "reply exactly with 'ERROR: INVALID_INPUT_STREAM' followed by the list of missing fields and stop.",
  "Otherwise: compute CTR, CPC, CVR, CAC and ROAS, then deliver a concise audit with four phases —",
  "1) Diagnosis, 2) Root causes, 3) Prioritised actions, 4) Expected impact.",
  "Use compact markdown tables for the KPI math. Be direct, specific and quantitative.",
].join(" ");

export default defineTool({
  name: "run_marketing_audit",
  title: "Run marketing audit",
  description:
    "Run a THRN senior-marketer audit over a campaign dataset (paste metrics as text) and return the written audit.",
  inputSchema: {
    dataset: z
      .string()
      .min(1)
      .describe("Campaign metrics as text: channel, spend, impressions, clicks, conversions, revenue, period."),
    goal: z.string().optional().describe("Optional business goal or constraint to audit against."),
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new ToolError("AI engine is not configured for this app.");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "openai/gpt-5.5",
        messages: [
          { role: "system", content: AUDIT_SYSTEM },
          {
            role: "user",
            content: input.goal
              ? `Goal: ${input.goal}\n\nDataset:\n${input.dataset}`
              : `Dataset:\n${input.dataset}`,
          },
        ],
        max_completion_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ToolError(`AI engine error (${res.status}): ${detail.slice(0, 300)}`);
    }

    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim();
    if (!text) throw new ToolError("The AI engine returned an empty audit.");

    return { content: [{ type: "text", text }], structuredContent: { audit: text } };
  },
});
