import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Calendar,
  Clock,
  CloudSun,
  Compass,
  Cpu,
  History,
  MapPin,
  Plus,
  Sparkles,
  Sunset,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  applyTradeoff,
  createPlan,
  evaluateWhatIf,
  fetchPlans,
  fetchSystemStatus,
  optimizeTimeline,
  restoreSnapshot,
  scoutVendors,
  sendCoordinatorChat,
  toggleMilestone,
  updateVendorStatus,
} from './api/client';
import { BudgetMatrix } from './components/BudgetMatrix';
import { ChatDrawer } from './components/ChatDrawer';
import { OnboardingModal } from './components/OnboardingModal';
import { SettingsModal } from './components/SettingsModal';
import { SnapshotHistory } from './components/SnapshotHistory';
import { TimelineRunOfShow } from './components/TimelineRunOfShow';
import { TradeoffDeck } from './components/TradeoffDeck';
import { VendorCoordinator } from './components/VendorCoordinator';
import { WhatIfSimulator } from './components/WhatIfSimulator';
import {
  ConstraintProfile,
  EventPlan,
  SelectionStatus,
  SystemStatusResponse,
  TradeoffOption,
  WhatIfEvaluationResponse,
} from './types/domain';
import { formatCurrency } from './utils/currency';

type WorkspaceTab = 'budget' | 'vendors' | 'timeline' | 'snapshots';

export function App() {
  const [plans, setPlans] = useState<EventPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string>('');
  const [systemStatus, setSystemStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('budget');

  // Modals & Drawers
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // What-If Simulator State
  const [whatIfGuests, setWhatIfGuests] = useState<number>(100);
  const [whatIfBudget, setWhatIfBudget] = useState<number>(2200000);
  const [whatIfDate, setWhatIfDate] = useState<string>('2027-02-14');
  const [whatIfPriorities, setWhatIfPriorities] = useState<string[]>([]);
  const [simulating, setSimulating] = useState<boolean>(false);
  const [optimizingTimeline, setOptimizingTimeline] = useState<boolean>(false);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfEvaluationResponse | null>(null);
  const [previewedTradeoff, setPreviewedTradeoff] = useState<TradeoffOption | null>(null);
  const [scoutingCategoryId, setScoutingCategoryId] = useState<string | null>(null);

  const activePlan = useMemo(
    () => plans.find((p) => p.id === activePlanId) || plans[0] || null,
    [plans, activePlanId]
  );

  const syncWhatIfControls = useCallback((plan: EventPlan) => {
    setWhatIfGuests(plan.constraint_profile.guest_count);
    setWhatIfBudget(plan.constraint_profile.total_budget_limit);
    setWhatIfDate(plan.constraint_profile.event_date);
    setWhatIfPriorities(plan.constraint_profile.priority_ranking);
    setWhatIfResult(null);
    setPreviewedTradeoff(null);
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const [statusData, planList] = await Promise.all([fetchSystemStatus(), fetchPlans()]);
      setSystemStatus(statusData);
      setPlans(planList);
      if (planList.length > 0) {
        setActivePlanId(planList[0].id);
        syncWhatIfControls(planList[0]);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to load celebration plans.');
    } finally {
      setLoading(false);
    }
  }, [syncWhatIfControls]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const replacePlanInState = useCallback((updated: EventPlan) => {
    setPlans((prev) => {
      const exists = prev.some((p) => p.id === updated.id);
      if (!exists) return [updated, ...prev];
      return prev.map((p) => (p.id === updated.id ? updated : p));
    });
    setActivePlanId(updated.id);
  }, []);

  const handleSelectPlan = useCallback(
    (planId: string) => {
      setActivePlanId(planId);
      const found = plans.find((p) => p.id === planId);
      if (found) syncWhatIfControls(found);
    },
    [plans, syncWhatIfControls]
  );

  const handleCreatePlan = useCallback(
    async (title: string, profile: ConstraintProfile) => {
      setErrorBanner(null);
      try {
        const created = await createPlan(title, profile);
        replacePlanInState(created);
        syncWhatIfControls(created);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Failed to create celebration plan.');
      }
    },
    [replacePlanInState, syncWhatIfControls]
  );

  const handleRunWhatIf = useCallback(async () => {
    if (!activePlan) return;
    setSimulating(true);
    setErrorBanner(null);
    try {
      const res = await evaluateWhatIf(activePlan.id, {
        guest_count: whatIfGuests,
        total_budget_limit: whatIfBudget,
        event_date: whatIfDate,
        priority_ranking:
          whatIfPriorities.length > 0
            ? whatIfPriorities
            : activePlan.constraint_profile.priority_ranking,
      });
      setWhatIfResult(res);
      setPreviewedTradeoff(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to evaluate What-If scenario.');
    } finally {
      setSimulating(false);
    }
  }, [activePlan, whatIfGuests, whatIfBudget, whatIfDate, whatIfPriorities]);

  const handleApplyTradeoff = useCallback(
    async (option: TradeoffOption) => {
      if (!activePlan) return;
      setErrorBanner(null);
      try {
        const updated = await applyTradeoff(
          activePlan.id,
          {
            guest_count: whatIfGuests,
            total_budget_limit: whatIfBudget,
            event_date: whatIfDate,
            priority_ranking:
              whatIfPriorities.length > 0
                ? whatIfPriorities
                : activePlan.constraint_profile.priority_ranking,
          },
          option
        );
        replacePlanInState(updated);
        syncWhatIfControls(updated);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Failed to apply tradeoff option.');
      }
    },
    [activePlan, whatIfGuests, whatIfBudget, whatIfDate, whatIfPriorities, replacePlanInState, syncWhatIfControls]
  );

  const handlePromotePriority = useCallback((item: string) => {
    setWhatIfPriorities((prev) => [item, ...prev.filter((p) => p !== item)]);
  }, []);

  const handleOptimizeTimeline = useCallback(async () => {
    if (!activePlan) return;
    setOptimizingTimeline(true);
    setErrorBanner(null);
    try {
      const updated = await optimizeTimeline(activePlan.id);
      replacePlanInState(updated);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to optimize timeline.');
    } finally {
      setOptimizingTimeline(false);
    }
  }, [activePlan, replacePlanInState]);

  const handleVendorStatusChange = useCallback(
    async (vendorId: string, status: SelectionStatus) => {
      if (!activePlan) return;
      setErrorBanner(null);
      try {
        const updated = await updateVendorStatus(activePlan.id, vendorId, status);
        replacePlanInState(updated);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Failed to update vendor status.');
      }
    },
    [activePlan, replacePlanInState]
  );

  const handleScoutVendors = useCallback(
    async (categoryId: string) => {
      if (!activePlan) return;
      setScoutingCategoryId(categoryId);
      setErrorBanner(null);
      try {
        const updated = await scoutVendors(activePlan.id, categoryId);
        replacePlanInState(updated);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Failed to scout regional vendors.');
      } finally {
        setScoutingCategoryId(null);
      }
    },
    [activePlan, replacePlanInState]
  );

  const handleToggleMilestone = useCallback(
    async (milestoneId: string) => {
      if (!activePlan) return;
      setErrorBanner(null);
      try {
        const updated = await toggleMilestone(activePlan.id, milestoneId);
        replacePlanInState(updated);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Failed to update milestone.');
      }
    },
    [activePlan, replacePlanInState]
  );

  const handleRestoreSnapshot = useCallback(
    async (snapshotId: string) => {
      if (!activePlan) return;
      setErrorBanner(null);
      try {
        const updated = await restoreSnapshot(activePlan.id, snapshotId);
        replacePlanInState(updated);
        syncWhatIfControls(updated);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Failed to restore snapshot.');
      }
    },
    [activePlan, replacePlanInState, syncWhatIfControls]
  );

  const handleSendChat = useCallback(
    async (message: string) => {
      if (!activePlan) return;
      setErrorBanner(null);
      try {
        const updated = await sendCoordinatorChat(activePlan.id, message);
        replacePlanInState(updated);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Failed to send coordinator chat message.');
      }
    },
    [activePlan, replacePlanInState]
  );

  const handleTogglePreviewTradeoff = useCallback((opt: TradeoffOption) => {
    setPreviewedTradeoff((prev) => (prev?.id === opt.id ? null : opt));
    setActiveTab('budget');
  }, []);

  const displayedCategories = useMemo(
    () => (whatIfResult ? whatIfResult.updated_categories : activePlan?.categories || []),
    [whatIfResult, activePlan]
  );

  const displayedViolations = useMemo(
    () => (whatIfResult ? whatIfResult.violations : activePlan?.violations || []),
    [whatIfResult, activePlan]
  );

  const displayedMilestones = useMemo(
    () => (whatIfResult ? whatIfResult.updated_milestones : activePlan?.milestones || []),
    [whatIfResult, activePlan]
  );

  const displayedPriorities = useMemo(
    () =>
      whatIfPriorities.length > 0
        ? whatIfPriorities
        : activePlan?.constraint_profile.priority_ranking || [],
    [whatIfPriorities, activePlan]
  );

  const { totalEstimated, totalCommitted } = useMemo(() => {
    let est = 0;
    let comm = 0;
    for (const c of displayedCategories) {
      est += c.estimated_amount;
      comm += c.committed_amount;
    }
    return { totalEstimated: est, totalCommitted: comm };
  }, [displayedCategories]);

  const lockedVendorsCount = useMemo(
    () => (activePlan ? activePlan.vendors.filter((v) => v.selection_status === 'LOCKED').length : 0),
    [activePlan]
  );

  const previewMutationMap = useMemo(
    () => new Map((previewedTradeoff?.mutations || []).map((m) => [m.category_id, m])),
    [previewedTradeoff]
  );

  if (loading || !activePlan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-700" role="status">
        <div className="flex items-center gap-3 text-sm font-medium">
          <Sparkles className="w-5 h-5 text-amber-700 animate-spin" />
          Loading Celebration Coordinator Workspace...
        </div>
      </div>
    );
  }

  const currency = activePlan.constraint_profile.currency_code;
  const activeBudgetLimit = whatIfResult ? whatIfBudget : activePlan.constraint_profile.total_budget_limit;
  const activeGuestCount = whatIfResult ? whatIfGuests : activePlan.constraint_profile.guest_count;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <a
        href="#main-workspace"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-amber-400 focus:text-amber-950 focus:font-bold"
      >
        Skip to main content
      </a>

      {/* Top Navigation Header */}
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
              onChange={(e) => handleSelectPlan(e.target.value)}
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
              onClick={() => setIsOnboardingOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New Celebration
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-900/70 hover:bg-amber-800 border border-amber-700/80 text-amber-100 text-xs font-medium"
              title="Inspect 5-Model Gemini 3 Cascade & API Key Settings"
            >
              <Cpu className="w-3.5 h-3.5 text-amber-300" />
              <span>Model: {activePlan.active_model}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-amber-950 hover:bg-amber-50 text-xs font-bold shadow-sm"
            >
              <Bot className="w-4 h-4 text-amber-700" />
              Coordinator Chat
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main id="main-workspace" className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
        {errorBanner && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 border border-red-300 px-4 py-3 text-xs text-red-900 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              aria-label="Dismiss error alert"
              className="p-1 rounded-lg hover:bg-red-100 text-red-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Celebration Summary & Live Weather/Sunset Banner */}
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
                {whatIfResult ? 'Simulated What-If Spend' : 'Projected Total Spend'}
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
                Across {displayedCategories.length} categories
              </span>
            </div>
          </div>
        </section>

        {/* Interactive What-If Constraint Simulator Bar */}
        <WhatIfSimulator
          baselineGuestCount={activePlan.constraint_profile.guest_count}
          currency={currency}
          whatIfGuests={whatIfGuests}
          whatIfBudget={whatIfBudget}
          whatIfDate={whatIfDate}
          displayedPriorities={displayedPriorities}
          simulating={simulating}
          whatIfResult={whatIfResult}
          onGuestsChange={setWhatIfGuests}
          onBudgetChange={setWhatIfBudget}
          onDateChange={setWhatIfDate}
          onPromotePriority={handlePromotePriority}
          onRunWhatIf={handleRunWhatIf}
          onResetSandbox={() => syncWhatIfControls(activePlan)}
        />

        {/* Accessible Live Region for Constraint Violations & Tradeoff Approval Deck */}
        <TradeoffDeck
          violations={displayedViolations}
          whatIfResult={whatIfResult}
          previewedTradeoff={previewedTradeoff}
          currency={currency}
          onTogglePreview={handleTogglePreviewTradeoff}
          onApplyTradeoff={handleApplyTradeoff}
        />

        {/* Workspace Navigation Tabs */}
        <div
          className="border-b border-slate-200 flex flex-wrap gap-2"
          role="tablist"
          aria-label="Celebration Workspace Sections"
        >
          {(
            [
              ['budget', 'Budget & Tradeoff Matrix', Wallet, displayedCategories.length],
              ['vendors', 'Vendor & Venue Coordinator', Compass, activePlan.vendors.length],
              ['timeline', 'Critical-Path Timeline & Run-of-Show', Clock, displayedMilestones.length],
              ['snapshots', 'Snapshot History & Rollback', History, activePlan.snapshots.length],
            ] as const
          ).map(([tabKey, label, Icon, count]) => (
            <button
              key={tabKey}
              id={`tab-${tabKey}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tabKey}
              aria-controls={`panel-${tabKey}`}
              onClick={() => setActiveTab(tabKey)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                activeTab === tabKey
                  ? 'border-amber-700 text-amber-900 bg-amber-50/60 rounded-t-xl'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-800">
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* TAB 1: BUDGET & TRADEOFF MATRIX */}
        {activeTab === 'budget' && (
          <BudgetMatrix
            categories={displayedCategories}
            totalEstimated={totalEstimated}
            activeGuestCount={activeGuestCount}
            currency={currency}
            previewMutationMap={previewMutationMap}
          />
        )}

        {/* TAB 2: VENDOR & VENUE COORDINATOR MATRIX */}
        {activeTab === 'vendors' && (
          <VendorCoordinator
            categories={displayedCategories}
            vendors={activePlan.vendors}
            locationCity={activePlan.constraint_profile.location_city}
            activeGuestCount={activeGuestCount}
            currency={currency}
            scoutingCategoryId={scoutingCategoryId}
            onScoutVendors={handleScoutVendors}
            onVendorStatusChange={handleVendorStatusChange}
          />
        )}

        {/* TAB 3: CRITICAL-PATH TIMELINE & SUNSET RUN-OF-SHOW */}
        {activeTab === 'timeline' && (
          <TimelineRunOfShow
            milestones={displayedMilestones}
            runOfShow={activePlan.run_of_show}
            sunsetTimeLocal={activePlan.weather_context.sunset_time_local}
            optimizingTimeline={optimizingTimeline}
            onToggleMilestone={handleToggleMilestone}
            onOptimizeTimeline={handleOptimizeTimeline}
          />
        )}

        {/* TAB 4: SNAPSHOT HISTORY & 1-CLICK ROLLBACK */}
        {activeTab === 'snapshots' && (
          <SnapshotHistory
            snapshots={activePlan.snapshots}
            currency={currency}
            onRestoreSnapshot={handleRestoreSnapshot}
          />
        )}
      </main>

      {/* Modals & Slide-Over Coordinator Chat Drawer */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => setIsOnboardingOpen(false)}
        onCreate={handleCreatePlan}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        systemStatus={systemStatus}
        onKeyUpdated={async () => {
          const st = await fetchSystemStatus();
          setSystemStatus(st);
        }}
      />

      <ChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        chatHistory={activePlan.chat_history}
        currency={currency}
        onSendMessage={handleSendChat}
        onPreviewTradeoff={(opt) => {
          setPreviewedTradeoff(opt);
          setActiveTab('budget');
        }}
        onApplyTradeoff={handleApplyTradeoff}
      />
    </div>
  );
}

export default App;
