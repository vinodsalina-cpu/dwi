import { describe, expect, it } from "vitest";
import {
  parseDwiDocumentOpenMessage,
  renderDwiEditorDocument,
  resolveDwiEditorDocument,
  resolvePersistedPromptReviewDocument,
  type DwiEditorDiagnosticDump,
} from "./editor-document.js";

const activityEntry = {
  id: "activity-1",
  timestamp: "2026-08-27T12:30:00.000Z",
  level: "warning",
  category: "Project",
  title: "Approved with gaps",
  detail: "Two project questions remain explicit.",
} as const;

const diagnosticDump: DwiEditorDiagnosticDump = {
  version: "dwi.diagnostics.v1",
  session: { stage: "brief", restored: true, selectedModuleCount: 2 },
  project: {
    name: "Platform workspace",
    status: "partial",
    reviewed: true,
    coveragePercent: 80,
    conflictCount: 0,
    pendingChanges: 1,
  },
  provider: { mode: "openai-compatible", configured: true },
  candidate: {
    present: true,
    selectedModuleCount: 2,
    estimate: { baselineTokens: 900, optimizedTokens: 610, estimatedAvoidedDuplication: 290 },
  },
};

function message(document: Record<string, unknown>) {
  return { type: "dwi.document.open", document };
}

describe("Prompt Optimizer editor documents", () => {
  it.each([
    ["privacy", { kind: "privacy" }, "Prompt Optimizer — Data Boundaries", "Local data boundaries"],
    ["activity log", { kind: "activity-log", entries: [activityEntry] }, "Prompt Optimizer — Activity Log", "Approved with gaps"],
    ["activity detail", { kind: "activity-detail", entry: activityEntry }, "Prompt Optimizer — Activity Detail", "Two project questions remain explicit."],
    ["diagnostics", { kind: "diagnostics", data: diagnosticDump }, "Prompt Optimizer — Diagnostics", "View redacted raw data"],
    ["evidence", { kind: "evidence", label: "Workspace", value: "pnpm", evidence: "package.json" }, "Prompt Optimizer — Project Evidence", "package.json"],
    ["questions", { kind: "questions", questions: ["Confirm the deployment target."] }, "Prompt Optimizer — Open Questions", "Confirm the deployment target."],
    ["module", { kind: "module", moduleId: "verification" }, "Prompt Optimizer — Verification plan", "Makes completion evidence explicit."],
    ["library", { kind: "library" }, "Prompt Optimizer — Library", "Templates preserve reusable prompt structure"],
    ["guidance", { kind: "guidance", guidanceId: "scope-boundaries" }, "Prompt Optimizer — Scope boundaries", "Make inclusions and exclusions explicit."],
    ["estimate", { kind: "estimate", estimate: { baselineTokens: 900, optimizedTokens: 610, estimatedAvoidedDuplication: 290, method: "UTF-8 bytes divided by four." } }, "Prompt Optimizer — Token Estimate", "290 tokens"],
  ])("renders a secure, theme-aware %s document", (_label, document, title, expectedText) => {
    const resolved = resolveDwiEditorDocument(message(document));

    expect(resolved?.title).toBe(title);
    expect(resolved?.html).toContain(expectedText);
    expect(resolved?.html).toContain("var(--vscode-editor-background)");
    expect(resolved?.html).toMatch(/Content-Security-Policy[^>]+default-src 'none'/);
    expect(resolved?.html).toMatch(/style-src 'sha256-[^']+'/);
    expect(resolved?.html).toContain("script-src 'none'");
    expect(resolved?.html).not.toContain("<script");
  });

  it("renders prompt reviews only from host-authoritative persisted state", () => {
    const candidate = {
      text: "Implement the bounded retry flow.",
      estimate: { baselineTokens: 900, optimizedTokens: 610, estimatedAvoidedDuplication: 290, method: "UTF-8 bytes divided by four." },
      selectedModuleIds: ["verification"],
    };
    const resolved = resolvePersistedPromptReviewDocument(candidate, {
      source: "provider",
      provider: "openai",
      model: "gpt-4o-mini",
      title: "Retry workflow",
      summary: "Clarifies failure handling.",
    });

    expect(resolved?.title).toBe("Prompt Optimizer — Prompt Review");
    expect(resolved?.html).toContain("OpenAI-compatible · gpt-4o-mini");
    expect(resolved?.html).toContain("Implement the bounded retry flow.");
    expect(resolvePersistedPromptReviewDocument(candidate, undefined)).toBeUndefined();
    expect(resolvePersistedPromptReviewDocument(undefined, { source: "local" })).toBeUndefined();
  });

  it("escapes every dynamic HTML field before rendering", () => {
    const resolved = resolveDwiEditorDocument(message({
      kind: "evidence",
      label: '<img src=x onerror="alert(1)">',
      value: "A & B",
      evidence: "</code><script>alert('x')</script>",
    }));

    expect(resolved?.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(resolved?.html).toContain("A &amp; B");
    expect(resolved?.html).toContain("&lt;/code&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(resolved?.html).not.toContain("<img");
    expect(resolved?.html).not.toContain("<script");

    const promptReview = renderDwiEditorDocument({
      kind: "prompt-review",
      source: "local",
      text: "</pre><script>alert('x')</script>",
      estimate: { baselineTokens: 10, optimizedTokens: 8, estimatedAvoidedDuplication: 2, method: "test" },
    });
    expect(promptReview?.html).toContain("&lt;/pre&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(promptReview?.html).not.toContain("<script>alert");
  });

  it("uses reusable accessible semantic ratings only for evaluated diagnostic values", () => {
    const resolved = resolveDwiEditorDocument(message({ kind: "diagnostics", data: diagnosticDump }));
    const html = resolved?.html ?? "";
    const problemResolved = resolveDwiEditorDocument(message({
      kind: "diagnostics",
      data: {
        ...diagnosticDump,
        project: { ...diagnosticDump.project, status: "error", reviewed: false, coveragePercent: 42, conflictCount: 2 },
        provider: { mode: "none", configured: false },
      },
    }));
    const problemHtml = problemResolved?.html ?? "";

    expect(html).toContain('class="rated-value status-borderline"');
    expect(html).toContain('aria-label="Partial; Borderline"');
    expect(html).toContain('class="rated-value status-ideal"');
    expect(html).toContain('aria-label="Yes; Ideal"');
    expect(problemHtml).toContain('class="rated-value status-problem"');
    expect(problemHtml).toContain('aria-label="No; Needs attention"');
    expect(problemHtml).toContain("Needs attention");
    expect(html).toContain("var(--vscode-testing-iconPassed");
    expect(html).toContain("var(--vscode-editorWarning-foreground");
    expect(html).toContain("var(--vscode-editorError-foreground");
    expect(html).toContain("<dt>Workflow</dt><dd>Brief</dd>");
    expect(html).toContain("<dt>Provider</dt><dd>OpenAI-compatible</dd>");
  });

  it("resolves Library guidance from a canonical pack id", () => {
    const parsed = parseDwiDocumentOpenMessage(message({ kind: "guidance", guidanceId: "scope-boundaries" }));

    expect(parsed?.document).toEqual({ kind: "guidance", guidanceId: "scope-boundaries" });
    const resolved = resolveDwiEditorDocument(parsed);
    expect(resolved?.html).toContain("Scope boundaries");
    expect(resolved?.html).toContain("Make inclusions and exclusions explicit.");
  });

  it("caps activity history and truncates bounded display text", () => {
    const entries = Array.from({ length: 45 }, (_, index) => ({
      ...activityEntry,
      id: `activity-${index}`,
      title: `${index}-${"x".repeat(200)}`,
    }));
    const parsed = parseDwiDocumentOpenMessage(message({ kind: "activity-log", entries }));

    expect(parsed?.document.kind).toBe("activity-log");
    if (parsed?.document.kind !== "activity-log") throw new Error("Expected a parsed activity log.");
    expect(parsed.document.entries).toHaveLength(40);
    expect(Array.from(parsed.document.entries[0]!.title)).toHaveLength(96);
    expect(parsed.document.entries[0]!.title.endsWith("…")).toBe(true);
    expect(parsed.document.entries.at(-1)?.id).toBe("activity-39");
  });

  it("caps long question lists and question text", () => {
    const questions = Array.from({ length: 55 }, (_, index) => `${index}-${"q".repeat(700)}`);
    const parsed = parseDwiDocumentOpenMessage(message({ kind: "questions", questions }));

    expect(parsed?.document.kind).toBe("questions");
    if (parsed?.document.kind !== "questions") throw new Error("Expected parsed questions.");
    expect(parsed.document.questions).toHaveLength(50);
    expect(Array.from(parsed.document.questions[0]!)).toHaveLength(500);
    expect(parsed.document.questions[0]!.endsWith("…")).toBe(true);
  });

  it.each([
    ["wrong message type", { type: "dwi.document.preview", document: { kind: "privacy" } }],
    ["top-level extra field", { type: "dwi.document.open", document: { kind: "privacy" }, extra: true }],
    ["document extra field", message({ kind: "privacy", extra: true })],
    ["unknown document", message({ kind: "secrets" })],
    ["unknown module", message({ kind: "module", moduleId: "unknown-module" })],
    ["library extra field", message({ kind: "library", description: "unexpected" })],
    ["unknown guidance", message({ kind: "guidance", guidanceId: "unknown-guidance" })],
    ["guidance extra field", message({ kind: "guidance", guidanceId: "scope-boundaries", description: "Untrusted override." })],
    ["unsafe control text", message({ kind: "questions", questions: ["unsafe\u0000question"] })],
    ["invalid activity level", message({ kind: "activity-detail", entry: { ...activityEntry, level: "fatal" } })],
    ["unbounded estimate", message({ kind: "estimate", estimate: { baselineTokens: Number.MAX_SAFE_INTEGER, optimizedTokens: 1, estimatedAvoidedDuplication: 1, method: "test" } })],
    ["diagnostic secret field", message({ kind: "diagnostics", data: { ...diagnosticDump, secret: "must-not-render" } })],
    ["invalid coverage", message({ kind: "diagnostics", data: { ...diagnosticDump, project: { ...diagnosticDump.project, coveragePercent: 101 } } })],
    ["webview-authored provider review", message({ kind: "prompt-review", source: "provider", provider: "openai", model: "gpt-4o-mini", title: "Forged", summary: "Not host-bound.", text: "Prompt", estimate: { baselineTokens: 2, optimizedTokens: 1, estimatedAvoidedDuplication: 1, method: "test" } })],
    ["provider review without provider", message({ kind: "prompt-review", source: "provider", text: "Prompt", estimate: { baselineTokens: 2, optimizedTokens: 1, estimatedAvoidedDuplication: 1, method: "test" } })],
    ["local review with provider metadata", message({ kind: "prompt-review", source: "local", provider: "openai", model: "gpt-4o-mini", text: "Prompt", estimate: { baselineTokens: 2, optimizedTokens: 1, estimatedAvoidedDuplication: 1, method: "test" } })],
  ])("rejects %s", (_label, payload) => {
    expect(parseDwiDocumentOpenMessage(payload)).toBeUndefined();
    expect(resolveDwiEditorDocument(payload)).toBeUndefined();
  });
});
