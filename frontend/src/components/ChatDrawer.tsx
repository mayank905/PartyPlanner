import React, { useState } from 'react';
import { Bot, CheckCircle2, Eye, MessageSquare, Send, X } from 'lucide-react';
import { CoordinatorChatTurn, CurrencyCode, TradeoffOption } from '../types/domain';
import { formatCurrency } from '../utils/currency';

interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  chatHistory: CoordinatorChatTurn[];
  currency: CurrencyCode;
  onSendMessage: (message: string) => Promise<void>;
  onPreviewTradeoff: (option: TradeoffOption) => void;
  onApplyTradeoff: (option: TradeoffOption) => Promise<void>;
}

const QUICK_PROMPTS = [
  'What if we add 25 last-minute family guests without increasing our total budget?',
  'How can we negotiate the heritage venue & catering per-plate rate by 15%?',
  'What weather backup should we lock before sunset?',
];

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  isOpen,
  onClose,
  chatHistory,
  currency,
  onSendMessage,
  onPreviewTradeoff,
  onApplyTradeoff,
}) => {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setInput('');
    try {
      await onSendMessage(trimmed);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside
      aria-label="AI Coordinator Chat Drawer"
      className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col"
    >
      <div className="px-5 py-4 bg-amber-950 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Bot className="w-5 h-5 text-amber-300" />
          <div>
            <h2 className="text-sm font-semibold">AI Celebration Coordinator</h2>
            <p className="text-[11px] text-amber-200/90">
              Grounded in your live budget, vendor capacities & sunset schedule
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Coordinator Chat"
          className="text-amber-200 hover:text-white p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-2.5 bg-amber-50/70 border-b border-amber-200/70 flex flex-wrap gap-1.5">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => handleSend(q)}
            className="text-[11px] bg-white hover:bg-amber-100/70 text-amber-950 border border-amber-300/80 px-2.5 py-1 rounded-full transition text-left"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.map((turn) => (
          <div
            key={turn.id}
            className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                turn.role === 'user'
                  ? 'bg-amber-800 text-white rounded-br-none'
                  : 'bg-slate-100 text-slate-800 border border-slate-200 rounded-bl-none'
              }`}
            >
              <div className="whitespace-pre-line">{turn.content}</div>
              {turn.role === 'assistant' && (
                <div className="mt-2 pt-1.5 border-t border-slate-200/70 flex items-center justify-between text-[10px] text-slate-500">
                  <span>Engine: {turn.active_model}</span>
                </div>
              )}
            </div>

            {turn.suggested_tradeoff && (
              <div className="mt-2 w-[92%] rounded-xl border border-amber-300 bg-amber-50/70 p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-200 text-amber-950">
                    Executable Tradeoff Card
                  </span>
                  <span className="text-xs font-bold text-emerald-800">
                    New Total: {formatCurrency(turn.suggested_tradeoff.new_total_estimated, currency)}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-900">{turn.suggested_tradeoff.title}</p>
                <p className="text-[11px] text-slate-600 mt-0.5">{turn.suggested_tradeoff.summary}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onPreviewTradeoff(turn.suggested_tradeoff!);
                      onClose();
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-800 hover:bg-slate-50"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview Diff
                  </button>
                  <button
                    type="button"
                    onClick={() => onApplyTradeoff(turn.suggested_tradeoff!)}
                    className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-700 text-white hover:bg-amber-800"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Apply Option
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {sending && (
          <div className="text-xs text-slate-500 italic flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 animate-pulse text-amber-700" />
            Coordinator is evaluating constraints & tradeoffs...
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
        className="p-3 border-t border-slate-200 bg-slate-50 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask 'What if...' or vendor negotiation questions..."
          aria-label="Ask the AI Coordinator"
          className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-600"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="px-3.5 py-2 rounded-xl bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </form>
    </aside>
  );
};
