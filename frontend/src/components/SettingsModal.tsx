import React, { useState } from 'react';
import { Cpu, KeyRound, ShieldCheck, X } from 'lucide-react';
import { getSessionGeminiApiKey, setSessionGeminiApiKey } from '../api/client';
import { SystemStatusResponse } from '../types/domain';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemStatus: SystemStatusResponse | null;
  onKeyUpdated: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  systemStatus,
  onKeyUpdated,
}) => {
  const [apiKeyInput, setApiKeyInput] = useState(getSessionGeminiApiKey());

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSessionGeminiApiKey(apiKeyInput);
    await onKeyUpdated();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-400" />
            <h2 id="settings-modal-title" className="text-base font-semibold">
              AI Coordinator Engine & 5-Model Cascade
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-slate-400 hover:text-white p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Gemini 3 Series Fallback Cascade
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-medium">
                Auto-Failover Enabled
              </span>
            </div>
            <p className="text-xs text-slate-600">
              If any model hits quota or availability limits (429/503), requests cascade automatically through:
            </p>
            <ol className="text-xs font-mono text-slate-800 space-y-1 pl-4 list-decimal">
              {(
                systemStatus?.model_cascade || [
                  'gemini-3.1-pro-preview',
                  'gemini-3-flash-preview',
                  'gemini-3.1-flash-lite-preview',
                  'gemini-2.5-pro',
                  'gemini-2.5-flash',
                ]
              ).map((m, idx) => (
                <li key={m} className={idx < 3 ? 'font-semibold text-amber-900' : 'text-slate-600'}>
                  {m} {idx === 0 && '(Primary)'}
                </li>
              ))}
            </ol>
            <div className="pt-2 border-t border-slate-200 flex items-center gap-2 text-xs text-emerald-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Final Resilient Coordinator Fallback guarantees 100% functionality even if API credits expire.
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="gemini-key-input" className="block text-xs font-semibold text-slate-700 mb-1">
              Optional Session Gemini API Key (Sent via X-Gemini-API-Key header, never stored in repo)
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                id="gemini-key-input"
                type="password"
                placeholder="Paste AIza... key here or leave blank to use backend .env / Resilient Mode"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Close
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-700 hover:bg-amber-800 text-white"
            >
              Save Session Key
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
