import { auth, defineMcp } from "@lovable.dev/mcp-js";

import auditTool from "./tools/run-marketing-audit";
import kpiTool from "./tools/marketing-kpis";
import overviewTool from "./tools/thrn-overview";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged, and Vite inlines it at build time.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "thrn",
  title: "THRN",
  version: "0.1.0",
  instructions:
    "Tools for THRN, an AI marketing consultant. Use `thrn_overview` for what THRN does, " +
    "`marketing_kpis` to compute CTR, CPC, CVR, CAC and ROAS from raw campaign numbers, and " +
    "`run_marketing_audit` to get a senior-marketer audit of a campaign dataset.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [overviewTool, kpiTool, auditTool],
});
