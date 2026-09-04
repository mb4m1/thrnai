import {
  runWorkersAIBinding,
  type WorkersAIBinding,
  type WorkersAITurn,
} from "../../src/workersAI";

interface Env {
  AI?: WorkersAIBinding;
  [key: string]: unknown;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<Record<string, unknown>>;
}

const THRN_IDENTITY = `You are THRN, an elite AI marketing consultant created by the THRN team.
You have 15+ years of experience across B2B SaaS, DTC, e-commerce, consumer apps, brand positioning, and AEO/AIO.
You are THRN, not ChatGPT or a generic assistant. Maintain a sharp, executive, senior-marketer persona: clear, pragmatic, analytical, and actionable. Focus on GTM strategy, funnel audits, CAC/LTV bottlenecks, messaging, positioning, content, pricing, retention, and AI visibility.`;

function textOf(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.map((block) => (typeof block?.text === "string" ? block.text : "")).join("");
  }
  return "";
}

function buildTurns(messages: ChatMessage[]): WorkersAITurn[] {
  const source = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: textOf(m).trim(),
    }))
    .filter((m) => m.content.length > 0);

  // The UI shows an initial assistant greeting; it must not lead the conversation.
  while (source.length && source[0].role === "assistant") source.shift();
  while (source.length && source[source.length - 1].role === "assistant") source.pop();

  return source;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };

  const json = (payload: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
    const mode = typeof body.mode === "string" ? body.mode : "consult";
    const customSystem = typeof body.system === "string" ? body.system : "";

    const turns = buildTurns(messages);

    if (!turns.length) {
      const message = "THRN: Please enter a marketing question to begin the consultation.";
      return json({ answer: message, content: message });
    }

    if (!env.AI) {
      const message = "THRN: The Workers AI binding is not available in this environment.";
      return json({ error: { code: "ai_error", message }, answer: message, content: message });
    }

    let modeInstruction = "";
    if (mode === "audit") {
      modeInstruction = " You are in AUDIT mode: rigorously diagnose the funnel, data, landing page, or messaging before recommending interventions.";
    } else if (mode === "plan") {
      modeInstruction = " You are in PLAN mode: produce a prioritized, chronological roadmap with milestones, owners, and KPI targets.";
    }

    const systemPrompt = `${THRN_IDENTITY}${modeInstruction}\n${customSystem}`.trim();
    const answer = await runWorkersAIBinding(env.AI, systemPrompt, turns);

    if (answer) return json({ answer, content: answer });

    const message = "THRN: The AI engine is temporarily unavailable. Please try again in a moment.";
    return json({ error: { code: "ai_error", message }, answer: message, content: message });
  } catch (error) {
    console.error("[THRN /api/chat] Execution error:", error);
    const message = "THRN: The AI engine encountered an unexpected issue. Please try again.";
    return json({ error: { code: "ai_error", message }, answer: message, content: message });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    },
  });
};
