import React from 'react';
import { Sunset } from 'lucide-react';
import { MilestoneTask, RunOfShowItem } from '../types/domain';

interface TimelineRunOfShowProps {
  milestones: MilestoneTask[];
  runOfShow: RunOfShowItem[];
  sunsetTimeLocal: string;
  optimizingTimeline: boolean;
  onToggleMilestone: (milestoneId: string) => void;
  onOptimizeTimeline: () => void;
}

export const TimelineRunOfShow: React.FC<TimelineRunOfShowProps> = React.memo(
  ({
    milestones,
    runOfShow,
    sunsetTimeLocal,
    optimizingTimeline,
    onToggleMilestone,
    onOptimizeTimeline,
  }) => {
    return (
      <section
        id="panel-timeline"
        role="tabpanel"
        aria-labelledby="tab-timeline"
        aria-label="Timeline and Run of Show"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
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
            {milestones.map((ms) => (
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
                    onChange={() => onToggleMilestone(ms.id)}
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
                Day-Of Run-of-Show (Aligned to {sunsetTimeLocal} Sunset)
              </h3>
              <p className="text-xs text-slate-500">
                Synchronizes outdoor ceremonies, golden-hour portraits, and weather contingencies.
              </p>
            </div>
            <button
              type="button"
              onClick={onOptimizeTimeline}
              disabled={optimizingTimeline}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-semibold transition disabled:opacity-50"
            >
              <Sunset className="w-3.5 h-3.5 text-amber-700" />
              {optimizingTimeline ? 'Optimizing...' : 'Optimize Schedule for Sunset'}
            </button>
          </div>

          <div className="space-y-3">
            {runOfShow.map((item) => (
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
    );
  }
);

TimelineRunOfShow.displayName = 'TimelineRunOfShow';
