import React from 'react';
import { AlertTriangle, CheckCircle2, Eye, ShieldAlert } from 'lucide-react';
import {
  ConstraintViolation,
  CurrencyCode,
  TradeoffOption,
  WhatIfEvaluationResponse,
} from '../types/domain';
import { formatCurrency } from '../utils/currency';

interface TradeoffDeckProps {
  violations: ConstraintViolation[];
  whatIfResult: WhatIfEvaluationResponse | null;
  previewedTradeoff: TradeoffOption | null;
  currency: CurrencyCode;
  onTogglePreview: (option: TradeoffOption) => void;
  onApplyTradeoff: (option: TradeoffOption) => void;
}

export const TradeoffDeck: React.FC<TradeoffDeckProps> = React.memo(
  ({ violations, whatIfResult, previewedTradeoff, currency, onTogglePreview, onApplyTradeoff }) => {
    return (
      <div aria-live="polite" className="space-y-4">
        {violations.length > 0 && (
          <section className="rounded-2xl border border-red-300 bg-red-50/90 p-4 space-y-2">
            <div className="flex items-center gap-2 text-red-900 font-bold text-xs uppercase tracking-wider">
              <ShieldAlert className="w-4 h-4 text-red-700" />
              <span>
                {violations.length} Active Constraint Conflict
                {violations.length > 1 ? 's' : ''} Detected
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {violations.map((v) => (
                <div
                  key={v.id}
                  className="rounded-xl bg-white/90 border border-red-200 p-3 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-bold text-slate-900">{v.title}</div>
                    <p className="text-slate-600 mt-0.5">{v.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {whatIfResult && whatIfResult.tradeoff_options.length > 0 && (
          <section className="bg-amber-950 text-white rounded-2xl p-5 space-y-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] uppercase tracking-wider font-bold text-amber-300">
                  AI Coordinator Tradeoff Proposals ({whatIfResult.active_model})
                </span>
                <h3 className="text-base font-bold mt-0.5">
                  Select a Resolution Path — Preview Category Diffs Before Committing
                </h3>
              </div>
              {previewedTradeoff && (
                <span className="text-xs bg-amber-400 text-amber-950 font-bold px-3 py-1 rounded-full">
                  Previewing Diff: {previewedTradeoff.title}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {whatIfResult.tradeoff_options.map((opt) => {
                const isPreviewing = previewedTradeoff?.id === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`rounded-xl p-4 flex flex-col justify-between border transition ${
                      isPreviewing
                        ? 'bg-amber-900/90 border-amber-300 ring-2 ring-amber-300'
                        : 'bg-amber-900/40 border-amber-800 hover:border-amber-600'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-400/20 text-amber-200 border border-amber-400/30">
                          {opt.badge}
                        </span>
                        <span className="text-xs font-bold text-emerald-300">
                          {opt.financial_delta <= 0 ? '' : '+'}
                          {formatCurrency(opt.financial_delta, currency)}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white">{opt.title}</h4>
                      <p className="text-xs text-amber-100/85 leading-relaxed">{opt.summary}</p>

                      <div className="text-xs pt-1 space-y-1">
                        <div className="font-semibold text-amber-200">
                          New Projected Total: {formatCurrency(opt.new_total_estimated, currency)}
                        </div>
                        {opt.pros.slice(0, 2).map((pro) => (
                          <div key={pro} className="text-[11px] text-emerald-200 flex items-start gap-1">
                            <span>+</span>
                            <span>{pro}</span>
                          </div>
                        ))}
                        {opt.cons.slice(0, 1).map((con) => (
                          <div key={con} className="text-[11px] text-amber-300/90 flex items-start gap-1">
                            <span>△</span>
                            <span>{con}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-amber-800/80 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onTogglePreview(opt)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-900 hover:bg-amber-800 text-amber-100 border border-amber-700"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {isPreviewing ? 'Hide Diff' : 'Preview Diff'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onApplyTradeoff(opt)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-amber-400 hover:bg-amber-300 text-amber-950 shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Apply Option
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }
);

TradeoffDeck.displayName = 'TradeoffDeck';
