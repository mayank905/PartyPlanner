import React from 'react';
import { Bot, Cpu, Plus, Sparkles } from 'lucide-react';
import { EventPlan } from '../types/domain';

interface AppHeaderProps {
  plans: EventPlan[];
  activePlan: EventPlan;
  onSelectPlan: (planId: string) => void;
  onOpenOnboarding: () => void;
  onOpenSettings: () => void;
  onOpenChat: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = React.memo(
  ({
    plans,
    activePlan,
    onSelectPlan,
    onOpenOnboarding,
    onOpenSettings,
    onOpenChat,
  }) => {
    return (
      <header className="bg-amber-950 text-white border-b border-amber-900 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-base">UtsavAI</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-800/80 text-amber-200 font-medium">
                  Dynamic Event Coordinator
                </span>
              </div>
              <p className="text-xs text-amber-200/80">
                Constraint-Driven Budgeting, Tradeoff Synthesis & Sunset-Aligned Timelines
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Select Active Celebration Plan"
              value={activePlan.id}
              onChange={(e) => onSelectPlan(e.target.value)}
              className="rounded-xl bg-amber-900/90 border border-amber-700 text-white text-xs px-3 py-2 font-medium"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.constraint_profile.location_city} • {p.constraint_profile.currency_code})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onOpenOnboarding}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Celebration
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-900/70 hover:bg-amber-800 border border-amber-700/80 text-amber-100 text-xs font-medium"
              title="Inspect 5-Model Gemini 3 Cascade & API Key Settings"
            >
              <Cpu className="w-3.5 h-3.5 text-amber-300" />
              <span>Model: {activePlan.active_model}</span>
            </button>

            <button
              type="button"
              onClick={onOpenChat}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-amber-950 hover:bg-amber-50 text-xs font-bold shadow-sm"
            >
              <Bot className="w-4 h-4 text-amber-700" />
              Coordinator Chat
            </button>
          </div>
        </div>
      </header>
    );
  }
);

AppHeader.displayName = 'AppHeader';
