import React from 'react';
import { Sparkles, Trash2, ArrowUpRight, Compass, Search, Calendar, ShieldCheck } from 'lucide-react';
import { ConsultantMode } from '../types';

interface ChatHeaderProps {
  currentMode: ConsultantMode;
  onSelectMode: (mode: ConsultantMode) => void;
  onClearChat: () => void;
  messageCount: number;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  currentMode,
  onSelectMode,
  onClearChat,
  messageCount,
}) => {
  const modes: { id: ConsultantMode; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: 'consult',
      label: 'Consult & Strategy',
      icon: <Compass className="w-4 h-4" />,
      desc: 'Deep diagnostic & positioning',
    },
    {
      id: 'audit',
      label: 'Funnel Audit',
      icon: <Search className="w-4 h-4" />,
      desc: 'Find leaks in CAC & conversion',
    },
    {
      id: 'plan',
      label: 'Growth Roadmap',
      icon: <Calendar className="w-4 h-4" />,
      desc: '30/60/90-day actionable plan',
    },
  ];

  return (
    <header className="border-b border-[#1f2330] bg-[#0c0e15]/90 backdrop-blur-md sticky top-0 z-30 px-4 py-3.5 sm:px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3.5">
        {/* Brand & Live Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#f2ba53] to-[#b37a1f] p-[1.5px] flex items-center justify-center shadow-lg shadow-[#f2ba53]/10">
              <div className="w-full h-full bg-[#0d0f17] rounded-[10px] flex items-center justify-center font-bold text-[#f2ba53] text-sm tracking-wider">
                T
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-white tracking-wide text-base">THRN</span>
                <span className="text-[11px] font-medium tracking-wider text-[#f2ba53] uppercase px-1.5 py-0.5 rounded bg-[#f2ba53]/10 border border-[#f2ba53]/20">
                  Intelligence
                </span>
              </div>
              <p className="text-xs text-neutral-400 font-normal">
                Senior Marketing Consultant AI
              </p>
            </div>
          </div>

          {/* Mobile status & clear */}
          <div className="flex md:hidden items-center space-x-2">
            <div className="flex items-center space-x-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Gemini Live</span>
            </div>
            {messageCount > 1 && (
              <button
                onClick={onClearChat}
                title="Clear conversation"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1.5 bg-[#131722] p-1 rounded-xl border border-[#222738] overflow-x-auto no-scrollbar">
          {modes.map((mode) => {
            const isActive = currentMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => onSelectMode(mode.id)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-[#f2ba53] text-[#0d0f17] shadow-sm font-semibold'
                    : 'text-neutral-300 hover:text-white hover:bg-[#1c2233]'
                }`}
              >
                {mode.icon}
                <span>{mode.label}</span>
              </button>
            );
          })}
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Gemini AI Connected</span>
          </div>

          {messageCount > 1 && (
            <button
              onClick={onClearChat}
              className="flex items-center space-x-1 text-xs text-neutral-400 hover:text-red-400 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
