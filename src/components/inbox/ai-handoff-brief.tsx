"use client";

import { useEffect, useState } from "react";
import { Sparkles, ChevronDown, ChevronUp, Pin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiHandoffBriefProps {
  summary?: string | null;
  variant?: "desktop" | "mobile";
  className?: string;
  /** True after Resume AI: preserve the brief, but present it as history. */
  historical?: boolean;
}

interface ParsedBrief {
  title?: string;
  items: { label: string; value: string }[];
  previewText: string;
}

export function parseSummary(raw?: string | null): ParsedBrief | null {
  if (!raw || !raw.trim()) return null;

  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  let title: string | undefined;
  const items: { label: string; value: string }[] = [];
  const previewParts: string[] = [];

  for (const line of lines) {
    if (line.startsWith("🤖")) {
      title = line.replace(/^🤖\s*/, "").replace(/:$/, "");
      continue;
    }

    // Match "Key: Value" or "• Key: Value"
    const cleaned = line.replace(/^[•\-*]\s*/, "");
    const colonIdx = cleaned.indexOf(":");
    if (colonIdx > 0) {
      const label = cleaned.slice(0, colonIdx).trim();
      const value = cleaned.slice(colonIdx + 1).trim();
      if (label && value) {
        items.push({ label, value });

        if (
          label === "Service" ||
          label === "Budget" ||
          label === "Timeline" ||
          label === "Need"
        ) {
          previewParts.push(value);
        }
      }
    } else {
      items.push({ label: "", value: cleaned });
    }
  }

  const previewText =
    previewParts.length > 0
      ? previewParts.join(" • ")
      : lines[lines.length - 1] || "AI Handoff Brief";

  return { title, items, previewText };
}

export function AiHandoffBrief({
  summary,
  variant = "desktop",
  className,
  historical = false,
}: AiHandoffBriefProps) {
  const [expanded, setExpanded] = useState(!historical);
  const brief = parseSummary(summary);

  // A fresh handoff should open immediately; Resume AI turns the same
  // preserved summary into collapsed history. Also reset for a newly
  // generated summary on the currently open conversation.
  useEffect(() => setExpanded(!historical), [historical, summary]);

  if (!brief || (brief.items.length === 0 && !brief.title)) {
    return null;
  }

  if (variant === "desktop") {
    return (
      <div className={cn("space-y-2", className)}>
        <button
          type="button"
          onClick={() => historical && setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className={cn(
            "flex w-full items-center gap-2 px-1 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground",
            historical && "cursor-pointer hover:text-foreground",
          )}
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="flex-1">
            {historical ? "Previous AI Handoff Brief" : "AI Handoff Brief"}
          </span>
          {historical && (expanded
            ? <ChevronUp className="h-3.5 w-3.5" />
            : <ChevronDown className="h-3.5 w-3.5" />)}
        </button>
        {expanded && <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-relaxed">
          {brief.title && (
            <p className="mb-2 font-medium text-foreground/90 border-b border-primary/15 pb-1.5 text-[11px]">
              🤖 {brief.title}
            </p>
          )}
          <div className="space-y-1.5">
            {brief.items.map((item, idx) => (
              <div key={idx} className="flex flex-col gap-0.5 sm:flex-row sm:gap-1.5">
                {item.label ? (
                  <>
                    <span className="font-semibold text-foreground/80 shrink-0">
                      {item.label}:
                    </span>
                    <span className="text-muted-foreground break-words flex-1">
                      {item.value}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground break-words">
                    {item.value}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>}
      </div>
    );
  }

  // Mobile / Compact Pinned Bar Variant
  return (
    <div
      className={cn(
        "border-b border-primary/20 bg-primary/5 transition-all duration-200",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-primary/10"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="font-semibold text-primary shrink-0">
            {historical ? "Previous AI Brief" : "AI Brief"}
          </span>
          <span className="text-muted-foreground truncate font-normal">
            {brief.previewText}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 text-[11px] font-medium text-primary">
          <span>{expanded ? "Hide brief" : "View brief"}</span>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-primary/15 px-3 py-2.5 text-xs space-y-1.5 bg-card/90 leading-relaxed">
          {brief.title && (
            <p className="font-medium text-foreground/90 pb-1 text-[11px] border-b border-border/50">
              🤖 {brief.title}
            </p>
          )}
          {brief.items.map((item, idx) => (
            <div key={idx} className="flex flex-col gap-0.5">
              {item.label ? (
                <div className="flex gap-1.5">
                  <span className="font-semibold text-foreground/90 shrink-0">
                    {item.label}:
                  </span>
                  <span className="text-muted-foreground break-words">
                    {item.value}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground break-words">
                  {item.value}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
