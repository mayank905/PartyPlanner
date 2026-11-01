import React, { useMemo } from 'react';
import { Lock, Sparkles, Unlock } from 'lucide-react';
import {
  BudgetCategory,
  CurrencyCode,
  SelectionStatus,
  VendorCandidate,
} from '../types/domain';
import { formatCurrency } from '../utils/currency';

interface VendorCoordinatorProps {
  categories: BudgetCategory[];
  vendors: VendorCandidate[];
  locationCity: string;
  activeGuestCount: number;
  currency: CurrencyCode;
  scoutingCategoryId: string | null;
  onScoutVendors: (categoryId: string) => void;
  onVendorStatusChange: (vendorId: string, status: SelectionStatus) => void;
}

export const VendorCoordinator: React.FC<VendorCoordinatorProps> = React.memo(
  ({
    categories,
    vendors,
    locationCity,
    activeGuestCount,
    currency,
    scoutingCategoryId,
    onScoutVendors,
    onVendorStatusChange,
  }) => {
    const vendorsByCategory = useMemo(() => {
      const grouped = new Map<string, VendorCandidate[]>();
      for (const vendor of vendors) {
        const list = grouped.get(vendor.category_id);
        if (list) {
          list.push(vendor);
        } else {
          grouped.set(vendor.category_id, [vendor]);
        }
      }
      return grouped;
    }, [vendors]);

    return (
      <section
        id="panel-vendors"
        role="tabpanel"
        aria-labelledby="tab-vendors"
        aria-label="Vendor and Venue Coordinator"
        className="space-y-6"
      >
        {categories.map((cat) => {
          const catVendors = vendorsByCategory.get(cat.id) || [];
          return (
            <div key={cat.id} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{cat.name}</h3>
                  <p className="text-xs text-slate-500">
                    Category Allocation: {formatCurrency(cat.allocated_amount, currency)} • Active Guest Count:{' '}
                    {activeGuestCount}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onScoutVendors(cat.id)}
                  disabled={scoutingCategoryId === cat.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold transition"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  {scoutingCategoryId === cat.id
                    ? 'Scouting Regional Options...'
                    : `AI Scout More ${locationCity} Vendors`}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {catVendors.map((v) => {
                  const vendorQuote =
                    v.pricing_model === 'FLAT_FEE'
                      ? v.base_cost
                      : v.pricing_model === 'PER_CAPITA'
                      ? v.base_cost + v.per_head_cost * activeGuestCount
                      : v.base_cost + Math.ceil(activeGuestCount / 50) * v.per_head_cost;
                  const capExceeded = activeGuestCount > v.max_capacity;
                  const isLocked = v.selection_status === 'LOCKED';

                  return (
                    <div
                      key={v.id}
                      className={`rounded-xl border p-4 flex flex-col justify-between ${
                        isLocked
                          ? 'border-emerald-500 bg-emerald-50/30 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{v.name}</h4>
                            <span className="text-[10px] font-mono uppercase text-slate-500">
                              {v.pricing_model} • Max Capacity: {v.max_capacity} guests • Lead time:{' '}
                              {v.lead_time_days}d
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                              isLocked
                                ? 'bg-emerald-200 text-emerald-950'
                                : v.selection_status === 'REJECTED'
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {v.selection_status}
                          </span>
                        </div>

                        <div className="text-xs font-bold text-slate-900">
                          Projected Quote ({activeGuestCount} guests):{' '}
                          <span className="text-amber-900">{formatCurrency(vendorQuote, currency)}</span>
                        </div>

                        {capExceeded && (
                          <div className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-lg">
                            Capacity Warning: {activeGuestCount} guests exceeds {v.max_capacity} max capacity!
                          </div>
                        )}

                        <p className="text-xs text-slate-600">{v.tradeoff_notes}</p>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-200/80 flex items-center gap-2">
                        {isLocked ? (
                          <button
                            type="button"
                            onClick={() => onVendorStatusChange(v.id, 'SHORTLISTED')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            Unlock Vendor
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onVendorStatusChange(v.id, 'LOCKED')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              Lock Vendor Quote
                            </button>
                            {v.selection_status !== 'REJECTED' ? (
                              <button
                                type="button"
                                onClick={() => onVendorStatusChange(v.id, 'REJECTED')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                              >
                                Reject
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onVendorStatusChange(v.id, 'SHORTLISTED')}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                              >
                                Restore to Shortlist
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    );
  }
);

VendorCoordinator.displayName = 'VendorCoordinator';
