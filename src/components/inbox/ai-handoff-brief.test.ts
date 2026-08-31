import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AiHandoffBrief, parseSummary } from "./ai-handoff-brief";

const SUMMARY = `ðŸ¤– AI agent handed off (after 1 reply):
Need: Header color change
Handoff reason: Exact delivery confirmation required`;

describe("parseSummary", () => {
  it("returns null for null, undefined, or empty summary", () => {
    expect(parseSummary(null)).toBeNull();
    expect(parseSummary(undefined)).toBeNull();
    expect(parseSummary("   ")).toBeNull();
  });

  it("parses structured multiline handoff brief", () => {
    const raw = `🤖 AI agent handed off (after 2 replies):
Service: Custom ERP
Need: Inventory + creditors + billing
Budget: ₹1 lakh
Timeline: 5 days
Handoff reason: Exact quotation requested
Next action: Review scope and confirm price/timeline`;

    const parsed = parseSummary(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("AI agent handed off (after 2 replies)");
    expect(parsed?.items).toHaveLength(6);
    expect(parsed?.items[0]).toEqual({ label: "Service", value: "Custom ERP" });
    expect(parsed?.items[1]).toEqual({ label: "Need", value: "Inventory + creditors + billing" });
    expect(parsed?.items[2]).toEqual({ label: "Budget", value: "₹1 lakh" });
    expect(parsed?.items[3]).toEqual({ label: "Timeline", value: "5 days" });
    expect(parsed?.items[4]).toEqual({ label: "Handoff reason", value: "Exact quotation requested" });
    expect(parsed?.items[5]).toEqual({ label: "Next action", value: "Review scope and confirm price/timeline" });
    expect(parsed?.previewText).toContain("Custom ERP");
    expect(parsed?.previewText).toContain("₹1 lakh");
    expect(parsed?.previewText).toContain("5 days");
  });

  it("handles un-bulleted or simple summary gracefully", () => {
    const raw = `🤖 AI agent handed off (without replying):
Handoff reason: Complex query needing human assistance`;

    const parsed = parseSummary(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.title).toBe("AI agent handed off (without replying)");
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]).toEqual({ label: "Handoff reason", value: "Complex query needing human assistance" });
    expect(parsed?.previewText).toBe("Handoff reason: Complex query needing human assistance");
  });
});

describe("AiHandoffBrief state labeling", () => {
  it("labels a resumed brief as previous and collapses its details", () => {
    const html = renderToStaticMarkup(
      createElement(AiHandoffBrief, {
        summary: SUMMARY,
        variant: "desktop",
        historical: true,
      }),
    );

    expect(html).toContain("Previous AI Handoff Brief");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Header color change");
  });

  it("shows a fresh paused handoff as active and expanded", () => {
    const html = renderToStaticMarkup(
      createElement(AiHandoffBrief, {
        summary: SUMMARY,
        variant: "desktop",
        historical: false,
      }),
    );

    expect(html).toContain("AI Handoff Brief");
    expect(html).not.toContain("Previous AI Handoff Brief");
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Header color change");
  });

  it("uses the same historical distinction in the mobile brief", () => {
    const html = renderToStaticMarkup(
      createElement(AiHandoffBrief, {
        summary: SUMMARY,
        variant: "mobile",
        historical: true,
      }),
    );

    expect(html).toContain("Previous AI Brief");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("View brief");
    expect(html).not.toContain("Handoff reason:");
  });
});
