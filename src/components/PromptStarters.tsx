import React from 'react';
import { Compass, TrendingUp, DollarSign, Target, Activity, Zap, FileText } from 'lucide-react';
import { ConsultantMode, PromptPill } from '../types';

interface PromptStartersProps {
  currentMode: ConsultantMode;
  onSelectPrompt: (query: string) => void;
  disabled?: boolean;
}

export const PromptStarters: React.FC<PromptStartersProps> = ({
  currentMode,
  onSelectPrompt,
  disabled,
}) => {
  const modePills: Record<ConsultantMode, PromptPill[]> = {
    consult: [
      {
        label: 'GTM Strategy',
        query: 'Help me build a go-to-market strategy for a B2B SaaS tool. Ask me what you need first before prescribing.',
        category: 'Strategy',
      },
      {
        label: 'Growth Plateau',
        query: 'Our growth has plateaued for the past 3 months. Help me isolate the root cause and build an intervention plan.',
        category: 'Diagnostic',
      },
      {
        label: 'Positioning Wedge',
        query: 'How do I position our new product against well-funded incumbents with 10x larger marketing budgets?',
        category: 'Positioning',
      },
      {
        label: 'Value Pricing',
        query: 'Help me design a value-metric pricing model with tiered expansion triggers for our software product.',
        category: 'Monetization',
      },
    ],
    audit: [
      {
        label: 'Funnel Leak Audit',
        query: 'Audit our acquisition funnel: CAC has increased by 40% while trial-to-paid conversion dropped. Where do we look?',
        category: 'Acquisition',
      },
      {
        label: 'Landing Page Teardown',
        query: 'Audit our homepage copy and conversion architecture. What are the top 3 friction points causing bounce?',
        category: 'Conversion',
      },
      {
        label: 'Churn & Retention Audit',
        query: 'Our month-1 cohort churn is 12%. Analyze our onboarding and activation metrics to pinpoint retention decay.',
        category: 'Retention',
      },
      {
        label: 'Channel ROI Audit',
        query: 'Help me audit paid search vs content vs outbound SDR channels to reallocate quarterly marketing budget.',
        category: 'Budget',
      },
    ],
    plan: [
      {
        label: '30-Day Growth Sprint',
        query: 'Build me a 30-day growth sprint plan prioritizing 3 highest-ROI experiments with weekly milestones.',
        category: 'Roadmap',
      },
      {
        label: 'Product Launch Plan',
        query: 'Create a comprehensive 4-week launch sequence (tease, launch day, post-launch momentum) for our new feature.',
        category: 'Launch',
      },
      {
        label: 'Organic Content Engine',
        query: 'Design a 60-day SEO and high-intent content engine blueprint with measurable pipeline attribution.',
        category: 'Organic',
      },
      {
        label: 'Self-Serve Conversion Plan',
        query: 'Develop a step-by-step optimization plan to lift free-to-paid activation rates by 25%.',
        category: 'Product-Led',
      },
    ],
  };

  const pills = modePills[currentMode] || modePills.consult;

  return (
    <div className="py-2">
      <div className="flex items-center space-x-2 mb-2 px-1 text-xs text-neutral-400 font-medium">
        <Zap className="w-3.5 h-3.5 text-[#f2ba53]" />
        <span>Suggested Strategy Prompts</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {pills.map((pill, index) => (
          <button
            key={index}
            onClick={() => onSelectPrompt(pill.query)}
            disabled={disabled}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#141824] hover:bg-[#1f2638] border border-[#232b40] hover:border-[#f2ba53]/40 text-neutral-300 hover:text-white text-xs transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed group text-left"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#f2ba53] group-hover:scale-125 transition-transform" />
            <span className="font-medium">{pill.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
