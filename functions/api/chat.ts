interface Env {
  GEMINI_API_KEY?: string;
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
    return message.content.map((block) => typeof block?.text === "string" ? block.text : "").join("");
  }
  return "";
}

function cleanKey(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['\"]|['\"]$/g, "");
}

function buildGeminiContents(messages: ChatMessage[]) {
  // The THRN UI intentionally displays an initial assistant greeting. That
  // greeting must NOT be sent as the first Gemini model turn.
  const source = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      text: textOf(m).trim(),
    }))
    .filter((m) => m.text.length > 0);

  while (source.length && source[0].role === "model") source.shift();

  // Gemini requires alternating user/model turns. Merge consecutive turns
  // instead of sending invalid duplicate roles.
  const merged: Array<{ role: "user" | "model"; text: string }> = [];
  for (const item of source) {
    const previous = merged[merged.length - 1];
    if (previous && previous.role === item.role) {
      previous.text += `\n\n${item.text}`;
    } else {
      merged.push({ ...item });
    }
  }

  // A generateContent request must be driven by a user turn. If the UI has
  // a trailing assistant message, remove it; it is not a new user prompt.
  while (merged.length && merged[merged.length - 1].role === "model") merged.pop();

  return merged.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const messages = Array.isArray(body.messages) ? body.messages as ChatMessage[] : [];
    const mode = typeof body.mode === "string" ? body.mode : "consult";
    const customSystem = typeof body.system === "string" ? body.system : "";

    const contents = buildGeminiContents(messages);
    const apiKey = cleanKey(env.GEMINI_API_KEY);

    if (!apiKey) {
      const message = "THRN: GEMINI_API_KEY is not available to this production function. Check the Cloudflare Production secret and redeploy.";
      return new Response(JSON.stringify({ answer: message, content: message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!contents.length || contents[contents.length - 1].role !== "user") {
      const message = "THRN: Please enter a marketing question to begin the consultation.";
      return new Response(JSON.stringify({ answer: message, content: message }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let modeInstruction = "";
    if (mode === "audit") {
      modeInstruction = " You are in AUDIT mode: rigorously diagnose the funnel, data, landing page, or messaging before recommending interventions.";
    } else if (mode === "plan") {
      modeInstruction = " You are in PLAN mode: produce a prioritized, chronological roadmap with milestones, owners, and KPI targets.";
    }

    const systemPrompt = `${THRN_IDENTITY}${modeInstruction}\n${customSystem}`.trim();
    const payload = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
    };

    // Keep Gemini 3.7 Flash as the primary THRN engine. If that model is
    // temporarily unavailable, use the current stable Flash fallback.
    const models = ["gemini-3.7-flash", "gemini-2.5-flash"];
    let lastError = "";

    for (const model of models) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
            body: JSON.stringify(payload),
          }
        );

        if (!response.ok) {
          lastError = `${response.status}: ${await response.text().catch(() => "")}`;
          continue;
        }

        const data = await response.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const answer = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim();

        if (answer) {
          return new Response(JSON.stringify({ answer, content: answer }), {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        lastError = "Gemini returned no text candidate.";
      } catch (error) {
        lastError = String(error);
      }
    }

    console.error("[THRN /api/chat] Gemini request failed:", lastError);
    const message = "THRN: The AI engine is temporarily unavailable. Please try again in a moment.";
    return new Response(JSON.stringify({
      error: { code: "ai_error", message },
      answer: message,
      content: message,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    console.error("[THRN /api/chat] Execution error:", error);
    const message = "THRN: The AI engine encountered an unexpected issue. Please try again.";
    return new Response(JSON.stringify({ error: { code: "ai_error", message }, answer: message, content: message }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
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
