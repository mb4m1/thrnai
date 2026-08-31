import React, { useRef, useEffect } from 'react';
import { Send, Sparkles, CornerDownLeft, Loader2, Paperclip } from 'lucide-react';
import { ConsultantMode } from '../types';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  isLoading: boolean;
  currentMode: ConsultantMode;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  input,
  setInput,
  onSend,
  isLoading,
  currentMode,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on text content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 180)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSend();
      }
    }
  };

  const getPlaceholder = () => {
    switch (currentMode) {
      case 'audit':
        return 'Describe your metrics (e.g., CAC, conversion rates, drop-off points) for a diagnostic audit...';
      case 'plan':
        return 'Specify your growth goals, budget, timeframe, and team size for a tailored roadmap...';
      case 'consult':
      default:
        return 'Ask THRN about positioning, growth plateau, pricing, or go-to-market strategy...';
    }
  };

  return (
    <div className="relative rounded-2xl bg-[#121520] border border-[#23293d] focus-within:border-[#f2ba53]/60 focus-within:ring-1 focus-within:ring-[#f2ba53]/30 transition-all shadow-xl">
      <div className="p-3 pb-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={getPlaceholder()}
          disabled={isLoading}
          rows={1}
          className="w-full bg-transparent text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none resize-none min-h-[44px] max-h-[180px] leading-relaxed"
        />
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-t border-white/5 bg-[#0e111a]/60 rounded-b-2xl">
        <div className="flex items-center space-x-2 text-[11px] text-neutral-400">
          <span className="hidden sm:inline font-mono text-[10px] bg-white/5 px-1.5 py-0.5 rounded border border-white/5">
            Shift + Enter for new line
          </span>
          <span className="text-[#f2ba53]/70 font-medium capitalize">
            {currentMode} Mode Active
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onSend}
            disabled={!input.trim() || isLoading}
            className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl font-medium text-xs transition-all ${
              input.trim() && !isLoading
                ? 'bg-[#f2ba53] text-[#0d0f17] hover:bg-[#ffc866] shadow-md shadow-[#f2ba53]/20 font-semibold cursor-pointer'
                : 'bg-[#1b202e] text-neutral-500 cursor-not-allowed border border-white/5'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing...</span>
              </>
            ) : (
              <>
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
