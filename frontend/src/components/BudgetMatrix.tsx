import React from 'react';
import { ArrowRight } from 'lucide-react';
import { BudgetCategory, CategoryMutation, CurrencyCode } from '../types/domain';
import { formatCurrency } from '../utils/currency';

interface BudgetMatrixProps {
  categories: BudgetCategory[];
  totalEstimated: number;
  activeGuestCount: number;
  currency: CurrencyCode;
  previewMutationMap: Map<string, CategoryMutation>;
}

export const BudgetMatrix: React.FC<BudgetMatrixProps> = React.memo(
  ({ categories, totalEstimated, activeGuestCount, currency, previewMutationMap }) => {
    return (
      <section
        id="panel-budget"
        role="tabpanel"
        aria-labelledby="tab-budget"
        aria-label="Budget and Tradeoff Matrix"
        className="space-y-3"
      >
        <div className="grid grid-cols-1 gap-3">
          {categories.map((cat) => {
            const mutation = previewMutationMap.get(cat.id);
            const overflow = cat.estimated_amount > cat.allocated_amount * 1.05;
            const pctOfTotal = Math.round((cat.estimated_amount / Math.max(1, totalEstimated)) * 100);

            return (
              <div
                key={cat.id}
                className={`rounded-2xl bg-white border p-4 shadow-sm transition ${
                  mutation
                    ? 'border-amber-500 ring-2 ring-amber-400/30'
                    : overflow
                    ? 'border-red-300'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">{cat.name}</h3>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                        {cat.pricing_model}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        ({pctOfTotal}% of total)
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{cat.notes}</p>
                    <div className="text-[11px] text-slate-500 font-mono">
                      {cat.pricing_model === 'PER_CAPITA' &&
                        `Formula: Base ${formatCurrency(cat.base_cost, currency)} + (${formatCurrency(
                          cat.per_head_cost,
                          currency
                        )} × ${activeGuestCount} guests)`}
                      {cat.pricing_model === 'FLAT_FEE' &&
                        `Formula: Fixed package ${formatCurrency(cat.base_cost, currency)} (independent of guest count)`}
                      {cat.pricing_model === 'TIERED_CAPACITY' &&
                        `Formula: Base ${formatCurrency(cat.base_cost, currency)} + ${formatCurrency(
                          cat.tier_cost,
                          currency
                        )} per ${cat.tier_step}-guest tier`}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <div className="text-right">
                      <span className="block text-[10px] uppercase text-slate-500">Allocated</span>
                      <span className="text-xs font-semibold text-slate-700">
                        {formatCurrency(cat.allocated_amount, currency)}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="block text-[10px] uppercase text-slate-500">Estimated Spend</span>
                      <span className={`text-sm font-bold ${overflow ? 'text-red-700' : 'text-slate-900'}`}>
                        {formatCurrency(cat.estimated_amount, currency)}
                      </span>
                    </div>

                    {mutation && (
                      <div className="rounded-xl bg-amber-50 border border-amber-300 px-3 py-2 text-right">
                        <span className="block text-[10px] font-bold uppercase text-amber-900">
                          Preview Diff Allocation
                        </span>
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                          <span className="line-through text-slate-400">
                            {formatCurrency(mutation.previous_allocated, currency)}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5" />
                          <span>{formatCurrency(mutation.new_allocated, currency)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {mutation && (
                  <div className="mt-3 pt-2.5 border-t border-amber-200/80 flex items-center justify-between text-xs text-amber-950 bg-amber-50/60 px-3 py-1.5 rounded-lg">
                    <span className="font-semibold">Tradeoff Diff Rationale: {mutation.change_rationale}</span>
                    <span className="font-bold">
                      Delta: {formatCurrency(mutation.new_allocated - mutation.previous_allocated, currency)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }
);

BudgetMatrix.displayName = 'BudgetMatrix';
