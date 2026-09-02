import React, { useState, useEffect, useRef } from 'react';
import { ChatHeader } from './components/ChatHeader';
import { MessageItem } from './components/MessageItem';
import { PromptStarters } from './components/PromptStarters';
import { ChatInput } from './components/ChatInput';
import { GrowthAuditCard } from './components/GrowthAuditCard';
import { ChatMessage, ConsultantMode } from './types';
import { Sparkles, Compass, ShieldAlert, ArrowDown } from 'lucide-react';

const AIO_AEO_FRAMEWORK = `THRN FRAMEWORK FRM-AIO-AEO-013 — AIO/AEO RISK ASSESSMENT

Use this framework only when Audit Mode is active and the user's query concerns AI visibility, generative search visibility, citation loss, brand exclusion, disappearing from AI recommendations, AIO/AEO, or traffic loss plausibly related to AI search.

Objective: Diagnose whether AI systems can access, understand, extract, trust, and recommend the brand.

PHASE 1 — AI ACCESSIBILITY & DATA GROUNDING
- Check robots.txt for accidental blocking of relevant AI crawlers such as GPTBot, ClaudeBot, Google-Extended, and PerplexityBot.
- Check entity consistency across authoritative sources such as Wikidata, Wikipedia, Crunchbase, official social profiles, and reputable industry directories.
- Check Organization, Product, and Author JSON-LD on relevant pages.
- Treat these as risk signals, not guaranteed causes. Do not claim that AI systems use a universal confidence score or deterministic filtering mechanism.

PHASE 2 — INFORMATION EXTRACTION & FORMATTING
- Check whether important pages are easy to scan and extract: short sections, bullets, tables, clear terminology, and useful structure.
- Check whether H2/H3 headings match real conversational questions and search intent rather than vague creative teasers.
- Check whether important informational pages place a concise direct answer near the relevant question (an AEO Snapshot, typically around 40–60 words when appropriate).
- Treat structured formatting as an extraction/readability advantage, not a guaranteed ranking or citation factor.

PHASE 3 — SENTIMENT & AUTHORITY VALIDATION
- Check off-site evidence across relevant review and community channels such as Reddit, Quora, G2, Trustpilot, and relevant industry sources.
- Check whether the brand is repeatedly mentioned alongside category leaders and competitors in credible content, PR, reviews, and industry discussions.
- Assess whether the public evidence supports the brand's category association and recommendation potential.

DIAGNOSTIC SEQUENCE
Start with these three questions before prescribing a large remediation plan:
1. Have you explicitly blocked AI crawlers in robots.txt, or updated your JSON-LD/schema markup in the last 12 months?
2. When you ask Perplexity, ChatGPT, or another generative search system to recommend a solution in your niche, does your brand appear? If yes, what does it say about you?
3. Is your primary content mostly long-form narrative, or does it use structured Q&A sections, tables, bullets, and concise direct answers?

After the user answers, map the evidence to Phase 1, 2, and 3, identify the highest-probability risk areas, distinguish verified facts from hypotheses, and recommend the next diagnostic actions. Do not pretend THRN has direct access to private crawler logs, proprietary AI ranking signals, or hidden model confidence scores unless the user provides that evidence.`;

const MODE_GREETINGS: Record<ConsultantMode, string> = {
  consult:
    "Hi, I'm **THRN** — your senior marketing intelligence consultant. Tell me what growth milestone or marketing challenge you're navigating, and I'll isolate the root constraint before recommending a high-conviction strategy.",
  audit:
    "**THRN Audit Mode** active. I diagnose before prescribing. Share your funnel metrics, CAC, landing page copy, or churn rates, and I'll identify the highest-leverage leaks to investigate.",
  plan:
    "**THRN Growth Roadmap Mode** active. Give me your North Star objective, timeframe, and team bandwidth, and I will structure a practical, chronological roadmap with weekly milestones.",
};

export default function App() {
  const [currentMode, setCurrentMode] = useState<ConsultantMode>('consult');
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: 'initial-greeting',
        role: 'assistant',
        content: MODE_GREETINGS.consult,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: 'consult',
      },
    ];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 180);
  };

  const handleSelectMode = (mode: ConsultantMode) => {
    if (mode === currentMode) return;
    setCurrentMode(mode);

    const newGreeting: ChatMessage = {
      id: `mode-switch-${Date.now()}`,
      role: 'assistant',
      content: MODE_GREETINGS[mode],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode,
    };
    setMessages((prev) => [...prev, newGreeting]);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `greeting-${Date.now()}`,
        role: 'assistant',
        content: MODE_GREETINGS[currentMode],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: currentMode,
      },
    ]);
  };

  const handleSendMessage = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || isLoading) return;

    const userMessageId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode: currentMode,
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const payloadMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const isAioAeoQuery =
        currentMode === 'audit' &&
        /\b(AIO|AEO|AI\s+(?:search|visibility|engine|overview|recommendation)|generative\s+search|ChatGPT|Perplexity|Claude|AI\s+crawler|citation(?:s)?|brand\s+(?:visibility|exclusion)|AI\s+traffic)\b/i.test(
          queryText
        );

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: payloadMessages,
          mode: currentMode,
          ...(isAioAeoQuery ? { system: AIO_AEO_FRAMEWORK } : {}),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok && !data) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const responseText =
        data?.answer ||
        data?.content ||
        data?.message ||
        data?.error?.message ||
        "I've processed your query. Let's dig deeper into your audience profile and primary acquisition channel.";

      const assistantMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: currentMode,
        isError: !!data?.error && !data?.answer,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('[THRN Chat] Connectivity error:', err);
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `**Connection Notice:** I encountered a temporary network delay reaching the backend engine (${err?.message || 'Network error'}). Please verify your connection or click **Retry** below.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        mode: currentMode,
        isError: true,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetryLastMessage = () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      handleSendMessage(lastUserMsg.content);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#08090e] text-[#e6e8ee] overflow-hidden">
      <ChatHeader
        currentMode={currentMode}
        onSelectMode={handleSelectMode}
        onClearChat={handleClearChat}
        messageCount={messages.length}
      />

      <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto px-3 sm:px-6 relative overflow-hidden">
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pt-4 pb-6 pr-1 space-y-2 scroll-smooth"
        >
          <div className="mb-4">
            <GrowthAuditCard
              onInjectAudit={(text) => handleSendMessage(text)}
              disabled={isLoading}
            />
          </div>

          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              onRetry={msg.isError ? handleRetryLastMessage : undefined}
            />
          ))}

          {isLoading && (
            <div className="flex items-center space-x-3 my-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#f2ba53] to-[#b37a1f] flex items-center justify-center text-[#0d0f17] font-bold shadow-md shadow-[#f2ba53]/10">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="bg-[#121520] border border-[#202538] rounded-2xl rounded-tl-sm px-4 py-3 text-xs text-neutral-400 flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#f2ba53] animate-ping" />
                <span className="text-neutral-300 font-medium">
                  THRN is analyzing your marketing architecture with Gemini...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {showScrollBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-36 right-6 p-2 rounded-full bg-[#1e2436] border border-[#2e3752] text-[#f2ba53] hover:bg-[#28314a] shadow-lg transition-all z-20 cursor-pointer"
            title="Scroll to latest message"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}

        <div className="pt-2 pb-4 bg-gradient-to-t from-[#08090e] via-[#08090e] to-transparent">
          <PromptStarters
            currentMode={currentMode}
            onSelectPrompt={(query) => handleSendMessage(query)}
            disabled={isLoading}
          />

          <div className="mt-1">
            <ChatInput
              input={input}
              setInput={setInput}
              onSend={() => handleSendMessage()}
              isLoading={isLoading}
              currentMode={currentMode}
            />
          </div>

          <div className="text-center mt-2">
            <p className="text-[11px] text-neutral-500">
              Powered by Google Gemini 3.7 Flash & THRN Marketing Frameworks. Actionable growth advisory.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
