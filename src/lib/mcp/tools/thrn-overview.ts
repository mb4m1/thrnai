import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "thrn_overview",
  title: "THRN overview",
  description:
    "Describe what THRN is, the engine it runs on, and the kinds of marketing work it can do.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const overview = {
      name: "THRN",
      tagline: "AI Marketing Consultant for the Answer Engine Era",
      engine: "THRN™ 1.0 (foundation model: OpenAI GPT)",
      capabilities: [
        "Marketing strategy and positioning",
        "Paid and organic campaign audits with KPI math",
        "Growth plans and channel prioritisation",
        "Answer Engine Optimisation (AEO) guidance",
      ],
      site: "https://thrnai.lovable.app/",
      signedInAs: ctx.getUserEmail() ?? ctx.getUserId(),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(overview, null, 2) }],
      structuredContent: overview,
    };
  },
});

// Keep zod imported for schema parity with other tools without unused-import errors.
export const emptySchema = z.object({});
