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

export function setSessionGeminiApiKey(key: string): void {
  sessionGeminiApiKey = key.trim();
}

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

export async function fetchSystemStatus(): Promise<SystemStatusResponse> {
  const res = await fetch(`${API_BASE}/system/status`, { headers: buildHeaders() });
  if (!res.ok) throw new Error('Failed to fetch system status');
  return res.json();
}

export async function fetchPlans(): Promise<EventPlan[]> {
  const res = await fetch(`${API_BASE}/plans`, { headers: buildHeaders() });
  if (!res.ok) throw new Error('Failed to load celebration plans');
  return res.json();
}

export async function createPlan(title: string, constraint_profile: ConstraintProfile): Promise<EventPlan> {
  const res = await fetch(`${API_BASE}/plans`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ title, constraint_profile }),
  });
  if (!res.ok) throw new Error('Failed to create celebration plan');
  return res.json();
}

export async function evaluateWhatIf(
  planId: string,
  payload: WhatIfRequest
): Promise<WhatIfEvaluationResponse> {
  const res = await fetch(`${API_BASE}/plans/${planId}/evaluate-what-if`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to evaluate what-if constraints');
  return res.json();
}

export async function applyTradeoff(
  planId: string,
  what_if_constraints: WhatIfRequest,
  tradeoff_option: TradeoffOption
): Promise<EventPlan> {
  const res = await fetch(`${API_BASE}/plans/${planId}/apply-tradeoff`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ what_if_constraints, tradeoff_option }),
  });
  if (!res.ok) throw new Error('Failed to apply tradeoff option');
  return res.json();
}

export async function restoreSnapshot(planId: string, snapshotId: string): Promise<EventPlan> {
  const res = await fetch(`${API_BASE}/plans/${planId}/snapshots/${snapshotId}/restore`, {
    method: 'POST',
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error('Failed to restore snapshot');
  return res.json();
}

export async function updateVendorStatus(
  planId: string,
  vendorId: string,
  selection_status: SelectionStatus
): Promise<EventPlan> {
  const res = await fetch(`${API_BASE}/plans/${planId}/vendors/${vendorId}/status`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ selection_status }),
  });
  if (!res.ok) throw new Error('Failed to update vendor status');
  return res.json();
}

export async function scoutVendors(
  planId: string,
  category_id: string,
  custom_focus?: string
): Promise<EventPlan> {
  const res = await fetch(`${API_BASE}/plans/${planId}/scout-vendors`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ category_id, custom_focus }),
  });
  if (!res.ok) throw new Error('Failed to scout vendors');
  return res.json();
}

export async function toggleMilestone(planId: string, milestoneId: string): Promise<EventPlan> {
  const res = await fetch(`${API_BASE}/plans/${planId}/milestones/${milestoneId}/toggle`, {
    method: 'POST',
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error('Failed to toggle milestone');
  return res.json();
}

export async function optimizeTimeline(planId: string): Promise<EventPlan> {
  const res = await fetch(`${API_BASE}/plans/${planId}/timeline/optimize`, {
    method: 'POST',
    headers: buildHeaders(),
  });
  if (!res.ok) throw new Error('Failed to optimize timeline');
  return res.json();
}

export async function sendCoordinatorChat(planId: string, message: string): Promise<EventPlan> {
  const res = await fetch(`${API_BASE}/plans/${planId}/chat`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error('Failed to send chat message');
  return res.json();
}
