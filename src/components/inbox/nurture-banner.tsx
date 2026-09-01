"use client";

import { useState, useEffect } from "react";
import { Sparkles, CalendarClock, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface NurtureBannerProps {
  conversationId: string;
  contactId: string;
  reason: string;
  rawPhrase: string | null;
  onDismiss: () => void;
  onAdvanced: () => void;
}

function suggestDate(phrase: string | null): string {
  if (!phrase) return "";
  const lower = phrase.toLowerCase();
  const now = new Date();
  
  if (lower.includes("week")) {
    const match = lower.match(/(\d+)\s*week/);
    const weeks = match ? parseInt(match[1], 10) : 1;
    now.setDate(now.getDate() + (weeks * 7));
  } else if (lower.includes("month")) {
    const match = lower.match(/(\d+)\s*month/);
    const months = match ? parseInt(match[1], 10) : 1;
    now.setMonth(now.getMonth() + months);
  } else if (lower.includes("tomorrow") || lower.includes("kal")) {
    now.setDate(now.getDate() + 1);
  } else {
    return ""; // Too vague or unsupported to invent safely
  }
  
  // Format to YYYY-MM-DDThh:mm for datetime-local
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T09:00`;
}

export function NurtureBanner({
  conversationId,
  contactId,
  reason,
  rawPhrase,
  onDismiss,
  onAdvanced,
}: NurtureBannerProps) {
  const [busy, setBusy] = useState(false);
  const [dateVal, setDateVal] = useState("");
  // fallback for translations
  const t = useTranslations("Inbox.nurtureBanner");

  useEffect(() => {
    if (rawPhrase) {
      const suggested = suggestDate(rawPhrase);
      if (suggested) setDateVal(suggested);
    }
  }, [rawPhrase]);

  const handleAdvance = async () => {
    if (!dateVal) {
      toast.error("Please select a follow-up date and time");
      return;
    }
    
    setBusy(true);
    try {
      const followUpAt = new Date(dateVal).toISOString();
      const res = await fetch(`/api/contacts/${contactId}/advance-deal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          targetStage: "Nurture / Follow-up Later",
          followUpAt
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      toast.success("Deal moved to Nurture. Reminder scheduled.");
      onAdvanced();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "network error";
      toast.error(`Failed to move deal: ${msg}`);
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
        body: JSON.stringify({ dismiss: true, dismissTarget: 'nurture' }),
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
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-3 py-2 text-xs sm:px-4">
      <div className="flex min-w-0 flex-1 items-start sm:items-center gap-2">
        <Sparkles className="h-4 w-4 flex-shrink-0 text-primary mt-0.5 sm:mt-0" />
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-foreground">Follow-up later detected</span>
          <span className="text-muted-foreground truncate">{reason}</span>
          {rawPhrase && (
            <span className="text-muted-foreground italic truncate">
              Customer said: "{rawPhrase}"
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0 w-full sm:w-auto">
        <input 
          type="datetime-local" 
          value={dateVal}
          onChange={(e) => setDateVal(e.target.value)}
          className="rounded-md border border-input bg-transparent px-2 py-1 text-xs"
          required
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAdvance}
            disabled={busy || !dateVal}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
            Move to Nurture
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
    </div>
  );
}
