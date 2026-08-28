import { createHash } from "node:crypto";
import { DWI_MODULES, type DwiCandidate } from "@platform/dwi-core";
import { PROMPT_GUIDANCE_PACKS } from "@platform/domain-prompt-optimizer/catalog";
import { promptGuidancePackIds, type PromptGuidancePackId } from "@platform/domain-prompt-optimizer/types";
import type { DwiOptimizerReview } from "./workspace-snapshot.js";

const MAX_ACTIVITY_ENTRIES = 40;
const MAX_ACTIVITY_ID_CHARS = 128;
const MAX_ACTIVITY_TIMESTAMP_CHARS = 64;
const MAX_ACTIVITY_CATEGORY_CHARS = 32;
const MAX_ACTIVITY_TITLE_CHARS = 96;
const MAX_ACTIVITY_DETAIL_CHARS = 240;
const MAX_DISPLAY_LABEL_CHARS = 96;
const MAX_DISPLAY_VALUE_CHARS = 1_024;
const MAX_EVIDENCE_CHARS = 2_048;
const MAX_QUESTIONS = 50;
const MAX_QUESTION_CHARS = 500;
const MAX_ESTIMATE_METHOD_CHARS = 500;
const MAX_PROMPT_REVIEW_CHARS = 128 * 1024;
const MAX_COUNTER = 1_000_000_000;

const DOCUMENT_STYLES = `
:root {
  color-scheme: light dark;
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
}

* { box-sizing: border-box; }

html, body { min-width: 0; min-height: 100%; }

body {
  margin: 0;
  padding: 0;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
}

.document {
  width: min(960px, 100%);
  margin: 0 auto;
  padding: clamp(20px, 4vw, 44px);
}

.document-header {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--vscode-editorWidget-border);
}

.eyebrow {
  margin: 0 0 7px;
  color: var(--vscode-descriptionForeground);
  font-size: 0.78rem;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1, h2, p, dl, ol { margin-top: 0; }

h1 {
  margin-bottom: 8px;
  font-size: clamp(1.45rem, 3vw, 2rem);
  line-height: 1.2;
  overflow-wrap: anywhere;
}

h2 {
  margin-bottom: 10px;
  font-size: 1rem;
  line-height: 1.35;
}

.lede {
  max-width: 72ch;
  margin-bottom: 0;
  color: var(--vscode-descriptionForeground);
  line-height: 1.55;
}

.section {
  padding: 20px 0;
  border-bottom: 1px solid var(--vscode-editorWidget-border);
}

.section:last-child { border-bottom: 0; }

.stat-grid, .detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(155px, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 6px;
  background: var(--vscode-editorWidget-border);
}

.stat-grid > div, .detail-grid > div {
  min-width: 0;
  padding: 12px;
  background: var(--vscode-editorWidget-background);
}

dt {
  margin-bottom: 4px;
  color: var(--vscode-descriptionForeground);
  font-size: 0.78rem;
}

dd {
  margin: 0;
  font-weight: 620;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.rated-value {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}

.rated-value.status-ideal { color: var(--vscode-testing-iconPassed, #2ea043); }
.rated-value.status-borderline { color: var(--vscode-editorWarning-foreground, #b58105); }
.rated-value.status-problem { color: var(--vscode-editorError-foreground, #d73a49); }

.status-symbol { width: 1.1em; flex: 0 0 auto; text-align: center; }
.status-cue {
  border: 1px solid currentColor;
  border-radius: 999px;
  padding: 1px 6px;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.activity-list {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.activity-entry {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  padding: 14px 0;
  border-bottom: 1px solid var(--vscode-editorWidget-border);
}

.activity-entry:last-child { border-bottom: 0; }

.activity-entry h2 { margin: 0; }

.activity-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 10px;
  margin: 4px 0 0;
  color: var(--vscode-descriptionForeground);
  font-size: 0.8rem;
}

.activity-detail {
  margin: 8px 0 0;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.badge {
  align-self: start;
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 999px;
  padding: 2px 7px;
  color: var(--vscode-descriptionForeground);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.badge.warning { color: var(--vscode-editorWarning-foreground); }
.badge.error { color: var(--vscode-editorError-foreground); }
.badge.info { color: var(--vscode-editorInfo-foreground); }

.empty {
  border: 1px dashed var(--vscode-editorWidget-border);
  border-radius: 6px;
  padding: 18px;
  color: var(--vscode-descriptionForeground);
}

.prose, .question-list { max-width: 76ch; line-height: 1.6; }
.question-list { padding-left: 1.5rem; }
.question-list li + li { margin-top: 8px; }

code, pre {
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size);
}

code {
  overflow-wrap: anywhere;
  color: var(--vscode-textPreformat-foreground);
}

details {
  border: 1px solid var(--vscode-editorWidget-border);
  border-radius: 6px;
  background: var(--vscode-editorWidget-background);
}

summary {
  min-height: 32px;
  padding: 9px 11px;
  cursor: pointer;
  font-weight: 620;
}

summary:focus-visible {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: -1px;
}

pre {
  max-width: 100%;
  margin: 0;
  overflow: auto;
  border-top: 1px solid var(--vscode-editorWidget-border);
  padding: 12px;
  color: var(--vscode-editor-foreground);
  line-height: 1.5;
  tab-size: 2;
}

@media (max-width: 520px) {
  .document { padding: 18px; }
  .stat-grid, .detail-grid { grid-template-columns: 1fr; }
  .activity-entry { grid-template-columns: 1fr; gap: 6px; }
  .badge { justify-self: start; }
}
`.trim();

const STYLE_HASH = createHash("sha256").update(DOCUMENT_STYLES).digest("base64");

const STAGES = ["consent", "brief", "compose", "evaluate"] as const;
const PROJECT_STATUSES = ["scanning", "current", "stale", "partial", "conflict", "unsupported", "error"] as const;
const PROVIDER_MODES = ["none", "gemini", "openai-compatible"] as const;
const ACTIVITY_LEVELS = ["info", "warning", "error"] as const;

type Stage = (typeof STAGES)[number];
type ProjectStatus = (typeof PROJECT_STATUSES)[number];
type ProviderMode = (typeof PROVIDER_MODES)[number];
export type DwiEditorActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export interface DwiEditorActivityEntry {
  id: string;
  timestamp: string;
  level: DwiEditorActivityLevel;
  category: string;
  title: string;
  detail?: string;
}

export interface DwiEditorDiagnosticDump {
  version: "dwi.diagnostics.v1";
  session: {
    stage: Stage;
    restored: boolean;
    selectedModuleCount: number;
  };
  project: {
    name: string;
    status: ProjectStatus;
    reviewed: boolean;
    coveragePercent: number;
    conflictCount: number;
    pendingChanges: number;
  };
  provider: {
    mode: ProviderMode;
    configured: boolean;
  };
  candidate:
    | { present: false }
    | {
      present: true;
      selectedModuleCount: number;
      estimate: {
        baselineTokens: number;
        optimizedTokens: number;
        estimatedAvoidedDuplication: number;
      };
    };
}

export interface DwiEditorEstimate {
  baselineTokens: number;
  optimizedTokens: number;
  estimatedAvoidedDuplication: number;
  method: string;
}

export interface DwiEditorPromptReview {
  source: "local" | "provider";
  text: string;
  estimate: DwiEditorEstimate;
  title?: string;
  summary?: string;
  provider?: "gemini" | "openai";
  model?: string;
}

export type DwiEditorDocument =
  | { kind: "privacy" }
  | { kind: "activity-log"; entries: DwiEditorActivityEntry[] }
  | { kind: "activity-detail"; entry: DwiEditorActivityEntry }
  | { kind: "diagnostics"; data: DwiEditorDiagnosticDump }
  | { kind: "evidence"; label: string; value: string; evidence: string }
  | { kind: "questions"; questions: string[] }
  | { kind: "module"; moduleId: string }
  | { kind: "library" }
  | { kind: "guidance"; guidanceId: PromptGuidancePackId }
  | { kind: "estimate"; estimate: DwiEditorEstimate }
  | ({ kind: "prompt-review" } & DwiEditorPromptReview);

export type DwiWebviewEditorDocument = Exclude<DwiEditorDocument, { kind: "prompt-review" }>;

export interface DwiDocumentOpenMessage {
  type: "dwi.document.open";
  document: DwiWebviewEditorDocument;
}

export interface ResolvedDwiEditorDocument {
  title: string;
  html: string;
  document: DwiEditorDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key));
}

function containsUnsafeControlText(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      (codePoint < 32 && character !== "\n" && character !== "\r" && character !== "\t") ||
      (codePoint >= 127 && codePoint <= 159) ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069)
    ) return true;
  }
  return false;
}

function boundedText(value: unknown, maxChars: number, allowEmpty = false): string | undefined {
  if (typeof value !== "string" || containsUnsafeControlText(value)) return undefined;
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized && !allowEmpty) return undefined;
  const characters = Array.from(normalized);
  if (characters.length <= maxChars) return normalized;
  return `${characters.slice(0, Math.max(0, maxChars - 1)).join("")}…`;
}

function boundedPromptText(value: unknown): string | undefined {
  if (typeof value !== "string" || containsUnsafeControlText(value) || !value.trim()) return undefined;
  const characters = Array.from(value.trim());
  return characters.length <= MAX_PROMPT_REVIEW_CHARS
    ? characters.join("")
    : `${characters.slice(0, MAX_PROMPT_REVIEW_CHARS - 1).join("")}…`;
}

function boundedInteger(value: unknown, max = MAX_COUNTER): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : undefined;
}

function isOneOf<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.includes(value as T);
}

function parseActivityEntry(value: unknown): DwiEditorActivityEntry | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "timestamp", "level", "category", "title"], ["detail"])) return undefined;
  const id = boundedText(value.id, MAX_ACTIVITY_ID_CHARS);
  const timestamp = boundedText(value.timestamp, MAX_ACTIVITY_TIMESTAMP_CHARS);
  const category = boundedText(value.category, MAX_ACTIVITY_CATEGORY_CHARS);
  const title = boundedText(value.title, MAX_ACTIVITY_TITLE_CHARS);
  if (!id || !timestamp || !category || !title || !isOneOf(value.level, ACTIVITY_LEVELS)) return undefined;
  let detail: string | undefined;
  if (value.detail !== undefined) {
    detail = boundedText(value.detail, MAX_ACTIVITY_DETAIL_CHARS, true);
    if (detail === undefined) return undefined;
  }
  return { id, timestamp, level: value.level, category, title, ...(detail ? { detail } : {}) };
}

function parseDiagnosticEstimate(value: unknown): { baselineTokens: number; optimizedTokens: number; estimatedAvoidedDuplication: number } | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["baselineTokens", "optimizedTokens", "estimatedAvoidedDuplication"])) return undefined;
  const baselineTokens = boundedInteger(value.baselineTokens);
  const optimizedTokens = boundedInteger(value.optimizedTokens);
  const estimatedAvoidedDuplication = boundedInteger(value.estimatedAvoidedDuplication);
  if (baselineTokens === undefined || optimizedTokens === undefined || estimatedAvoidedDuplication === undefined) return undefined;
  return { baselineTokens, optimizedTokens, estimatedAvoidedDuplication };
}

function parseDiagnosticDump(value: unknown): DwiEditorDiagnosticDump | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["version", "session", "project", "provider", "candidate"]) || value.version !== "dwi.diagnostics.v1") return undefined;
  if (!isRecord(value.session) || !hasExactKeys(value.session, ["stage", "restored", "selectedModuleCount"])) return undefined;
  if (!isRecord(value.project) || !hasExactKeys(value.project, ["name", "status", "reviewed", "coveragePercent", "conflictCount", "pendingChanges"])) return undefined;
  if (!isRecord(value.provider) || !hasExactKeys(value.provider, ["mode", "configured"])) return undefined;
  if (!isRecord(value.candidate)) return undefined;

  const selectedModuleCount = boundedInteger(value.session.selectedModuleCount, DWI_MODULES.length);
  const projectName = boundedText(value.project.name, MAX_DISPLAY_VALUE_CHARS);
  const coveragePercent = boundedInteger(value.project.coveragePercent, 100);
  const conflictCount = boundedInteger(value.project.conflictCount);
  const pendingChanges = boundedInteger(value.project.pendingChanges);
  if (
    !isOneOf(value.session.stage, STAGES) || typeof value.session.restored !== "boolean" || selectedModuleCount === undefined ||
    !projectName || !isOneOf(value.project.status, PROJECT_STATUSES) || typeof value.project.reviewed !== "boolean" ||
    coveragePercent === undefined || conflictCount === undefined || pendingChanges === undefined ||
    !isOneOf(value.provider.mode, PROVIDER_MODES) || typeof value.provider.configured !== "boolean"
  ) return undefined;

  let candidate: DwiEditorDiagnosticDump["candidate"];
  if (value.candidate.present === false && hasExactKeys(value.candidate, ["present"])) {
    candidate = { present: false };
  } else {
    if (value.candidate.present !== true || !hasExactKeys(value.candidate, ["present", "selectedModuleCount", "estimate"])) return undefined;
    const candidateSelectedModuleCount = boundedInteger(value.candidate.selectedModuleCount, DWI_MODULES.length);
    const estimate = parseDiagnosticEstimate(value.candidate.estimate);
    if (candidateSelectedModuleCount === undefined || !estimate) return undefined;
    candidate = { present: true, selectedModuleCount: candidateSelectedModuleCount, estimate };
  }

  return {
    version: "dwi.diagnostics.v1",
    session: { stage: value.session.stage, restored: value.session.restored, selectedModuleCount },
    project: {
      name: projectName,
      status: value.project.status,
      reviewed: value.project.reviewed,
      coveragePercent,
      conflictCount,
      pendingChanges,
    },
    provider: { mode: value.provider.mode, configured: value.provider.configured },
    candidate,
  };
}

function parseEstimate(value: unknown): DwiEditorEstimate | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["baselineTokens", "optimizedTokens", "estimatedAvoidedDuplication", "method"])) return undefined;
  const baselineTokens = boundedInteger(value.baselineTokens);
  const optimizedTokens = boundedInteger(value.optimizedTokens);
  const estimatedAvoidedDuplication = boundedInteger(value.estimatedAvoidedDuplication);
  const method = boundedText(value.method, MAX_ESTIMATE_METHOD_CHARS);
  if (baselineTokens === undefined || optimizedTokens === undefined || estimatedAvoidedDuplication === undefined || !method) return undefined;
  return { baselineTokens, optimizedTokens, estimatedAvoidedDuplication, method };
}

function parseDocument(value: unknown): DwiWebviewEditorDocument | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined;
  if (value.kind === "privacy") return hasExactKeys(value, ["kind"]) ? { kind: "privacy" } : undefined;
  if (value.kind === "activity-log") {
    if (!hasExactKeys(value, ["kind", "entries"]) || !Array.isArray(value.entries)) return undefined;
    const entries: DwiEditorActivityEntry[] = [];
    for (const rawEntry of value.entries.slice(0, MAX_ACTIVITY_ENTRIES)) {
      const entry = parseActivityEntry(rawEntry);
      if (!entry) return undefined;
      entries.push(entry);
    }
    return { kind: "activity-log", entries };
  }
  if (value.kind === "activity-detail") {
    if (!hasExactKeys(value, ["kind", "entry"])) return undefined;
    const entry = parseActivityEntry(value.entry);
    return entry ? { kind: "activity-detail", entry } : undefined;
  }
  if (value.kind === "diagnostics") {
    if (!hasExactKeys(value, ["kind", "data"])) return undefined;
    const data = parseDiagnosticDump(value.data);
    return data ? { kind: "diagnostics", data } : undefined;
  }
  if (value.kind === "evidence") {
    if (!hasExactKeys(value, ["kind", "label", "value", "evidence"])) return undefined;
    const label = boundedText(value.label, MAX_DISPLAY_LABEL_CHARS);
    const displayValue = boundedText(value.value, MAX_DISPLAY_VALUE_CHARS, true);
    const evidence = boundedText(value.evidence, MAX_EVIDENCE_CHARS, true);
    return label && displayValue !== undefined && evidence !== undefined ? { kind: "evidence", label, value: displayValue, evidence } : undefined;
  }
  if (value.kind === "questions") {
    if (!hasExactKeys(value, ["kind", "questions"]) || !Array.isArray(value.questions)) return undefined;
    const questions: string[] = [];
    for (const rawQuestion of value.questions.slice(0, MAX_QUESTIONS)) {
      const question = boundedText(rawQuestion, MAX_QUESTION_CHARS);
      if (!question) return undefined;
      questions.push(question);
    }
    return { kind: "questions", questions };
  }
  if (value.kind === "module") {
    if (!hasExactKeys(value, ["kind", "moduleId"])) return undefined;
    const moduleId = boundedText(value.moduleId, MAX_DISPLAY_LABEL_CHARS);
    return moduleId && DWI_MODULES.some(({ id }) => id === moduleId) ? { kind: "module", moduleId } : undefined;
  }
  if (value.kind === "library") return hasExactKeys(value, ["kind"]) ? { kind: "library" } : undefined;
  if (value.kind === "guidance") {
    return hasExactKeys(value, ["kind", "guidanceId"]) && isOneOf(value.guidanceId, promptGuidancePackIds)
      ? { kind: "guidance", guidanceId: value.guidanceId }
      : undefined;
  }
  if (value.kind === "estimate") {
    if (!hasExactKeys(value, ["kind", "estimate"])) return undefined;
    const estimate = parseEstimate(value.estimate);
    return estimate ? { kind: "estimate", estimate } : undefined;
  }
  return undefined;
}

/** Strictly validates and bounds editor-document requests before rendering them
 * in the privileged extension host. Unknown fields and unknown document kinds
 * fail closed. */
export function parseDwiDocumentOpenMessage(value: unknown): DwiDocumentOpenMessage | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["type", "document"]) || value.type !== "dwi.document.open") return undefined;
  const document = parseDocument(value.document);
  return document ? { type: "dwi.document.open", document } : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatLabel(value: string): string {
  return value.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

const PROVIDER_LABELS: Record<ProviderMode, string> = {
  none: "Not configured",
  gemini: "Gemini",
  "openai-compatible": "OpenAI-compatible",
};

type DiagnosticRating = "ideal" | "borderline" | "problem";

const RATING_COPY: Record<DiagnosticRating, { cue: string; symbol: string }> = {
  ideal: { cue: "Ideal", symbol: "✓" },
  borderline: { cue: "Borderline", symbol: "!" },
  problem: { cue: "Needs attention", symbol: "×" },
};

function renderRatedValue(value: string, rating: DiagnosticRating): string {
  const copy = RATING_COPY[rating];
  return `<dd class="rated-value status-${rating}" aria-label="${escapeHtml(`${value}; ${copy.cue}`)}"><span class="status-symbol" aria-hidden="true">${copy.symbol}</span><span>${escapeHtml(value)}</span><span class="status-cue">${copy.cue}</span></dd>`;
}

function projectStatusRating(status: ProjectStatus): DiagnosticRating | undefined {
  if (status === "current") return "ideal";
  if (status === "partial" || status === "stale") return "borderline";
  if (status === "conflict" || status === "unsupported" || status === "error") return "problem";
  return undefined;
}

function coverageRating(percent: number): DiagnosticRating {
  if (percent >= 90) return "ideal";
  if (percent >= 60) return "borderline";
  return "problem";
}

function renderActivityEntry(entry: DwiEditorActivityEntry): string {
  return `<li class="activity-entry">
    <span class="badge ${entry.level}">${escapeHtml(entry.level)}</span>
    <article>
      <h2>${escapeHtml(entry.title)}</h2>
      <p class="activity-meta"><span>${escapeHtml(entry.category)}</span><time>${escapeHtml(entry.timestamp)}</time></p>
      ${entry.detail ? `<p class="activity-detail">${escapeHtml(entry.detail)}</p>` : ""}
    </article>
  </li>`;
}

function renderShell(editorTitle: string, heading: string, summary: string, content: string): { title: string; html: string } {
  const title = escapeHtml(editorTitle);
  const csp = `default-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; img-src 'none'; object-src 'none'; script-src 'none'; connect-src 'none'; font-src 'none'; style-src 'sha256-${STYLE_HASH}'`;
  return {
    title: editorTitle,
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>${title}</title>
  <style>${DOCUMENT_STYLES}</style>
</head>
<body>
  <main class="document">
    <header class="document-header">
      <p class="eyebrow">Developer Work Intelligence</p>
      <h1>${escapeHtml(heading)}</h1>
      <p class="lede">${escapeHtml(summary)}</p>
    </header>
    ${content}
  </main>
</body>
</html>`,
  };
}

/** Renders a previously validated DWI editor document as a script-free,
 * theme-aware HTML document suitable for a VS Code WebviewPanel. */
export function renderDwiEditorDocument(document: DwiEditorDocument): { title: string; html: string } {
  if (document.kind === "privacy") {
    return renderShell(
      "DWI — Data Boundaries",
      "Local data boundaries",
      "DWI inspects only the bounded project evidence you approve. Provider settings alone make no request.",
      `<section class="section">
        <h2>Local by default</h2>
        <dl class="detail-grid">
          <div><dt>Read</dt><dd>Supported manifests, workspace structure, selected README files, and ownership files.</dd></div>
          <div><dt>Excluded</dt><dd>Secrets, environment files, dependencies, caches, build output, and unrestricted source code.</dd></div>
          <div><dt>Commands</dt><dd>DWI reads declared command names; it does not run project commands during inspection.</dd></div>
        </dl>
      </section>`,
    );
  }

  if (document.kind === "activity-log") {
    const count = document.entries.length;
    return renderShell(
      "DWI — Activity Log",
      "Activity log",
      count ? `${count} recent local ${count === 1 ? "event" : "events"}. Sensitive prompt and credential contents are excluded.` : "No activity has been recorded in this session.",
      `<section class="section">
        ${count ? `<ol class="activity-list">${document.entries.map(renderActivityEntry).join("")}</ol>` : `<p class="empty">No activity yet.</p>`}
      </section>`,
    );
  }

  if (document.kind === "activity-detail") {
    const { entry } = document;
    return renderShell(
      "DWI — Activity Detail",
      entry.title,
      `${formatLabel(entry.level)} · ${entry.category} · ${entry.timestamp}`,
      `<section class="section">
        <dl class="detail-grid">
          <div><dt>Level</dt><dd>${escapeHtml(formatLabel(entry.level))}</dd></div>
          <div><dt>Category</dt><dd>${escapeHtml(entry.category)}</dd></div>
          <div><dt>Time</dt><dd>${escapeHtml(entry.timestamp)}</dd></div>
        </dl>
      </section>
      <section class="section"><h2>Details</h2><p class="prose">${escapeHtml(entry.detail ?? "No additional detail was recorded.")}</p></section>`,
    );
  }

  if (document.kind === "diagnostics") {
    const { data } = document;
    const candidateStatus = data.candidate.present ? "Present" : "Not present";
    const projectStatus = formatLabel(data.project.status);
    const projectRating = projectStatusRating(data.project.status);
    const candidateDetails = data.candidate.present
      ? `<div><dt>Candidate modules</dt><dd>${formatCount(data.candidate.selectedModuleCount)}</dd></div>
         <div><dt>Estimated reduction</dt><dd>${formatCount(data.candidate.estimate.estimatedAvoidedDuplication)} tokens</dd></div>`
      : "";
    return renderShell(
      "DWI — Diagnostics",
      "Session diagnostics",
      "A redacted local snapshot for troubleshooting. Prompt text, evidence bodies, corrections, credentials, and private notes are excluded.",
      `<section class="section">
        <h2>Current state</h2>
        <dl class="stat-grid">
          <div><dt>Workflow</dt><dd>${escapeHtml(formatLabel(data.session.stage))}</dd></div>
          <div><dt>Restored</dt><dd>${data.session.restored ? "Yes" : "No"}</dd></div>
          <div><dt>Selected modules</dt><dd>${formatCount(data.session.selectedModuleCount)}</dd></div>
          <div><dt>Project</dt><dd>${escapeHtml(data.project.name)}</dd></div>
          <div><dt>Project status</dt>${projectRating ? renderRatedValue(projectStatus, projectRating) : `<dd>${escapeHtml(projectStatus)}</dd>`}</div>
          <div><dt>Coverage</dt>${renderRatedValue(`${formatCount(data.project.coveragePercent)}%`, coverageRating(data.project.coveragePercent))}</div>
          <div><dt>Reviewed</dt>${renderRatedValue(data.project.reviewed ? "Yes" : "No", data.project.reviewed ? "ideal" : "problem")}</div>
          <div><dt>Conflicts</dt>${renderRatedValue(formatCount(data.project.conflictCount), data.project.conflictCount === 0 ? "ideal" : "problem")}</div>
          <div><dt>Pending changes</dt>${renderRatedValue(formatCount(data.project.pendingChanges), data.project.pendingChanges === 0 ? "ideal" : "borderline")}</div>
          <div><dt>Provider</dt><dd>${escapeHtml(PROVIDER_LABELS[data.provider.mode])}</dd></div>
          <div><dt>Provider configured</dt>${renderRatedValue(data.provider.configured ? "Yes" : "No", data.provider.configured ? "ideal" : "problem")}</div>
          <div><dt>Candidate</dt><dd>${candidateStatus}</dd></div>
          ${candidateDetails}
        </dl>
      </section>
      <section class="section">
        <details><summary>View redacted raw data</summary><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre></details>
      </section>`,
    );
  }

  if (document.kind === "evidence") {
    return renderShell(
      "DWI — Project Evidence",
      document.label,
      "The bounded source used for this project-brief fact.",
      `<section class="section">
        <dl class="detail-grid">
          <div><dt>Observed value</dt><dd>${escapeHtml(document.value || "Not available")}</dd></div>
          <div><dt>Project source</dt><dd><code>${escapeHtml(document.evidence || "Source unavailable")}</code></dd></div>
        </dl>
      </section>`,
    );
  }

  if (document.kind === "questions") {
    const count = document.questions.length;
    return renderShell(
      "DWI — Open Questions",
      "Open project questions",
      count ? `${count} ${count === 1 ? "question remains" : "questions remain"} explicit until the project brief is updated.` : "The current project brief has no open questions.",
      `<section class="section">
        ${count ? `<ol class="question-list">${document.questions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ol>` : `<p class="empty">No open questions.</p>`}
      </section>`,
    );
  }

  if (document.kind === "module") {
    const module = DWI_MODULES.find(({ id }) => id === document.moduleId);
    if (!module) throw new Error("Cannot render an unknown DWI module.");
    return renderShell(
      `DWI — ${module.title}`,
      module.title,
      module.description,
      `<section class="section">
        <dl class="detail-grid">
          <div><dt>Why it matters</dt><dd>${escapeHtml(module.why)}</dd></div>
          <div><dt>Estimated request size</dt><dd>Approximately ${formatCount(module.estimatedTokens)} tokens</dd></div>
          <div><dt>Default</dt><dd>${module.defaultSelected ? "Selected" : "Optional"}</dd></div>
        </dl>
      </section>`,
    );
  }

  if (document.kind === "library") {
    return renderShell(
      "DWI — Library",
      "Library",
      "One place to review and manage reusable developer assets for project initialization.",
      `<section class="section">
        <h2>Available now</h2>
        <p class="prose">Templates preserve reusable prompt structure and project-specific guidance. Recently reviewed items appear in Recents; Review separates managed and personal templates.</p>
      </section>
      <section class="section">
        <h2>Ownership</h2>
        <dl class="detail-grid">
          <div><dt>Managed</dt><dd>Governed templates are available for review and feedback.</dd></div>
          <div><dt>Personal</dt><dd>Local templates can be created, edited, cloned, and removed.</dd></div>
          <div><dt>Expanding library</dt><dd>Skills, rules, and other governed assets can join the same library when available.</dd></div>
        </dl>
      </section>`,
    );
  }

  if (document.kind === "guidance") {
    const guidance = PROMPT_GUIDANCE_PACKS.find(({ id }) => id === document.guidanceId)!;
    return renderShell(
      `DWI — ${guidance.label}`,
      guidance.label,
      "Template guidance",
      `<section class="section"><h2>How this guidance helps</h2><p class="prose">${escapeHtml(guidance.description)}</p></section>`,
    );
  }

  if (document.kind === "prompt-review") {
    const source = document.source === "local"
      ? "Local deterministic preview"
      : `${document.provider === "gemini" ? "Gemini" : "OpenAI-compatible"} · ${document.model}`;
    return renderShell(
      "DWI — Prompt Review",
      document.title || "Prompt review",
      document.summary || `${source}. Opened from Prompt Optimizer for focused review in the editor area.`,
      `<section class="section">
        <dl class="detail-grid">
          <div><dt>Source</dt><dd>${escapeHtml(source)}</dd></div>
          <div><dt>Estimated reduction</dt><dd>${formatCount(document.estimate.estimatedAvoidedDuplication)} tokens</dd></div>
        </dl>
      </section>
      <section class="section"><h2>Generated prompt</h2><pre>${escapeHtml(document.text)}</pre></section>`,
    );
  }

  const { estimate } = document;
  return renderShell(
    "DWI — Token Estimate",
    "Request-size estimate",
    "Deterministic planning figures for the current candidate, not provider billing.",
    `<section class="section">
      <dl class="stat-grid">
        <div><dt>Baseline</dt><dd>${formatCount(estimate.baselineTokens)} tokens</dd></div>
        <div><dt>Optimized</dt><dd>${formatCount(estimate.optimizedTokens)} tokens</dd></div>
        <div><dt>Estimated reduction</dt><dd>${formatCount(estimate.estimatedAvoidedDuplication)} tokens</dd></div>
      </dl>
    </section>
    <section class="section"><h2>Method</h2><p class="prose">${escapeHtml(estimate.method)}</p></section>`,
  );
}

/** Builds a prompt review only from host-authoritative persisted optimizer state.
 * Webview document messages cannot construct this trusted document kind. */
export function resolvePersistedPromptReviewDocument(
  candidate: DwiCandidate | undefined,
  review: DwiOptimizerReview | undefined,
): ResolvedDwiEditorDocument | undefined {
  if (!candidate || !review) return undefined;
  const text = boundedPromptText(candidate.text);
  const estimate = parseEstimate(candidate.estimate);
  if (!text || !estimate) return undefined;
  const document: DwiEditorDocument = review.source === "local"
    ? { kind: "prompt-review", source: "local", text, estimate }
    : {
        kind: "prompt-review",
        source: "provider",
        provider: review.provider,
        model: review.model,
        text,
        estimate,
        ...(review.title ? { title: review.title } : {}),
        ...(review.summary ? { summary: review.summary } : {}),
      };
  const rendered = renderDwiEditorDocument(document);
  return { ...rendered, document };
}

/** Resolves an untrusted webview message into a validated editor title and
 * secure HTML document. */
export function resolveDwiEditorDocument(value: unknown): ResolvedDwiEditorDocument | undefined {
  const message = parseDwiDocumentOpenMessage(value);
  if (!message) return undefined;
  const rendered = renderDwiEditorDocument(message.document);
  return { ...rendered, document: message.document };
}
