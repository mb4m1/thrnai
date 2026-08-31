import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { renderThrnDocument } from "./src/renderDocument.ts";

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY || "";
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return genAIClient;
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

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<Record<string, unknown>>;
}

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

// ── API ROUTES ─────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// AI Chat Route supporting both SSE Streaming and JSON
app.post("/api/chat", async (req, res) => {
  try {
    const body = req.body || {};
    const messages: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];
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

      // If client requests SSE stream
      const acceptHeader = req.headers.accept || "";
      if (acceptHeader.includes("text/event-stream")) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        const event = { type: "content_block_delta", delta: { type: "text_delta", text: greeting } };
        res.write(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`);
        return res.end();
      }

      return res.json({ answer: greeting, content: greeting });
    }

    let modeInstruction = "";
    if (mode === "audit") {
      modeInstruction = "\nYou are in AUDIT mode. Scrutinize the user's data, conversion funnel, landing page, or messaging rigorously before recommending high-impact interventions.";
    } else if (mode === "plan") {
      modeInstruction = "\nYou are in PLAN mode. Deliver a structured, chronological, prioritized roadmap with clear milestones, owners, and KPI targets.";
    }

    const systemPrompt = `${THRN_IDENTITY}\n${modeInstruction}\n${customSystem}`.trim();

    // Format conversation history for Gemini
    const contents = validMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: getMessageText(m) }],
    }));

    if (contents.length === 0 && latestUserText) {
      contents.push({ role: "user", parts: [{ text: latestUserText }] });
    }

    const isSSE = (req.headers.accept || "").includes("text/event-stream");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      const fallbackResponse =
        mode === "audit"
          ? "In AUDIT mode, we scrutinize your funnel from initial impression to retention. To diagnose your bottleneck: 1) What is your primary traffic source, 2) Where is the steepest drop-off in conversion, and 3) What is your current CAC vs. payback window?"
          : mode === "plan"
          ? "In PLAN mode, we structure actionable growth roadmaps. To build your plan: 1) What is your primary 30-day North Star metric, 2) What are your existing channels, and 3) What is your weekly team bandwidth/budget?"
          : "To build a high-leverage marketing strategy: 1) What is your core value proposition and wedge against incumbents? 2) Who is your ideal customer profile (ICP)? 3) Which distribution channels have shown early traction?";

      if (isSSE) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        const event = {
          type: "content_block_delta",
          delta: { type: "text_delta", text: fallbackResponse },
        };
        res.write(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`);
        return res.end();
      }

      return res.json({
        answer: fallbackResponse,
        content: fallbackResponse,
      });
    }

    const ai = getGenAI();

    if (isSSE) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");

      try {
        const responseStream = await ai.models.generateContentStream({
          model: "gemini-3.7-flash",
          contents,
          config: {
            systemInstruction: systemPrompt,
            temperature: 0.5,
          },
        });

        for await (const chunk of responseStream) {
          const chunkText = chunk.text;
          if (chunkText) {
            const event = {
              type: "content_block_delta",
              delta: { type: "text_delta", text: chunkText },
            };
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        }

        res.write(`data: [DONE]\n\n`);
        res.end();
      } catch (streamError) {
        console.error("[api/chat] Gemini streaming error:", streamError);
        const fallbackText = "I'm analyzing your request. Based on senior growth principles, let's isolate your core constraint: what is your primary acquisition channel, current conversion rate, and target CAC/LTV ratio?";
        const event = {
          type: "content_block_delta",
          delta: { type: "text_delta", text: fallbackText },
        };
        res.write(`data: ${JSON.stringify(event)}\n\ndata: [DONE]\n\n`);
        res.end();
      }
    } else {
      const generatePromise = ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.5,
        },
      });

      const timeoutPromise = new Promise<{ text?: string }>((resolve) => {
        setTimeout(() => {
          resolve({
            text: "Based on senior marketing analysis: when growth plateaus, we first isolate whether it's an acquisition constraint (top-of-funnel saturation/CAC spike), conversion leak (landing page/onboarding friction), or retention decay (net revenue churn). What does your current cohort retention curve look like?",
          });
        }, 12000);
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const responseText = response.text || "I'm here to help with your marketing strategy.";
      return res.json({
        answer: responseText,
        content: responseText,
      });
    }
  } catch (error: any) {
    console.error("[api/chat] Error handling chat:", error);
    return res.status(500).json({
      error: { code: "ai_error", message: "THRN couldn't reach the AI engine right now. Please try again." },
    });
  }
});

// Contact Form Route
app.post("/api/contact", (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email, and message are required." });
  }

  console.log(`[contact] New message from ${name} <${email}>: ${String(message).substring(0, 100)}...`);
  return res.json({ ok: true, message: "Thank you for reaching out. We will get back to you within one business day." });
});

// Auth endpoints
app.get("/auth/me", (req, res) => {
  res.json({ authenticated: false, user: null });
});

app.get("/auth/google", (req, res) => {
  res.redirect("/");
});

app.get("/auth/logout", (req, res) => {
  res.redirect("/");
});

// ── SERVING THRN APPLICATION ──────────────────────────────────────────────

// Serve THRN interactive landing page on root
app.get("/", (req, res) => {
  const doc = renderThrnDocument();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(doc);
});

// Setup Vite middleware in dev or static serving in production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`THRN AI Server running on http://localhost:${PORT}`);
  });
}

startServer();
