import React from 'react';
import { RotateCcw, Sliders, Sparkles } from 'lucide-react';
import { CurrencyCode, WhatIfEvaluationResponse } from '../types/domain';
import { formatCurrency } from '../utils/currency';

interface WhatIfSimulatorProps {
  baselineGuestCount: number;
  currency: CurrencyCode;
  whatIfGuests: number;
  whatIfBudget: number;
  whatIfDate: string;
  displayedPriorities: string[];
  simulating: boolean;
  whatIfResult: WhatIfEvaluationResponse | null;
  onGuestsChange: (guests: number) => void;
  onBudgetChange: (budget: number) => void;
  onDateChange: (dateStr: string) => void;
  onPromotePriority: (priority: string) => void;
  onRunWhatIf: () => void;
  onResetSandbox: () => void;
}

export const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = React.memo(
  ({
    baselineGuestCount,
    currency,
    whatIfGuests,
    whatIfBudget,
    whatIfDate,
    displayedPriorities,
    simulating,
    whatIfResult,
    onGuestsChange,
    onBudgetChange,
    onDateChange,
    onPromotePriority,
    onRunWhatIf,
    onResetSandbox,
  }) => {
    return (
      <section
        aria-label="What-If Constraint Simulator"
        className="bg-white rounded-2xl border-2 border-amber-500/40 shadow-sm p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-700" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Interactive What-If Constraint Simulator & Re-Balancer
              </h2>
              <p className="text-xs text-slate-600">
                Test changes to Guest Count, Total Budget, or Event Date. Deterministic math scales per-capita & tiered
                costs immediately while the AI Coordinator proposes priority-aligned tradeoffs.
              </p>
            </div>
          </div>

          {whatIfResult && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-900">
              Sandbox Active — Delta: {whatIfResult.budget_delta >= 0 ? '+' : ''}
              {formatCurrency(whatIfResult.budget_delta, currency)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
              <label htmlFor="whatif-guests">Simulated Guest Count</label>
              <span className="text-amber-800 font-bold">{whatIfGuests} Guests</span>
            </div>
            <input
              id="whatif-guests"
              type="range"
              min={25}
              max={350}
              step={5}
              value={whatIfGuests}
              onChange={(e) => onGuestsChange(Number(e.target.value))}
              className="w-full accent-amber-700"
            />
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>25</span>
              <span>Baseline: {baselineGuestCount}</span>
              <span>350</span>
            </div>
          </div>

          <div>
            <label htmlFor="whatif-budget" className="block text-xs font-semibold text-slate-700 mb-1">
              Target Budget Limit ({currency})
            </label>
            <input
              id="whatif-budget"
              type="number"
              step={25000}
              value={whatIfBudget}
              onChange={(e) => onBudgetChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
            />
          </div>

          <div>
            <label htmlFor="whatif-date" className="block text-xs font-semibold text-slate-700 mb-1">
              Simulated Event Date
            </label>
            <input
              id="whatif-date"
              type="date"
              value={whatIfDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRunWhatIf}
              disabled={simulating}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {simulating ? 'Evaluating...' : 'Simulate What-If & Tradeoffs'}
            </button>
            {whatIfResult && (
              <button
                type="button"
                onClick={onResetSandbox}
                className="px-3 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700"
                title="Reset What-If Sandbox"
                aria-label="Reset What-If Sandbox"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Priority Protection Order (Click to Promote #1):
          </span>
          {displayedPriorities.map((prio, idx) => (
            <button
              key={prio}
              type="button"
              onClick={() => onPromotePriority(prio)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition font-medium ${
                idx < 2
                  ? 'bg-amber-100/90 border-amber-300 text-amber-950 font-semibold'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              #{idx + 1} {prio}
            </button>
          ))}
        </div>
      </section>
    );
  }
);

WhatIfSimulator.displayName = 'WhatIfSimulator';
