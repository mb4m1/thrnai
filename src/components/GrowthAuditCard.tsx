import React, { useState } from 'react';
import { BarChart3, ArrowRight, Activity, Percent, DollarSign, Users } from 'lucide-react';

interface GrowthAuditCardProps {
  onInjectAudit: (auditText: string) => void;
  disabled?: boolean;
}

export const GrowthAuditCard: React.FC<GrowthAuditCardProps> = ({
  onInjectAudit,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [businessType, setBusinessType] = useState('B2B SaaS');
  const [cac, setCac] = useState('');
  const [conversionRate, setConversionRate] = useState('');
  const [churnRate, setChurnRate] = useState('');

  const handleGenerateAudit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = `Perform an in-depth marketing audit for our ${businessType} business with the following live metrics:
- Customer Acquisition Cost (CAC): ${cac ? `$${cac}` : 'Not provided'}
- Visitor-to-Lead/Trial Conversion Rate: ${conversionRate ? `${conversionRate}%` : 'Not provided'}
- Monthly Churn / Retention Decay: ${churnRate ? `${churnRate}%` : 'Not provided'}

Please:
1. Benchmark these numbers against top-quartile industry metrics.
2. Identify the highest-risk drop-off point in our funnel.
3. Prescribe 3 high-leverage corrective initiatives.`;

    onInjectAudit(prompt);
    setIsOpen(false);
  };

  return (
    <div className="rounded-2xl bg-[#11141f] border border-[#1f2538] p-4 shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-[#f2ba53]/10 border border-[#f2ba53]/20 text-[#f2ba53]">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Quick Metrics Diagnostic</h3>
            <p className="text-xs text-neutral-400">
              Benchmark your CAC, conversion, and churn with Gemini
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-xs text-[#f2ba53] hover:text-[#ffc866] font-medium transition-colors"
        >
          {isOpen ? 'Close' : 'Configure Metrics'}
        </button>
      </div>

      {isOpen && (
        <form onSubmit={handleGenerateAudit} className="mt-4 pt-3 border-t border-white/5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                Business Model
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full bg-[#181d2c] border border-[#28314a] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f2ba53]/60"
              >
                <option value="B2B SaaS">B2B SaaS</option>
                <option value="DTC / E-Commerce">DTC / E-Commerce</option>
                <option value="Marketplace">Marketplace</option>
                <option value="Mobile App">Mobile App / Consumer</option>
                <option value="Agency / Services">Agency / Services</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                Estimated CAC ($)
              </label>
              <input
                type="number"
                placeholder="e.g. 150"
                value={cac}
                onChange={(e) => setCac(e.target.value)}
                className="w-full bg-[#181d2c] border border-[#28314a] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f2ba53]/60 placeholder-neutral-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                Trial / Landing Conversion (%)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 2.8"
                value={conversionRate}
                onChange={(e) => setConversionRate(e.target.value)}
                className="w-full bg-[#181d2c] border border-[#28314a] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f2ba53]/60 placeholder-neutral-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                Monthly Churn Rate (%)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="e.g. 4.5"
                value={churnRate}
                onChange={(e) => setChurnRate(e.target.value)}
                className="w-full bg-[#181d2c] border border-[#28314a] rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#f2ba53]/60 placeholder-neutral-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={disabled}
              className="flex items-center space-x-1.5 bg-[#f2ba53] hover:bg-[#ffc866] text-[#0d0f17] px-3.5 py-1.5 rounded-xl font-semibold text-xs transition-colors shadow-md shadow-[#f2ba53]/20 disabled:opacity-50 cursor-pointer"
            >
              <span>Run Funnel Diagnosis</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
