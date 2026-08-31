import React, { useState } from 'react';
import { Copy, Check, Sparkles, User, AlertCircle, RefreshCw } from 'lucide-react';
import { ChatMessage } from '../types';

interface MessageItemProps {
  message: ChatMessage;
  onRetry?: () => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, onRetry }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to format text with Markdown bolding, bullets, and paragraphs
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      // Empty lines
      if (!line.trim()) {
        return <div key={idx} className="h-2.5" />;
      }

      // Check for headings: ### or ## or #
      if (line.startsWith('### ')) {
        return (
          <h4 key={idx} className="font-semibold text-base text-[#f2ba53] mt-2 mb-1">
            {line.replace('### ', '')}
          </h4>
        );
      }
      if (line.startsWith('## ') || line.startsWith('# ')) {
        return (
          <h3 key={idx} className="font-bold text-lg text-[#f2ba53] mt-3 mb-1.5 border-b border-[#2a2f42]/40 pb-1">
            {line.replace(/^#+\s/, '')}
          </h3>
        );
      }

      // Bullet points (- or *)
      if (/^[\*\-]\s+/.test(line)) {
        const itemText = line.replace(/^[\*\-]\s+/, '');
        return (
          <div key={idx} className="flex items-start space-x-2 my-1 text-neutral-200">
            <span className="text-[#f2ba53] font-bold mt-1 text-xs">•</span>
            <span className="flex-1 leading-relaxed">{renderBoldText(itemText)}</span>
          </div>
        );
      }

      // Numbered lists (e.g., 1. or 2.)
      const numMatch = line.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        return (
          <div key={idx} className="flex items-start space-x-2 my-1.5 text-neutral-200">
            <span className="font-semibold text-[#f2ba53] min-w-[20px] text-sm">
              {numMatch[1]}.
            </span>
            <span className="flex-1 leading-relaxed">{renderBoldText(numMatch[2])}</span>
          </div>
        );
      }

      // Standard paragraph
      return (
        <p key={idx} className="leading-relaxed text-neutral-200 my-1">
          {renderBoldText(line)}
        </p>
      );
    });
  };

  // Helper to convert **text** to strong tags
  const renderBoldText = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  return (
    <div
      className={`flex items-start gap-3.5 my-3.5 group ${
        isUser ? 'flex-row-reverse justify-start' : 'justify-start'
      }`}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
          isUser
            ? 'bg-[#1e2333] border-[#2f3750] text-[#f2ba53]'
            : message.isError
            ? 'bg-red-500/10 border-red-500/30 text-red-400'
            : 'bg-gradient-to-br from-[#f2ba53] to-[#b37a1f] text-[#0d0f17] font-bold border-[#f2ba53]/50 shadow-md shadow-[#f2ba53]/10'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : message.isError ? (
          <AlertCircle className="w-4 h-4" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={`relative max-w-[85%] sm:max-w-[78%] rounded-2xl p-4 text-sm shadow-lg ${
          isUser
            ? 'bg-[#181d2c] border border-[#273048] text-white rounded-tr-sm'
            : message.isError
            ? 'bg-[#1c1214] border border-red-500/30 text-red-200 rounded-tl-sm'
            : 'bg-[#121520] border border-[#202538] text-neutral-200 rounded-tl-sm'
        }`}
      >
        {/* Header Tag in Bubble */}
        <div className="flex items-center justify-between gap-3 mb-1.5 pb-1 border-b border-white/5 text-[11px] text-neutral-400">
          <div className="flex items-center space-x-2">
            <span className="font-semibold tracking-wide text-neutral-300">
              {isUser ? 'You' : 'THRN Advisor'}
            </span>
            {message.mode && (
              <span className="uppercase text-[10px] px-1.5 py-0.2 rounded bg-white/5 text-[#f2ba53] border border-white/5">
                {message.mode}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <span>{message.timestamp}</span>
            {isAssistant && !message.isError && (
              <button
                onClick={handleCopy}
                className="opacity-60 hover:opacity-100 p-1 rounded hover:bg-white/10 transition-opacity"
                title="Copy response"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="prose prose-invert max-w-none text-[13.5px] leading-relaxed">
          {renderFormattedContent(message.content)}
        </div>

        {/* Error Retry Option */}
        {message.isError && onRetry && (
          <div className="mt-3 pt-2 border-t border-red-500/20 flex items-center justify-between">
            <span className="text-xs text-red-400">Need to reconnect with the engine?</span>
            <button
              onClick={onRetry}
              className="flex items-center space-x-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-2.5 py-1 rounded-lg transition-colors border border-red-500/30"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
