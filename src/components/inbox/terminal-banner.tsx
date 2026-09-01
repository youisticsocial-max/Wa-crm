"use client";

import { useState } from "react";
import { Sparkles, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface TerminalBannerProps {
  conversationId: string;
  contactId: string;
  outcome: "won" | "lost";
  reason: string;
  onDismiss: () => void;
  onResolved: () => void;
}

export function TerminalBanner({
  conversationId,
  contactId,
  outcome,
  reason,
  onDismiss,
  onResolved,
}: TerminalBannerProps) {
  const [busy, setBusy] = useState(false);

  const handleResolve = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/advance-deal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: outcome }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      
      toast.success(`Deal marked as ${outcome === 'won' ? 'Won' : 'Lost'}`);
      onResolved();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      toast.error(`Failed to update deal: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/advance-deal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismiss: true, dismissTarget: "terminal" }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      onDismiss();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      toast.error(`Failed to dismiss: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const isWon = outcome === "won";

  return (
    <div className={`flex items-center justify-between gap-3 border-b px-3 py-2 text-xs sm:px-4 ${isWon ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Sparkles className={`h-4 w-4 flex-shrink-0 ${isWon ? 'text-green-600' : 'text-red-600'}`} />
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-foreground">
            {isWon ? "Customer appears ready to proceed" : "Customer appears to have declined"}
          </span>
          <span className="truncate text-muted-foreground">{reason}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleResolve}
          disabled={busy}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors disabled:opacity-50 ${
            isWon ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isWon ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
          {isWon ? "Mark Won" : "Mark Lost"}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={busy}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
