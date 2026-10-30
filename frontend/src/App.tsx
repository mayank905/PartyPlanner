import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  Clock,
  CloudSun,
  Compass,
  Cpu,
  Eye,
  History,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Sparkles,
  Sunset,
  Unlock,
  Users,
  Wallet,
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
import { ChatDrawer } from './components/ChatDrawer';
import { OnboardingModal } from './components/OnboardingModal';
import { SettingsModal } from './components/SettingsModal';
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

  const syncWhatIfControls = (plan: EventPlan) => {
    setWhatIfGuests(plan.constraint_profile.guest_count);
    setWhatIfBudget(plan.constraint_profile.total_budget_limit);
    setWhatIfDate(plan.constraint_profile.event_date);
    setWhatIfPriorities(plan.constraint_profile.priority_ranking);
    setWhatIfResult(null);
    setPreviewedTradeoff(null);
  };

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [statusData, planList] = await Promise.all([fetchSystemStatus(), fetchPlans()]);
      setSystemStatus(statusData);
      setPlans(planList);
      if (planList.length > 0) {
        setActivePlanId(planList[0].id);
        syncWhatIfControls(planList[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  const replacePlanInState = (updated: EventPlan) => {
    setPlans((prev) => {
      const exists = prev.some((p) => p.id === updated.id);
      if (!exists) return [updated, ...prev];
      return prev.map((p) => (p.id === updated.id ? updated : p));
    });
    setActivePlanId(updated.id);
  };

  const handleSelectPlan = (planId: string) => {
    setActivePlanId(planId);
    const found = plans.find((p) => p.id === planId);
    if (found) syncWhatIfControls(found);
  };

  const handleCreatePlan = async (title: string, profile: ConstraintProfile) => {
    const created = await createPlan(title, profile);
    replacePlanInState(created);
    syncWhatIfControls(created);
  };

  const handleRunWhatIf = async () => {
    if (!activePlan) return;
    setSimulating(true);
    try {
      const res = await evaluateWhatIf(activePlan.id, {
        guest_count: whatIfGuests,
        total_budget_limit: whatIfBudget,
        event_date: whatIfDate,
        priority_ranking: whatIfPriorities.length > 0 ? whatIfPriorities : activePlan.constraint_profile.priority_ranking,
      });
      setWhatIfResult(res);
      setPreviewedTradeoff(null);
    } finally {
      setSimulating(false);
    }
  };

  const handleApplyTradeoff = async (option: TradeoffOption) => {
    if (!activePlan) return;
    const updated = await applyTradeoff(
      activePlan.id,
      {
        guest_count: whatIfGuests,
        total_budget_limit: whatIfBudget,
        event_date: whatIfDate,
        priority_ranking: whatIfPriorities.length > 0 ? whatIfPriorities : activePlan.constraint_profile.priority_ranking,
      },
      option
    );
    replacePlanInState(updated);
    syncWhatIfControls(updated);
  };

  const handlePromotePriority = (item: string) => {
    setWhatIfPriorities((prev) => [item, ...prev.filter((p) => p !== item)]);
  };

  const handleOptimizeTimeline = async () => {
    if (!activePlan) return;
    setOptimizingTimeline(true);
    try {
      const updated = await optimizeTimeline(activePlan.id);
      replacePlanInState(updated);
    } finally {
      setOptimizingTimeline(false);
    }
  };

  const handleVendorStatusChange = async (vendorId: string, status: SelectionStatus) => {
    if (!activePlan) return;
    const updated = await updateVendorStatus(activePlan.id, vendorId, status);
    replacePlanInState(updated);
  };

  const handleScoutVendors = async (categoryId: string) => {
    if (!activePlan) return;
    setScoutingCategoryId(categoryId);
    try {
      const updated = await scoutVendors(activePlan.id, categoryId);
      replacePlanInState(updated);
    } finally {
      setScoutingCategoryId(null);
    }
  };

  const handleToggleMilestone = async (milestoneId: string) => {
    if (!activePlan) return;
    const updated = await toggleMilestone(activePlan.id, milestoneId);
    replacePlanInState(updated);
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    if (!activePlan) return;
    const updated = await restoreSnapshot(activePlan.id, snapshotId);
    replacePlanInState(updated);
    syncWhatIfControls(updated);
  };

  const handleSendChat = async (message: string) => {
    if (!activePlan) return;
    const updated = await sendCoordinatorChat(activePlan.id, message);
    replacePlanInState(updated);
  };

  if (loading || !activePlan) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-700">
        <div className="flex items-center gap-3 text-sm font-medium">
          <Sparkles className="w-5 h-5 text-amber-700 animate-spin" />
          Loading Celebration Coordinator Workspace...
        </div>
      </div>
    );
  }

  const currency = activePlan.constraint_profile.currency_code;
  const displayedCategories = whatIfResult ? whatIfResult.updated_categories : activePlan.categories;
  const displayedViolations = whatIfResult ? whatIfResult.violations : activePlan.violations;
  const displayedMilestones = whatIfResult ? whatIfResult.updated_milestones : activePlan.milestones;

  const totalAllocated = displayedCategories.reduce((acc, c) => acc + c.allocated_amount, 0);
  const totalEstimated = displayedCategories.reduce((acc, c) => acc + c.estimated_amount, 0);
  const totalCommitted = displayedCategories.reduce((acc, c) => acc + c.committed_amount, 0);
  const activeBudgetLimit = whatIfResult ? whatIfBudget : activePlan.constraint_profile.total_budget_limit;
  const activeGuestCount = whatIfResult ? whatIfGuests : activePlan.constraint_profile.guest_count;

  const previewMutationMap = new Map(
    (previewedTradeoff?.mutations || []).map((m) => [m.category_id, m])
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
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
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 space-y-6 flex-1">
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
                  <span>
                    {activePlan.weather_context.location_city} Weather & Golden-Hour Context
                  </span>
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
              <div className="text-lg font-bold mt-0.5">
                {formatCurrency(totalEstimated, currency)}
              </div>
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
              <span className="text-[11px] text-slate-500">
                {activePlan.vendors.filter((v) => v.selection_status === 'LOCKED').length} vendors locked
              </span>
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
                  Test changes to Guest Count, Total Budget, or Event Date. Deterministic math scales per-capita & tiered costs immediately while the AI Coordinator proposes priority-aligned tradeoffs.
                </p>
              </div>
            </div>

            {whatIfResult && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-900">
                Sandbox Active — Delta:{' '}
                {whatIfResult.budget_delta >= 0 ? '+' : ''}
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
                onChange={(e) => setWhatIfGuests(Number(e.target.value))}
                className="w-full accent-amber-700"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>25</span>
                <span>Baseline: {activePlan.constraint_profile.guest_count}</span>
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
                onChange={(e) => setWhatIfBudget(Number(e.target.value))}
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
                onChange={(e) => setWhatIfDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRunWhatIf}
                disabled={simulating}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {simulating ? 'Evaluating...' : 'Simulate What-If & Tradeoffs'}
              </button>
              {whatIfResult && (
                <button
                  type="button"
                  onClick={() => syncWhatIfControls(activePlan)}
                  className="px-3 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700"
                  title="Reset What-If Sandbox"
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
            {(whatIfPriorities.length > 0 ? whatIfPriorities : activePlan.constraint_profile.priority_ranking).map(
              (prio, idx) => (
                <button
                  key={prio}
                  type="button"
                  onClick={() => handlePromotePriority(prio)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition font-medium ${
                    idx < 2
                      ? 'bg-amber-100/90 border-amber-300 text-amber-950 font-semibold'
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  #{idx + 1} {prio}
                </button>
              )
            )}
          </div>
        </section>

        {/* Accessible Live Region for Constraint Violations & Tradeoff Approval Deck */}
        <div aria-live="polite" className="space-y-4">
          {displayedViolations.length > 0 && (
            <section className="rounded-2xl border border-red-300 bg-red-50/90 p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-900 font-bold text-xs uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4 text-red-700" />
                <span>
                  {displayedViolations.length} Active Constraint Conflict
                  {displayedViolations.length > 1 ? 's' : ''} Detected
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {displayedViolations.map((v) => (
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
                          onClick={() => {
                            setPreviewedTradeoff(isPreviewing ? null : opt);
                            setActiveTab('budget');
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-900 hover:bg-amber-800 text-amber-100 border border-amber-700"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {isPreviewing ? 'Hide Diff' : 'Preview Diff'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyTradeoff(opt)}
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

        {/* Workspace Navigation Tabs */}
        <div className="border-b border-slate-200 flex flex-wrap gap-2" role="tablist">
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
              type="button"
              role="tab"
              aria-selected={activeTab === tabKey}
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
          <section className="space-y-3" aria-label="Budget and Tradeoff Matrix">
            <div className="grid grid-cols-1 gap-3">
              {displayedCategories.map((cat) => {
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
                          <span
                            className={`text-sm font-bold ${
                              overflow ? 'text-red-700' : 'text-slate-900'
                            }`}
                          >
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
                        <span className="font-semibold">
                          Tradeoff Diff Rationale: {mutation.change_rationale}
                        </span>
                        <span className="font-bold">
                          Delta:{' '}
                          {formatCurrency(mutation.new_allocated - mutation.previous_allocated, currency)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* TAB 2: VENDOR & VENUE COORDINATOR MATRIX */}
        {activeTab === 'vendors' && (
          <section className="space-y-6" aria-label="Vendor and Venue Coordinator">
            {displayedCategories.map((cat) => {
              const catVendors = activePlan.vendors.filter((v) => v.category_id === cat.id);
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
                      onClick={() => handleScoutVendors(cat.id)}
                      disabled={scoutingCategoryId === cat.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold transition"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                      {scoutingCategoryId === cat.id
                        ? 'Scouting Regional Options...'
                        : `AI Scout More ${activePlan.constraint_profile.location_city} Vendors`}
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
                                onClick={() => handleVendorStatusChange(v.id, 'SHORTLISTED')}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-100"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                Unlock Vendor
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleVendorStatusChange(v.id, 'LOCKED')}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                  Lock Vendor Quote
                                </button>
                                {v.selection_status !== 'REJECTED' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleVendorStatusChange(v.id, 'REJECTED')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
                                  >
                                    Reject
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleVendorStatusChange(v.id, 'SHORTLISTED')}
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
        )}

        {/* TAB 3: CRITICAL-PATH TIMELINE & SUNSET RUN-OF-SHOW */}
        {activeTab === 'timeline' && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6" aria-label="Timeline and Run of Show">
            {/* Pre-Event Countdown Milestones */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Pre-Event Critical-Path Countdown Milestones
                </h3>
                <p className="text-xs text-slate-500">
                  Automatically shifts when Event Date changes and flags compressed lead-time deadlines.
                </p>
              </div>

              <div className="space-y-2.5">
                {displayedMilestones.map((ms) => (
                  <div
                    key={ms.id}
                    className={`rounded-xl border p-3.5 flex items-start justify-between gap-3 ${
                      ms.completed
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : ms.is_compressed
                        ? 'bg-red-50/60 border-red-300'
                        : 'bg-slate-50/70 border-slate-200'
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={ms.completed}
                        onChange={() => handleToggleMilestone(ms.id)}
                        className="mt-1 rounded accent-amber-700"
                      />
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`text-xs font-bold ${
                              ms.completed ? 'line-through text-slate-400' : 'text-slate-900'
                            }`}
                          >
                            {ms.title}
                          </span>
                          {ms.critical_path && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                              Critical Path
                            </span>
                          )}
                          {ms.is_compressed && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                              Compressed Deadline
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          {ms.category_name} • Target: T-{ms.days_before_event}d ({ms.due_date})
                        </p>
                      </div>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Day-Of Sunset-Aligned Run-of-Show */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Day-Of Run-of-Show (Aligned to {activePlan.weather_context.sunset_time_local} Sunset)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Synchronizes outdoor ceremonies, golden-hour portraits, and weather contingencies.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOptimizeTimeline}
                  disabled={optimizingTimeline}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-semibold transition disabled:opacity-50"
                >
                  <Sunset className="w-3.5 h-3.5 text-amber-700" />
                  {optimizingTimeline ? 'Optimizing...' : 'Optimize Schedule for Sunset'}
                </button>
              </div>

              <div className="space-y-3">
                {activePlan.run_of_show.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60 flex items-start gap-3"
                  >
                    <div className="px-2.5 py-1 rounded-lg bg-amber-950 text-amber-200 font-mono text-xs font-bold shrink-0">
                      {item.start_time}
                      <span className="block text-[10px] font-normal text-amber-300/80">
                        {item.duration_minutes}m
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900">{item.title}</h4>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                            item.is_outdoor
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {item.is_outdoor ? 'Outdoor / Sunset Sensitive' : 'Indoor / Covered'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600">{item.notes}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* TAB 4: SNAPSHOT HISTORY & 1-CLICK ROLLBACK */}
        {activeTab === 'snapshots' && (
          <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4" aria-label="Snapshot History">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Immutable Plan Snapshots & 1-Click Rollback
              </h3>
              <p className="text-xs text-slate-500">
                Every time you apply a Tradeoff Option, UtsavAI records a snapshot of the prior state in SQLite so you can experiment freely.
              </p>
            </div>

            {activePlan.snapshots.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-4">
                No snapshots recorded yet. Simulate a What-If change and click &ldquo;Apply Option&rdquo; to automatically create a rollback point.
              </p>
            ) : (
              <div className="space-y-2.5">
                {activePlan.snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">{snap.label}</div>
                      <p className="text-[11px] text-slate-600">
                        {snap.guest_count} guests • Budget Ceiling:{' '}
                        {formatCurrency(snap.total_budget_limit, currency)} • Estimated:{' '}
                        {formatCurrency(snap.total_estimated, currency)} • Date: {snap.event_date}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestoreSnapshot(snap.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore Snapshot
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
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
