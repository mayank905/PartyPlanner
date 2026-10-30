import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../App';
import * as apiClient from '../api/client';
import { EventPlan, WhatIfEvaluationResponse } from '../types/domain';

const mockPlan: EventPlan = {
  id: 'plan-udaipur-1',
  title: "Aarav & Meera's Intimate Udaipur Wedding",
  created_at: '2026-10-30T10:00:00Z',
  updated_at: '2026-10-30T10:00:00Z',
  active_model: 'gemini-3.1-pro-preview',
  coordinator_mode: 'live_gemini',
  constraint_profile: {
    event_vertical: 'INTIMATE_WEDDING',
    currency_code: 'INR',
    total_budget_limit: 2200000,
    guest_count: 100,
    event_date: '2027-02-14',
    location_city: 'Udaipur',
    venue_capacity_min: 110,
    dietary_restrictions: ['Jain Counter', 'Vegetarian'],
    vibe_tags: ['Heritage Courtyard', 'Golden-Hour Phere'],
    priority_ranking: ['Catering & Royal Feast', 'Venue & Heritage Lawn', 'Decor & Floral Design'],
  },
  weather_context: {
    location_city: 'Udaipur',
    event_date: '2027-02-14',
    latitude: 24.58,
    longitude: 73.71,
    temp_high_c: 29,
    temp_low_c: 16,
    precipitation_prob_pct: 10,
    sunset_time_local: '17:54',
    outdoor_risk_level: 'LOW',
    advisory_note: 'Clear outdoor conditions expected before 17:54 sunset.',
  },
  categories: [
    {
      id: 'cat-catering',
      name: 'Catering & Royal Feast',
      allocated_amount: 700000,
      committed_amount: 0,
      estimated_amount: 650000,
      pricing_model: 'PER_CAPITA',
      base_cost: 100000,
      per_head_cost: 5500,
      tier_step: 50,
      tier_cost: 0,
      notes: 'Live counters & Mewari thali',
    },
    {
      id: 'cat-decor',
      name: 'Decor & Floral Design',
      allocated_amount: 400000,
      committed_amount: 0,
      estimated_amount: 380000,
      pricing_model: 'FLAT_FEE',
      base_cost: 380000,
      per_head_cost: 0,
      tier_step: 50,
      tier_cost: 0,
      notes: 'Marigold & lotus mandap',
    },
  ],
  vendors: [
    {
      id: 'ven-1',
      category_id: 'cat-catering',
      category_name: 'Catering & Royal Feast',
      name: 'Mewar Royal Kitchens',
      pricing_model: 'PER_CAPITA',
      base_cost: 100000,
      per_head_cost: 5500,
      max_capacity: 150,
      lead_time_days: 30,
      tradeoff_notes: 'Includes dedicated Jain counter.',
      selection_status: 'SHORTLISTED',
    },
  ],
  milestones: [
    {
      id: 'ms-1',
      title: 'Lock Udaipur Courtyard Deposit',
      days_before_event: 90,
      due_date: '2026-11-16',
      category_name: 'Venue & Heritage Lawn',
      critical_path: true,
      completed: false,
      depends_on: [],
      is_compressed: false,
    },
  ],
  run_of_show: [
    {
      id: 'ros-1',
      start_time: '16:54',
      duration_minutes: 60,
      title: 'Golden-Hour Varmala & Sunset Portraits',
      category_name: 'Photography & Cinema',
      is_outdoor: true,
      notes: 'Aligned to 17:54 Udaipur sunset.',
    },
  ],
  violations: [],
  snapshots: [
    {
      id: 'snap-1',
      created_at: '2026-10-30T09:30:00Z',
      label: 'Initial 100-Guest Baseline',
      guest_count: 100,
      total_budget_limit: 2200000,
      event_date: '2027-02-14',
      total_estimated: 1030000,
    },
  ],
  chat_history: [
    {
      id: 'chat-1',
      role: 'assistant',
      content: 'Namaste! Ready to coordinate your Udaipur celebration.',
      created_at: '2026-10-30T10:00:00Z',
      active_model: 'gemini-3.1-pro-preview',
    },
  ],
};

const mockWhatIfResponse: WhatIfEvaluationResponse = {
  baseline_total_estimated: 1030000,
  what_if_total_estimated: 1305000,
  budget_delta: 275000,
  updated_categories: [
    {
      ...mockPlan.categories[0],
      estimated_amount: 925000,
    },
    mockPlan.categories[1],
  ],
  updated_milestones: mockPlan.milestones,
  violations: [
    {
      id: 'viol-budget',
      violation_type: 'BUDGET_OVERFLOW',
      severity: 'CRITICAL',
      title: 'Total Celebration Budget Exceeded',
      description: 'Projected spend exceeds your target limit by ₹1,05,000.',
      overflow_amount: 105000,
    },
  ],
  tradeoff_options: [
    {
      id: 'tradeoff-a',
      title: 'Option A: Shield Catering & Trim Floral Package',
      badge: 'Recommended — Priority Aligned',
      summary: 'Protects Catering & Royal Feast while reducing Decor & Floral Design by ₹1,10,000.',
      financial_delta: -110000,
      new_total_estimated: 1195000,
      pros: ['Preserves full per-guest menu'],
      cons: ['Curated mandap floral density'],
      mutations: [
        {
          category_id: 'cat-decor',
          category_name: 'Decor & Floral Design',
          previous_allocated: 400000,
          new_allocated: 270000,
          previous_base_cost: 380000,
          new_base_cost: 270000,
          previous_per_head_cost: 0,
          new_per_head_cost: 0,
          change_rationale: 'Switch to seasonal local marigold & rose styling.',
        },
      ],
    },
  ],
  active_model: 'gemini-3.1-pro-preview',
  coordinator_mode: 'live_gemini',
};

describe('PartyPlanner Workspace UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(apiClient, 'fetchSystemStatus').mockResolvedValue({
      default_currency: 'INR',
      model_cascade: [
        'gemini-3.1-pro-preview',
        'gemini-3-flash-preview',
        'gemini-3.1-flash-lite-preview',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
      ],
      api_key_configured: true,
      coordinator_mode: 'live_gemini',
    });
    vi.spyOn(apiClient, 'fetchPlans').mockResolvedValue([mockPlan]);
    vi.spyOn(apiClient, 'evaluateWhatIf').mockResolvedValue(mockWhatIfResponse);
    vi.spyOn(apiClient, 'applyTradeoff').mockResolvedValue({
      ...mockPlan,
      constraint_profile: {
        ...mockPlan.constraint_profile,
        guest_count: 150,
      },
    });
  });

  it('renders INR (₹) default currency, WeatherContext sunset, and evaluates What-If TradeoffOptions with Diff Preview', async () => {
    render(<App />);

    // Wait for initial plan to hydrate
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Aarav & Meera's Intimate Udaipur Wedding/i })
      ).toBeInTheDocument();
    });

    // Verify sunset & INR currency rendering
    expect(screen.getAllByText(/17:54/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/₹/).length).toBeGreaterThan(0);

    // Run What-If simulation button
    const simulateBtn = screen.getByRole('button', { name: /Simulate What-If & Tradeoffs/i });
    fireEvent.click(simulateBtn);

    // Wait for violation alert and TradeoffOption card
    await waitFor(() => {
      expect(screen.getByText(/Option A: Shield Catering & Trim Floral Package/i)).toBeInTheDocument();
    });

    // Click Preview Diff on Option A
    const previewBtn = screen.getByRole('button', { name: /Preview Diff/i });
    fireEvent.click(previewBtn);

    expect(screen.getByText(/Switch to seasonal local marigold & rose styling/i)).toBeInTheDocument();

    // Click Apply Option
    const applyBtn = screen.getByRole('button', { name: /Apply Option/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(apiClient.applyTradeoff).toHaveBeenCalledTimes(1);
    });
  });

  it('switches across Vendor Matrix, Timeline & Run-of-Show, and Snapshot History tabs', async () => {
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: /Aarav & Meera's Intimate Udaipur Wedding/i })
      ).toBeInTheDocument();
    });

    // Switch to Vendor & Venue Coordinator
    fireEvent.click(screen.getByRole('tab', { name: /Vendor & Venue Coordinator/i }));
    expect(screen.getByText(/Mewar Royal Kitchens/i)).toBeInTheDocument();

    // Switch to Critical-Path Timeline & Run-of-Show
    fireEvent.click(screen.getByRole('tab', { name: /Critical-Path Timeline & Run-of-Show/i }));
    expect(screen.getByText(/Lock Udaipur Courtyard Deposit/i)).toBeInTheDocument();
    expect(screen.getByText(/Golden-Hour Varmala & Sunset Portraits/i)).toBeInTheDocument();

    // Switch to Snapshot History & Rollback
    fireEvent.click(screen.getByRole('tab', { name: /Snapshot History & Rollback/i }));
    expect(screen.getByText(/Initial 100-Guest Baseline/i)).toBeInTheDocument();
  });
});
