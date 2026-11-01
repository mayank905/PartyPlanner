import React from 'react';
import { Calendar, CloudSun, MapPin, Sunset, Users } from 'lucide-react';
import { CurrencyCode, EventPlan } from '../types/domain';
import { formatCurrency } from '../utils/currency';

interface PlanOverviewBannerProps {
  activePlan: EventPlan;
  activeGuestCount: number;
  activeBudgetLimit: number;
  totalEstimated: number;
  totalCommitted: number;
  lockedVendorsCount: number;
  categoriesCount: number;
  isSimulatingWhatIf: boolean;
  currency: CurrencyCode;
}

export const PlanOverviewBanner: React.FC<PlanOverviewBannerProps> = React.memo(
  ({
    activePlan,
    activeGuestCount,
    activeBudgetLimit,
    totalEstimated,
    totalCommitted,
    lockedVendorsCount,
    categoriesCount,
    isSimulatingWhatIf,
    currency,
  }) => {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900">
                {activePlan.constraint_profile.event_vertical.replace('_', ' ')}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-medium">
                <MapPin className="w-3.5 h-3.5 text-amber-700" />
                {activePlan.constraint_profile.location_city}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-medium">
                <Calendar className="w-3.5 h-3.5 text-amber-700" />
                {activePlan.constraint_profile.event_date}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-slate-600 font-medium">
                <Users className="w-3.5 h-3.5 text-amber-700" />
                {activeGuestCount} Guests
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{activePlan.title}</h1>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-xs font-semibold text-slate-500 mr-1">Priority Shield Order:</span>
              {activePlan.constraint_profile.priority_ranking.map((prio, idx) => (
                <span
                  key={prio}
                  className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                    idx < 2
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  #{idx + 1} {prio}
                </span>
              ))}
            </div>
          </div>

          {/* Real-Time Weather & Sunset Card */}
          <div className="rounded-xl bg-gradient-to-br from-amber-50 via-orange-50/60 to-slate-50 border border-amber-200/80 p-3.5 lg:max-w-md w-full">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950">
                <CloudSun className="w-4 h-4 text-amber-600" />
                <span>{activePlan.weather_context.location_city} Weather & Golden-Hour Context</span>
              </div>
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  activePlan.weather_context.outdoor_risk_level === 'HIGH'
                    ? 'bg-red-100 text-red-800'
                    : activePlan.weather_context.outdoor_risk_level === 'MODERATE'
                    ? 'bg-amber-200 text-amber-950'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {activePlan.weather_context.outdoor_risk_level} Outdoor Risk
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-700 font-medium my-1">
              <span>
                Temp: {activePlan.weather_context.temp_high_c}°C / {activePlan.weather_context.temp_low_c}°C
              </span>
              <span>Rain Prob: {activePlan.weather_context.precipitation_prob_pct}%</span>
              <span className="inline-flex items-center gap-1 font-semibold text-amber-900">
                <Sunset className="w-3.5 h-3.5 text-amber-600" />
                Sunset: {activePlan.weather_context.sunset_time_local}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-snug">
              {activePlan.weather_context.advisory_note}
            </p>
          </div>
        </div>

        {/* KPI Metric Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-100">
          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/70">
            <span className="text-[11px] font-medium text-slate-500 uppercase">Hard Budget Limit</span>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {formatCurrency(activeBudgetLimit, currency)}
            </div>
            <span className="text-[11px] text-slate-500">
              {formatCurrency(activeBudgetLimit / Math.max(1, activeGuestCount), currency)} / guest ceiling
            </span>
          </div>

          <div
            className={`rounded-xl p-3 border ${
              totalEstimated > activeBudgetLimit
                ? 'bg-red-50/70 border-red-300 text-red-950'
                : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
            }`}
          >
            <span className="text-[11px] font-semibold uppercase">
              {isSimulatingWhatIf ? 'Simulated What-If Spend' : 'Projected Total Spend'}
            </span>
            <div className="text-lg font-bold mt-0.5">{formatCurrency(totalEstimated, currency)}</div>
            <span className="text-[11px] font-medium">
              {totalEstimated > activeBudgetLimit
                ? `Over limit by ${formatCurrency(totalEstimated - activeBudgetLimit, currency)}`
                : `${formatCurrency(activeBudgetLimit - totalEstimated, currency)} buffer remaining`}
            </span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/70">
            <span className="text-[11px] font-medium text-slate-500 uppercase">Locked Vendor Spend</span>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {formatCurrency(totalCommitted, currency)}
            </div>
            <span className="text-[11px] text-slate-500">{lockedVendorsCount} vendors locked</span>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200/70">
            <span className="text-[11px] font-medium text-slate-500 uppercase">Per-Guest Avg Spend</span>
            <div className="text-lg font-bold text-slate-900 mt-0.5">
              {formatCurrency(totalEstimated / Math.max(1, activeGuestCount), currency)}
            </div>
            <span className="text-[11px] text-slate-500">
              Across {categoriesCount} categories
            </span>
          </div>
        </div>
      </section>
    );
  }
);

PlanOverviewBanner.displayName = 'PlanOverviewBanner';
