import {
  runWorkersAIBinding,
  type WorkersAIBinding,
  type WorkersAITurn,
} from "./workersAI";

export interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface Env {
  AI?: WorkersAIBinding;
  AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ASSETS?: Fetcher;
  [key: string]: unknown;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<Record<string, unknown>>;
}

interface ContactBody {
  name?: string;
  email?: string;
  message?: string;
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

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH HANDLERS (OAuth & Session)
// ─────────────────────────────────────────────────────────────────────────────

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const key = parts[0]?.trim();
    if (key) {
      list[key] = decodeURIComponent((parts[1] || "").trim());
    }
  });
  return list;
}

async function handleAuth(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  // 1. Session check: /auth/me
  if (url.pathname === "/auth/me") {
    const cookies = parseCookies(request.headers.get("Cookie"));
    const sessionToken = cookies["thrn_session"];

    if (sessionToken) {
      try {
        const decoded = JSON.parse(atob(sessionToken));
        return new Response(JSON.stringify({ authenticated: true, user: decoded }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch {
        // invalid session token
      }
    }

    return new Response(JSON.stringify({ authenticated: false, user: null }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // 2. Google OAuth initialization: /auth/google
  if (url.pathname === "/auth/google" || url.pathname.startsWith("/auth/google")) {
    const clientId = env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      return Response.redirect(`${url.origin}/?auth_error=missing_client_id`, 302);
    }

    const redirectUri = `${url.origin}/auth/callback`;
    const scope = encodeURIComponent("openid email profile");
    const state = Math.random().toString(36).substring(2);

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${scope}&state=${state}&prompt=select_account`;

    return Response.redirect(googleAuthUrl, 302);
  }

  // 3. OAuth callback: /auth/callback
  if (url.pathname === "/auth/callback") {
    const code = url.searchParams.get("code");
    const clientId = env.GOOGLE_CLIENT_ID;
    const clientSecret = env.GOOGLE_CLIENT_SECRET;

    if (!code || !clientId || !clientSecret) {
      return Response.redirect(`${url.origin}/?auth_error=missing_credentials`, 302);
    }

    try {
      const redirectUri = `${url.origin}/auth/callback`;
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        return Response.redirect(`${url.origin}/?auth_error=token_exchange_failed`, 302);
      }

      const tokenData = (await tokenRes.json()) as { access_token?: string; id_token?: string };
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        return Response.redirect(`${url.origin}/?auth_error=userinfo_failed`, 302);
      }

      const userData = (await userRes.json()) as { name?: string; email?: string; picture?: string };
      const sessionPayload = btoa(
        JSON.stringify({
          name: userData.name,
          email: userData.email,
          picture: userData.picture,
          loggedInAt: new Date().toISOString(),
        })
      );

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${url.origin}/`,
          "Set-Cookie": `thrn_session=${sessionPayload}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
        },
      });
    } catch {
      return Response.redirect(`${url.origin}/?auth_error=server_error`, 302);
    }
  }

  // 4. Logout: /auth/logout
  if (url.pathname === "/auth/logout") {
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${url.origin}/`,
        "Set-Cookie": `thrn_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    });
  }

  return Response.redirect(`${url.origin}/`, 302);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAT HANDLER (Cloudflare Workers AI — GPT-OSS)
// ─────────────────────────────────────────────────────────────────────────────

async function handleChat(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

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

    const turns: WorkersAITurn[] = validMessages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: getMessageText(m),
    }));

    if (turns.length === 0 && latestUserText) {
      turns.push({ role: "user", content: latestUserText });
    }

    const ai = env.AI as WorkersAIBinding | undefined;
    const answer = ai ? await runWorkersAIBinding(ai, systemPrompt, turns) : "";

    if (!answer) {
      const fallbackMsg = ai
        ? "THRN: The AI engine is temporarily unavailable. Please try again in a moment."
        : "THRN: The Workers AI binding is not available in this environment. Deploy the Worker with the AI binding enabled.";
      return new Response(
        JSON.stringify({
          error: { code: "ai_error", message: fallbackMsg },
          answer: fallbackMsg,
          content: fallbackMsg,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(JSON.stringify({ answer, content: answer }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (err: unknown) {
    console.error("[Cloudflare Worker /api/chat] Handler error:", err);
    return new Response(
      JSON.stringify({
        error: { code: "ai_error", message: "THRN encountered an unexpected issue. Please try again." },
      }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
}

async function handleContact(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as ContactBody;
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "Name, email, and message are required." }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Thank you for reaching out. We will get back to you within one business day.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request payload." }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Health check
    if (url.pathname === "/api/health") {
      return new Response(
        JSON.stringify({
          status: "ok",
          runtime: "cloudflare-worker",
          timestamp: new Date().toISOString(),
        }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 2. Chat endpoint
    if (url.pathname === "/api/chat" || url.pathname.startsWith("/api/chat")) {
      return handleChat(request, env);
    }

    // 3. Contact endpoint
    if (url.pathname === "/api/contact" || url.pathname.startsWith("/api/contact")) {
      return handleContact(request);
    }

    // 4. Auth endpoints
    if (url.pathname.startsWith("/auth/")) {
      return handleAuth(request, env);
    }

    // 5. Static Assets Fallback
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status !== 404) {
          return assetResponse;
        }
      } catch (assetErr) {
        console.error("[Worker] Asset fetch error:", assetErr);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};
