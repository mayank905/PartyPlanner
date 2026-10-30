import React, { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { ConstraintProfile, CurrencyCode, EventVertical } from '../types/domain';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, profile: ConstraintProfile) => Promise<void>;
}

const PRESETS: Record<
  EventVertical,
  {
    title: string;
    city: string;
    budgetInr: number;
    guests: number;
    date: string;
    dietary: string;
    vibes: string;
    priorities: string;
  }
> = {
  INTIMATE_WEDDING: {
    title: "Rohan & Ananya's Jaipur Heritage Wedding",
    city: 'Jaipur',
    budgetInr: 2000000,
    guests: 100,
    date: '2027-02-20',
    dietary: 'Jain Counter, Vegetarian, Vegan Desserts',
    vibes: 'Heritage Courtyard, Sunset Phere, Acoustic Folk',
    priorities: 'Catering & Royal Feast, Venue & Heritage Lawn, Photography & Cinema, Decor & Floral Design',
  },
  MILESTONE_BIRTHDAY: {
    title: "Vikram's 50th Sunset Rooftop Soirée",
    city: 'Mumbai',
    budgetInr: 650000,
    guests: 70,
    date: '2027-01-24',
    dietary: 'Vegetarian, Gluten-Free Canapés',
    vibes: 'Rooftop Jazz, Craft Cocktails, Retro Tribute',
    priorities: 'Catering & Craft Cocktails, Venue & Private Lounge, Live Band, DJ & AV, Styling, Lighting & Cake',
  },
  COMMUNITY_EVENT: {
    title: 'Bengaluru GenAI Builders Summit',
    city: 'Bengaluru',
    budgetInr: 550000,
    guests: 140,
    date: '2027-03-15',
    dietary: 'Vegetarian, South Indian High-Tea',
    vibes: 'Live Demos, Lightning Talks, Founder Mixer',
    priorities: 'AV, Stage & Livestream Production, Auditorium & Breakout Venue, Catering & High-Tea Refreshments',
  },
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [vertical, setVertical] = useState<EventVertical>('INTIMATE_WEDDING');
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [title, setTitle] = useState(PRESETS.INTIMATE_WEDDING.title);
  const [city, setCity] = useState(PRESETS.INTIMATE_WEDDING.city);
  const [budget, setBudget] = useState(PRESETS.INTIMATE_WEDDING.budgetInr);
  const [guests, setGuests] = useState(PRESETS.INTIMATE_WEDDING.guests);
  const [eventDate, setEventDate] = useState(PRESETS.INTIMATE_WEDDING.date);
  const [dietary, setDietary] = useState(PRESETS.INTIMATE_WEDDING.dietary);
  const [vibes, setVibes] = useState(PRESETS.INTIMATE_WEDDING.vibes);
  const [priorities, setPriorities] = useState(PRESETS.INTIMATE_WEDDING.priorities);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleVerticalChange = (nextVertical: EventVertical) => {
    setVertical(nextVertical);
    const p = PRESETS[nextVertical];
    setTitle(p.title);
    setCity(p.city);
    setBudget(currency === 'INR' ? p.budgetInr : Math.round(p.budgetInr / 70));
    setGuests(p.guests);
    setEventDate(p.date);
    setDietary(p.dietary);
    setVibes(p.vibes);
    setPriorities(p.priorities);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onCreate(title, {
        event_vertical: vertical,
        currency_code: currency,
        total_budget_limit: Number(budget),
        guest_count: Number(guests),
        event_date: eventDate,
        location_city: city,
        venue_capacity_min: Math.round(Number(guests) * 1.1),
        dietary_restrictions: dietary
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        vibe_tags: vibes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        priority_ranking: priorities
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-amber-950 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <h2 id="onboarding-title" className="text-lg font-semibold">
              Launch New Celebration Blueprint
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="text-amber-200 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-2">
              1. Choose Celebration Archetype (Persona Preset)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['INTIMATE_WEDDING', 'Intimate Wedding (50–150)'],
                  ['MILESTONE_BIRTHDAY', 'Milestone Birthday'],
                  ['COMMUNITY_EVENT', 'Community / Tech Summit'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleVerticalChange(val)}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium border text-left transition ${
                    vertical === val
                      ? 'bg-amber-50 border-amber-600 text-amber-950 ring-2 ring-amber-500/20'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="plan-title" className="block text-xs font-medium text-slate-700 mb-1">
                Celebration Title
              </label>
              <input
                id="plan-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="plan-currency" className="block text-xs font-medium text-slate-700 mb-1">
                Currency (Default ₹ INR)
              </label>
              <select
                id="plan-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="INR">INR (₹ Indian Rupee)</option>
                <option value="USD">USD ($ US Dollar)</option>
                <option value="EUR">EUR (€ Euro)</option>
                <option value="GBP">GBP (£ British Pound)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label htmlFor="plan-city" className="block text-xs font-medium text-slate-700 mb-1">
                City (Weather & Market)
              </label>
              <input
                id="plan-city"
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="plan-date" className="block text-xs font-medium text-slate-700 mb-1">
                Event Date
              </label>
              <input
                id="plan-date"
                type="date"
                required
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="plan-guests" className="block text-xs font-medium text-slate-700 mb-1">
                Guest Count
              </label>
              <input
                id="plan-guests"
                type="number"
                min={10}
                max={1000}
                required
                value={guests}
                onChange={(e) => setGuests(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="plan-budget" className="block text-xs font-medium text-slate-700 mb-1">
                Total Budget Limit ({currency})
              </label>
              <input
                id="plan-budget"
                type="number"
                min={1000}
                step={5000}
                required
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="plan-priorities" className="block text-xs font-medium text-slate-700 mb-1">
              Priority Ranking (Ordered highest to lowest — AI Coordinator shields #1 & #2 first)
            </label>
            <input
              id="plan-priorities"
              type="text"
              value={priorities}
              onChange={(e) => setPriorities(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="plan-dietary" className="block text-xs font-medium text-slate-700 mb-1">
                Dietary Constraints (comma-separated)
              </label>
              <input
                id="plan-dietary"
                type="text"
                value={dietary}
                onChange={(e) => setDietary(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="plan-vibes" className="block text-xs font-medium text-slate-700 mb-1">
                Aesthetic / Vibe Tags (comma-separated)
              </label>
              <input
                id="plan-vibes"
                type="text"
                value={vibes}
                onChange={(e) => setVibes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg text-sm font-semibold bg-amber-700 hover:bg-amber-800 text-white shadow-sm disabled:opacity-50"
            >
              {submitting ? 'Synthesizing Plan...' : 'Create Celebration Blueprint'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
