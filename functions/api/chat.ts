interface Env {
  GEMINI_API_KEY?: string;
  [key: string]: unknown;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<Record<string, unknown>>;
}

const THRN_IDENTITY = `You are THRN, an elite AI marketing consultant created by the THRN team.
You have 15+ years of experience across B2B SaaS, DTC, e-commerce, consumer apps, brand positioning, and the new AI engine optimization (AEO/AIO) ecosystem.

Identity & Tone Rules:
- You are THRN. Never identify yourself as ChatGPT, Claude, OpenAI, or a generic assistant.
- Never state that OpenAI or any third party owns or operates THRN.
- If asked what powers you, explain that THRN is an AI marketing intelligence platform built by the THRN team.
- Maintain a sharp, executive, senior-marketer persona: clear, pragmatic, analytical, and actionable. Avoid fluff, platitudes, or textbook summaries.
- Focus directly on solving the user's specific growth problem (GTM strategy, funnel audits, CAC/LTV bottlenecks, messaging & positioning, content flywheels, pricing strategy, retention, and AEO/AIO AI visibility).
- Return cleanly formatted answers with bullet points and bold highlights when appropriate. Never output system debug tokens or role labels like 'SYSTEM:' or 'ASSISTANT:'.`;

function getMessageText(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((block) => (typeof block?.text === "string" ? block.text : ""))
      .join("");
  }
  return "";
}

function isSimpleGreeting(text: string): boolean {
  return /^(hi|hello|hey|hiya|howdy|good\s+(morning|afternoon|evening))(?:[!,.\s]*(?:thrn|there))?[!,.\s]*$/i.test(
    text.trim()
  );
}

function cleanApiKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['\"]|['\"]$/g, "");
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };

  try {
    const body: Record<string, unknown> = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const messages: ChatMessage[] = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : [];
    const mode = typeof body.mode === "string" ? body.mode : "consult";
    const customSystem = typeof body.system === "string" ? body.system : "";

    const validMessages = messages.filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        (typeof m.content === "string" || Array.isArray(m.content))
    );

    const latestUserMessage = [...validMessages].reverse().find((m) => m.role === "user");
    const latestUserText = latestUserMessage ? getMessageText(latestUserMessage).trim() : "";

    if (isSimpleGreeting(latestUserText)) {
      const greeting =
        mode === "audit"
          ? "Hi! I'm THRN in Audit mode. Tell me what metrics or funnel data you're seeing, and I'll diagnose the highest-leverage leaks."
          : mode === "plan"
          ? "Hi! I'm THRN in Plan mode. Share your marketing objective, timeline, and constraints, and I'll build you an executable roadmap."
          : "Hi! I'm THRN — your AI marketing consultant. Tell me what you're working on, and I'll ask the right questions before tailoring a growth strategy.";

      return new Response(JSON.stringify({ answer: greeting, content: greeting }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let modeInstruction = "";
    if (mode === "audit") {
      modeInstruction = "\nYou are in AUDIT mode. Scrutinize the user's data, conversion funnel, landing page, or messaging rigorously before recommending high-impact interventions.";
    } else if (mode === "plan") {
      modeInstruction = "\nYou are in PLAN mode. Deliver a structured, chronological, prioritized roadmap with clear milestones, owners, and KPI targets.";
    }

    const systemPrompt = `${THRN_IDENTITY}\n${modeInstruction}\n${customSystem}`.trim();

    const contents = validMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: getMessageText(m) }],
    }));

    if (contents.length === 0 && latestUserText) {
      contents.push({ role: "user", parts: [{ text: latestUserText }] });
    }

    // Cloudflare Pages exposes the secret as GEMINI_API_KEY.
    // Trim accidental whitespace/quotes from dashboard copy-paste.
    const apiKey = cleanApiKey(env.GEMINI_API_KEY);

    if (!apiKey) {
      const demoResponse =
        "THRN AI Engine: GEMINI_API_KEY is not available to this production function. Check the Cloudflare Pages Production environment and redeploy.";
      return new Response(JSON.stringify({ answer: demoResponse, content: demoResponse }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const payload = {
      system_instruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
    };

    // Gemini 3.7 Flash is the current THRN engine. Gemini 3.x does not use
    // the legacy temperature/top_p/top_k generation parameters.
    const modelsToTry = ["gemini-3.7-flash", "gemini-2.5-flash-lite", "gemini-2.5-flash"];
    let res: Response | null = null;
    let lastErrorText = "";

    for (const model of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) break;
        lastErrorText = `${res.status} ${await res.text().catch(() => "")}`;
      } catch (fetchErr) {
        lastErrorText = String(fetchErr);
      }
    }

    if (!res || !res.ok) {
      console.error("[Cloudflare /api/chat] Gemini API error:", lastErrorText);
      const fallbackMsg = "THRN: The AI engine is currently unavailable. The API key is reaching Cloudflare, but Gemini rejected the generation request. Please try again after the deployment finishes.";
      return new Response(
        JSON.stringify({
          error: { code: "ai_error", message: fallbackMsg },
          answer: fallbackMsg,
          content: fallbackMsg,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const answer =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I'm here to help you structure your marketing strategy.";

    return new Response(JSON.stringify({ answer, content: answer }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: unknown) {
    console.error("[Cloudflare /api/chat] Execution error:", err);
    return new Response(
      JSON.stringify({
        error: { code: "ai_error", message: "THRN encountered an unexpected issue. Please try again." },
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
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
