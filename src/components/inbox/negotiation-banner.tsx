"use client";

import { useState } from "react";
import { Sparkles, Handshake, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface NegotiationBannerProps {
  conversationId: string;
  contactId: string;
  reason: string;
  onDismiss: () => void;
  onAdvanced: () => void;
}

export function NegotiationBanner({
  conversationId,
  contactId,
  reason,
  onDismiss,
  onAdvanced,
}: NegotiationBannerProps) {
  const [busy, setBusy] = useState(false);
  const t = useTranslations("Inbox.negotiationBanner"); // Need to check if translations exist, fallback if not

  const handleAdvance = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/advance-deal`, {
        method: "POST",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      toast.success("Deal moved to Negotiation");
      onAdvanced();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      toast.error(`Failed to advance deal: ${msg}`);
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
        body: JSON.stringify({ dismiss: true }),
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

  return (
    <div className="flex items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-3 py-2 text-xs sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-foreground">Commercial discussion detected</span>
          <span className="truncate text-muted-foreground">{reason}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleAdvance}
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Handshake className="h-3.5 w-3.5" />}
          Move to Negotiation
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
