import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export default defineTool({
  name: "marketing_kpis",
  title: "Calculate marketing KPIs",
  description:
    "Compute CTR, CPC, CPM, CVR, CAC, AOV and ROAS from raw campaign numbers. Any metric whose inputs are missing is omitted.",
  inputSchema: {
    impressions: z.number().nonnegative().optional().describe("Total impressions."),
    clicks: z.number().nonnegative().optional().describe("Total clicks."),
    spend: z.number().nonnegative().optional().describe("Total ad spend."),
    conversions: z.number().nonnegative().optional().describe("Total conversions."),
    revenue: z.number().nonnegative().optional().describe("Total revenue attributed."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }

    const { impressions, clicks, spend, conversions, revenue } = input;
    const kpis: Record<string, number> = {};

    if (impressions && clicks !== undefined) kpis["ctr_percent"] = round((clicks / impressions) * 100);
    if (clicks && spend !== undefined) kpis["cpc"] = round(spend / clicks);
    if (impressions && spend !== undefined) kpis["cpm"] = round((spend / impressions) * 1000);
    if (clicks && conversions !== undefined) kpis["cvr_percent"] = round((conversions / clicks) * 100);
    if (conversions && spend !== undefined) kpis["cac"] = round(spend / conversions);
    if (conversions && revenue !== undefined) kpis["aov"] = round(revenue / conversions);
    if (spend && revenue !== undefined) kpis["roas"] = round(revenue / spend);

    if (Object.keys(kpis).length === 0) {
      return {
        content: [
          {
            type: "text",
            text: "ERROR: INVALID_INPUT_STREAM — provide at least two related metrics (e.g. spend + clicks) so a KPI can be derived.",
          },
        ],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(kpis, null, 2) }],
      structuredContent: { kpis },
    };
  },
});
