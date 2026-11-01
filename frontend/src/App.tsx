import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Clock,
  Compass,
  History,
  Sparkles,
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
import { AppHeader } from './components/AppHeader';
import { BudgetMatrix } from './components/BudgetMatrix';
import { ChatDrawer } from './components/ChatDrawer';
import { OnboardingModal } from './components/OnboardingModal';
import { PlanOverviewBanner } from './components/PlanOverviewBanner';
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

      <AppHeader
        plans={plans}
        activePlan={activePlan}
        onSelectPlan={handleSelectPlan}
        onOpenOnboarding={() => setIsOnboardingOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenChat={() => setIsChatOpen(true)}
      />

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

        <PlanOverviewBanner
          activePlan={activePlan}
          activeGuestCount={activeGuestCount}
          activeBudgetLimit={activeBudgetLimit}
          totalEstimated={totalEstimated}
          totalCommitted={totalCommitted}
          lockedVendorsCount={lockedVendorsCount}
          categoriesCount={displayedCategories.length}
          isSimulatingWhatIf={Boolean(whatIfResult)}
          currency={currency}
        />

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
