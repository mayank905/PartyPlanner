import React from 'react';
import { RotateCcw } from 'lucide-react';
import { CurrencyCode, PlanSnapshot } from '../types/domain';
import { formatCurrency } from '../utils/currency';

interface SnapshotHistoryProps {
  snapshots: PlanSnapshot[];
  currency: CurrencyCode;
  onRestoreSnapshot: (snapshotId: string) => void;
}

export const SnapshotHistory: React.FC<SnapshotHistoryProps> = React.memo(
  ({ snapshots, currency, onRestoreSnapshot }) => {
    return (
      <section
        id="panel-snapshots"
        role="tabpanel"
        aria-labelledby="tab-snapshots"
        aria-label="Snapshot History"
        className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4"
      >
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Immutable Plan Snapshots & 1-Click Rollback
          </h3>
          <p className="text-xs text-slate-500">
            Every time you apply a Tradeoff Option, UtsavAI records a snapshot of the prior state in SQLite so you can
            experiment freely.
          </p>
        </div>

        {snapshots.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-4">
            No snapshots recorded yet. Simulate a What-If change and click &ldquo;Apply Option&rdquo; to automatically
            create a rollback point.
          </p>
        ) : (
          <div className="space-y-2.5">
            {snapshots.map((snap) => (
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
                  onClick={() => onRestoreSnapshot(snap.id)}
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
    );
  }
);

SnapshotHistory.displayName = 'SnapshotHistory';
