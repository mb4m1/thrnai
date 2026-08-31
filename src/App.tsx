import React, { useState, useEffect, useRef } from 'react';
import { ChatHeader } from './components/ChatHeader';
import { MessageItem } from './components/MessageItem';
import { PromptStarters } from './components/PromptStarters';
import { ChatInput } from './components/ChatInput';
import { GrowthAuditCard } from './components/GrowthAuditCard';
import { ChatMessage, ConsultantMode } from './types';
import { Sparkles, Compass, ShieldAlert, ArrowDown } from 'lucide-react';

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

  // Auto scroll to bottom when messages update
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Track scroll position to show scroll-to-bottom helper button
  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 180);
  };

  // Change consultant mode
  const handleSelectMode = (mode: ConsultantMode) => {
    if (mode === currentMode) return;
    setCurrentMode(mode);

    // Add a context notification or switch greeting
    const newGreeting: ChatMessage = {
      id: `mode-switch-${Date.now()}`,
      role: 'assistant',
      content: MODE_GREETINGS[mode],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      mode,
    };
    setMessages((prev) => [...prev, newGreeting]);
  };

  // Reset conversation
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

  // Send message to Gemini backend
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
      // Format payload for /api/chat
      const payloadMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: payloadMessages,
          mode: currentMode,
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
    // Find the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      handleSendMessage(lastUserMsg.content);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#08090e] text-[#e6e8ee] overflow-hidden">
      {/* Top Header & Navigation */}
      <ChatHeader
        currentMode={currentMode}
        onSelectMode={handleSelectMode}
        onClearChat={handleClearChat}
        messageCount={messages.length}
      />

      {/* Main Chat Workspace */}
      <div className="flex-1 flex flex-col max-w-5xl w-full mx-auto px-3 sm:px-6 relative overflow-hidden">
        {/* Messages Stream */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pt-4 pb-6 pr-1 space-y-2 scroll-smooth"
        >
          {/* Quick Metrics Diagnostic Drawer */}
          <div className="mb-4">
            <GrowthAuditCard
              onInjectAudit={(text) => handleSendMessage(text)}
              disabled={isLoading}
            />
          </div>

          {/* Render All Messages */}
          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              onRetry={msg.isError ? handleRetryLastMessage : undefined}
            />
          ))}

          {/* Typing / Thinking Indicator */}
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

        {/* Scroll To Bottom Floating Button */}
        {showScrollBottom && (
          <button
            onClick={() => scrollToBottom(true)}
            className="absolute bottom-36 right-6 p-2 rounded-full bg-[#1e2436] border border-[#2e3752] text-[#f2ba53] hover:bg-[#28314a] shadow-lg transition-all z-20 cursor-pointer"
            title="Scroll to latest message"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
        )}

        {/* Bottom Input & Suggestions Area */}
        <div className="pt-2 pb-4 bg-gradient-to-t from-[#08090e] via-[#08090e] to-transparent">
          {/* Prompt Starters */}
          <PromptStarters
            currentMode={currentMode}
            onSelectPrompt={(query) => handleSendMessage(query)}
            disabled={isLoading}
          />

          {/* Interactive Input Bar */}
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
