/**
 * Typed REST API client for the UtsavAI Celebration & Event Coordinator backend.
 */
import {
  ConstraintProfile,
  EventPlan,
  SelectionStatus,
  SystemStatusResponse,
  TradeoffOption,
  WhatIfEvaluationResponse,
  WhatIfRequest,
} from '../types/domain';

const API_BASE = '/api/v1';

let sessionGeminiApiKey = '';

/** Store an optional per-session Gemini API key sent via the X-Gemini-API-Key header. */
export function setSessionGeminiApiKey(key: string): void {
  sessionGeminiApiKey = key.trim();
}

/** Retrieve the active session Gemini API key, if configured. */
export function getSessionGeminiApiKey(): string {
  return sessionGeminiApiKey;
}

function buildHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (sessionGeminiApiKey) {
    headers['X-Gemini-API-Key'] = sessionGeminiApiKey;
  }
  return headers;
}

/** Shared typed JSON request helper with consistent HTTP error handling. */
async function requestJson<T>(
  endpoint: string,
  errorMessage: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      ...buildHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(errorMessage);
  }
  return res.json() as Promise<T>;
}

/** Fetch active coordinator mode, default currency, and 5-model cascade status. */
export async function fetchSystemStatus(): Promise<SystemStatusResponse> {
  return requestJson<SystemStatusResponse>('/system/status', 'Failed to fetch system status');
}

/** Fetch all saved celebration EventPlans. */
export async function fetchPlans(): Promise<EventPlan[]> {
  return requestJson<EventPlan[]>('/plans', 'Failed to load celebration plans');
}

/** Create a new celebration EventPlan from a title and ConstraintProfile. */
export async function createPlan(
  title: string,
  constraint_profile: ConstraintProfile
): Promise<EventPlan> {
  return requestJson<EventPlan>('/plans', 'Failed to create celebration plan', {
    method: 'POST',
    body: JSON.stringify({ title, constraint_profile }),
  });
}

/** Simulate What-If guest count, budget ceiling, or date changes without mutating saved state. */
export async function evaluateWhatIf(
  planId: string,
  payload: WhatIfRequest
): Promise<WhatIfEvaluationResponse> {
  return requestJson<WhatIfEvaluationResponse>(
    `/plans/${planId}/evaluate-what-if`,
    'Failed to evaluate what-if constraints',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

/** Apply a selected TradeoffOption after recording an automatic rollback snapshot. */
export async function applyTradeoff(
  planId: string,
  what_if_constraints: WhatIfRequest,
  tradeoff_option: TradeoffOption
): Promise<EventPlan> {
  return requestJson<EventPlan>(
    `/plans/${planId}/apply-tradeoff`,
    'Failed to apply tradeoff option',
    {
      method: 'POST',
      body: JSON.stringify({ what_if_constraints, tradeoff_option }),
    }
  );
}

/** Restore an EventPlan to a previously captured PlanSnapshot. */
export async function restoreSnapshot(planId: string, snapshotId: string): Promise<EventPlan> {
  return requestJson<EventPlan>(
    `/plans/${planId}/snapshots/${snapshotId}/restore`,
    'Failed to restore snapshot',
    { method: 'POST' }
  );
}

/** Lock, shortlist, or reject a VendorCandidate and update category committed spend. */
export async function updateVendorStatus(
  planId: string,
  vendorId: string,
  selection_status: SelectionStatus
): Promise<EventPlan> {
  return requestJson<EventPlan>(
    `/plans/${planId}/vendors/${vendorId}/status`,
    'Failed to update vendor status',
    {
      method: 'POST',
      body: JSON.stringify({ selection_status }),
    }
  );
}

/** Scout additional regional VendorCandidates for a specific BudgetCategory. */
export async function scoutVendors(
  planId: string,
  category_id: string,
  custom_focus?: string
): Promise<EventPlan> {
  return requestJson<EventPlan>(
    `/plans/${planId}/scout-vendors`,
    'Failed to scout vendors',
    {
      method: 'POST',
      body: JSON.stringify({ category_id, custom_focus }),
    }
  );
}

/** Toggle the completion status of a pre-event MilestoneTask. */
export async function toggleMilestone(planId: string, milestoneId: string): Promise<EventPlan> {
  return requestJson<EventPlan>(
    `/plans/${planId}/milestones/${milestoneId}/toggle`,
    'Failed to toggle milestone',
    { method: 'POST' }
  );
}

/** Re-anchor MilestoneTasks and align the day-of Run-of-Show schedule around local sunset. */
export async function optimizeTimeline(planId: string): Promise<EventPlan> {
  return requestJson<EventPlan>(
    `/plans/${planId}/timeline/optimize`,
    'Failed to optimize timeline',
    { method: 'POST' }
  );
}

/** Send a message to the AI Coordinator Chat Drawer and receive grounded guidance. */
export async function sendCoordinatorChat(planId: string, message: string): Promise<EventPlan> {
  return requestJson<EventPlan>(
    `/plans/${planId}/chat`,
    'Failed to send chat message',
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    }
  );
}
