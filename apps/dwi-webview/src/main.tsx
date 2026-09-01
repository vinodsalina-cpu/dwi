import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DWI_MODULES,
  compileDwiCandidate,
  createFeedback,
  evaluationMarkdown,
  type DwiBrief,
} from "@platform/dwi-core";
import { resolvePromptSourcesV2, type EngineeringTokenProjectionV1, type OptimizationTraceV1, type PromptSourcePlanV2 } from "@platform/domain-prompt-optimizer";
import { EMPTY_PROMPT_DRAFT_FIELDS } from "@platform/domain-prompt-optimizer/catalog";
import type {
  PromptTemplate,
  PromptTemplateInput,
  PromptOptimizeResult,
  PromptType,
} from "@platform/domain-prompt-optimizer/types";
import { parsePromptTemplateInput } from "@platform/domain-prompt-optimizer/validation";
import {
  LibraryWorkspace,
  type LibraryCloneResult,
  type LibraryDeleteRequest,
  type LibraryFeedbackRequest,
  type LibraryItemSummary,
  type LibrarySaveRequest,
  type LibraryState,
  type LibraryTemplateDetail,
} from "./library.js";
import { PROJECT_UI_FIXTURES, projectFixtureFromLocation } from "./project-fixtures.js";
import { normalizeProjectSnapshot, type ProjectSnapshotViewModel } from "./project-intelligence.js";
import {
  PromptInputEditor,
  type PromptAssignmentOption,
  type PromptOutputSize,
} from "./prompt-input-editor.js";
import { GeminiModelPicker } from "./gemini-model-picker.js";
import "./redesign.css";

type Stage = "consent" | "brief" | "compose" | "evaluate";
type SessionMode = "loading" | "workspace" | "generic" | "recovery";
type ActivityLevel = "info" | "warning" | "error";
type FeedbackRating = "helpful" | "mixed" | "not-helpful";
type ActiveSurface = "home" | "initializer" | "optimizer" | "library" | "activity" | "settings" | "docs";
type OptimizerStep = "input" | "resolve" | "review";

export function initialActiveSurface(value: string | undefined): "home" | "optimizer" {
  return value === "optimizer" ? "optimizer" : "home";
}

export function projectedTokenDeltaLabel(delta: { absoluteTokens: number; percentageChange: number }): string {
  if (delta.absoluteTokens > 0) return `${delta.absoluteTokens.toLocaleString()} saved · ${Math.abs(delta.percentageChange)}% decrease`;
  if (delta.absoluteTokens < 0) return `${Math.abs(delta.absoluteTokens).toLocaleString()} added · ${Math.abs(delta.percentageChange)}% increase`;
  return "No projected token change";
}
type OptimizerReview =
  | { source: "local" }
  | { source: "provider"; provider?: "gemini" | "openai"; model?: string; title?: string; summary?: string };
type DwiWorkspaceSnapshot = {
  status: "partial" | "complete";
  stage: Stage;
  brief?: DwiBrief;
  selectedModuleIds?: string[];
  candidate?: ReturnType<typeof compileDwiCandidate>;
  candidateInput?: {
    task: string;
    assignmentId: string;
    promptType: PromptType;
    outputSize: PromptOutputSize;
  };
  optimizerDraft?: {
    task: string;
    assignmentId: string;
    promptType: PromptType;
    outputSize: PromptOutputSize;
  };
  optimizerReview?: OptimizerReview;
  evaluationMarkdown?: string;
};
type ProviderSettings = {
  mode: "none" | "gemini" | "openai-compatible";
  model?: string;
  baseUrl?: string;
  configured: boolean;
  health?: "missing" | "unverified" | "checking" | "ready" | "invalid-credential" | "quota" | "rate-limit" | "connectivity" | "timeout" | "invalid-model";
  checkedAt?: string;
  errorMessage?: string;
};
type WorkspaceRoot = { uri: string; label: string; fingerprint: string };
type ActivityEntry = {
  id: string;
  timestamp: string;
  level: ActivityLevel;
  category: string;
  title: string;
  detail?: string;
};
type OptimizerRecent = {
  id: string;
  title: string;
  preview: string;
  promptType: PromptType;
  updatedAt: string;
  source?: OptimizerReview["source"];
  provider?: string;
  model?: string;
};
type HostLibrarySummary = {
  id: string;
  kind: "managed" | "personal";
  immutable: boolean;
  name: string;
  description: string;
  promptType: PromptType;
  createdAt?: string;
  updatedAt?: string;
  lastOpenedAt?: string;
  reviewedAt?: string;
};
type HostLibraryState = {
  revision: number;
  managed: HostLibrarySummary[];
  personal: HostLibrarySummary[];
  recent: HostLibrarySummary[];
  personalLimit: number;
  personalRemaining: number;
};
type HostLibraryVersion = { revision: number; savedAt?: string; updatedAt?: string; label?: string };
type HostLibraryDetail = {
  revision: number;
  summary: HostLibrarySummary;
  template: PromptTemplate;
  versions?: HostLibraryVersion[];
};
type HostMessage = {
  type?: string;
  surface?: "home" | "optimizer";
  code?: string;
  brief?: DwiBrief;
  candidate?: ReturnType<typeof compileDwiCandidate>;
  message?: string;
  snapshot?: unknown;
  settings?: ProviderSettings;
  roots?: WorkspaceRoot[];
  entry?: ActivityEntry;
  state?: HostLibraryState;
  detail?: HostLibraryDetail;
  operationId?: string;
  templateId?: string;
  rating?: FeedbackRating;
  stars?: number;
  reviewedAt?: string;
  published?: boolean;
  status?: "ready" | "invalid" | "cancelled";
  health?: ProviderSettings["health"];
  mode?: "file" | "paste";
  template?: PromptTemplateInput;
  currentRevision?: number;
  consentCapability?: string;
  reason?: "no-workspace" | "context-invalid" | "open-folder-cancelled" | "open-folder-failed";
  ok?: boolean;
  requestId?: string;
  correlationId?: string;
  failureKind?: string;
  retryable?: boolean;
  localCandidate?: ReturnType<typeof compileDwiCandidate>;
  result?: PromptOptimizeResult;
  recents?: OptimizerRecent[];
  view?: OptimizerStep;
  sourcePlan?: PromptSourcePlanV2;
  trace?: OptimizationTraceV1;
  failureCode?: string;
  semantic?: { provider: "gemini" | "openai"; model: string; finishReason: string; appliedOperations: number; projection?: EngineeringTokenProjectionV1; refinedPrompt?: string };
  draft?: DwiWorkspaceSnapshot["optimizerDraft"];
  review?: DwiWorkspaceSnapshot["optimizerReview"];
};
type PendingLibraryOperation =
  | { kind: "save"; templateId?: string; resolve(detail: LibraryTemplateDetail): void; reject(error: Error): void }
  | { kind: "delete" | "feedback"; templateId: string; resolve(): void; reject(error: Error): void }
  | { kind: "clone"; resolve(result: LibraryCloneResult | undefined): void; reject(error: Error): void };

const demoBrief: DwiBrief = {
  version: "dwi.brief.v1",
  projectName: "Platform workspace",
  archetype: "TypeScript monorepo",
  stack: ["TypeScript", "React", "Node.js"],
  packageManager: "pnpm",
  scripts: ["build", "lint", "typecheck", "test"],
  modules: ["apps", "packages", "tools"],
  facts: [
    { id: "manifest", label: "Workspace", value: "pnpm + Turborepo", confidence: "high", evidence: "pnpm-workspace.yaml · package.json" },
    { id: "frontend", label: "UI", value: "React + Vite", confidence: "high", evidence: "apps/* manifests" },
    { id: "runtime", label: "Runtime", value: "Node.js", confidence: "high", evidence: "engines.node" },
  ],
  unknowns: ["Deployment target", "Feature-specific acceptance criteria"],
  confirmed: false,
  corrections: "",
};

const WORKFLOW_STEPS = ["Access", "Project brief"] as const;
const DEFAULT_MODULES = DWI_MODULES.filter((module) => module.defaultSelected).map((module) => module.id);
const MAX_ACTIVITY_HISTORY = 40;
const DEFAULT_ASSIGNMENT_ID = "general";
const LIBRARY_KINDS: LibraryState["kinds"] = [
  { kind: "template", label: "Templates", available: true },
  { kind: "skill", label: "Skills", available: false },
  { kind: "rule", label: "Rules", available: false },
  { kind: "other", label: "Other", available: false },
];

function libraryItem(summary: HostLibrarySummary): LibraryItemSummary {
  return {
    id: summary.id,
    name: summary.name,
    kind: "template",
    source: summary.kind,
    reviewedAt: summary.reviewedAt ?? summary.lastOpenedAt,
    updatedAt: summary.updatedAt ?? summary.createdAt,
    promptType: summary.promptType,
  };
}

function libraryStateFromHost(state: HostLibraryState): LibraryState {
  return {
    status: "ready",
    kinds: LIBRARY_KINDS,
    managedTemplates: state.managed.map(libraryItem),
    personalTemplates: state.personal.map(libraryItem),
    recents: state.recent.map(libraryItem),
  };
}

function libraryDetailFromHost(detail: HostLibraryDetail): LibraryTemplateDetail {
  return {
    item: libraryItem(detail.summary),
    template: detail.template,
    revision: detail.revision,
    versions: (detail.versions ?? [{ revision: detail.revision, updatedAt: detail.template.updatedAt ?? detail.template.createdAt ?? "Current" }]).map((version) => ({
      revision: version.revision,
      updatedAt: version.savedAt ?? version.updatedAt ?? "Current",
      label: version.label,
    })),
  };
}

function previewLibraryDetail(template: PromptTemplate, revision = 1): LibraryTemplateDetail {
  const now = template.updatedAt ?? template.createdAt ?? "2026-08-27T12:00:00.000Z";
  const versions = Array.from({ length: Math.min(5, Math.max(1, revision)) }, (_, index) => ({
    revision: revision - index,
    updatedAt: now,
    label: index === 0 ? "Current" : "Saved version",
  }));
  return {
    item: {
      id: template.id,
      name: template.name,
      kind: "template",
      source: template.builtIn ? "managed" : "personal",
      updatedAt: now,
      reviewedAt: now,
      promptType: template.promptType,
    },
    template,
    revision,
    versions,
  };
}

function previewTemplate(id: string, name: string, promptType: PromptType, builtIn = true): PromptTemplate {
  return {
    id,
    builtIn,
    name,
    description: "Preview-only reusable developer template.",
    promptType,
    prompt: `Use ${name} as a concise preview instruction.`,
    fields: {
      title: name,
      desiredOutcome: "Deliver a clear, reviewable result.",
      inScope: "The requested work.",
      outOfScope: "Unrelated changes.",
      verification: "Verify the requested behavior.",
      outputFormat: "Return an implementation summary and verification.",
      hardConstraints: "Preserve project boundaries.",
      acceptanceCriteria: "The requested behavior works and is verified.",
    },
    recommendedGuidancePackIds: ["outcome", "verification"],
  };
}

// Browser-preview fixtures are intentionally generic. Production managed
// template bodies enter the webview only in a host-validated item detail.
const PREVIEW_MANAGED_TEMPLATES: readonly PromptTemplate[] = [
  previewTemplate("general", "General delivery brief", "General"),
  previewTemplate("preview:architecture", "Architecture decision", "Architecture"),
  previewTemplate("preview:refactor", "Behavior-preserving refactor", "Refactor"),
  previewTemplate("preview:bug-fix", "Bug fix with regression guard", "Bug fix"),
  previewTemplate("preview:explanation", "Code explanation", "Code explanation"),
  previewTemplate("preview:documentation", "Documentation update", "Documentation"),
  previewTemplate("preview:reuse", "Reuse-before-create check", "Reuse check"),
  previewTemplate("preview:migration", "Safe migration", "Migration"),
  previewTemplate("preview:security", "Security review", "Security review"),
  previewTemplate("preview:test", "Test plan and implementation", "Test creation"),
];

const PREVIEW_PERSONAL_TEMPLATE: PromptTemplate = {
  ...previewTemplate("personal-release-readiness", "Release readiness review", "Migration", false),
  id: "personal-release-readiness",
  description: "Prepare a bounded release-quality review with explicit evidence.",
  createdAt: "2026-08-24T12:00:00.000Z",
  updatedAt: "2026-08-27T12:00:00.000Z",
};

function initialLibraryState(): LibraryState {
  if (vscode) return { status: "loading", kinds: LIBRARY_KINDS, recents: [], managedTemplates: [], personalTemplates: [] };
  const managed = PREVIEW_MANAGED_TEMPLATES.map((template) => previewLibraryDetail(template).item);
  const personal = previewLibraryDetail(PREVIEW_PERSONAL_TEMPLATE, 3).item;
  return { status: "ready", kinds: LIBRARY_KINDS, managedTemplates: managed, personalTemplates: [personal], recents: [personal, ...managed.slice(0, 3)] };
}

function previewCloneInput(raw: string): LibraryCloneResult["template"] | undefined {
  const text = raw.trim();
  if (!text || text.length > 131_072) return undefined;
  if (text.startsWith("{")) {
    try {
      return parsePromptTemplateInput(JSON.parse(text));
    } catch {
      return undefined;
    }
  }
  return parsePromptTemplateInput({
    name: text.match(/^#{1,6}\s+(.+)$/m)?.[1]?.slice(0, 200) ?? "Cloned template",
    description: "Cloned from a local Markdown or plain-text response.",
    promptType: "General",
    prompt: text.slice(0, 32_768),
    fields: { ...EMPTY_PROMPT_DRAFT_FIELDS },
    recommendedGuidancePackIds: [],
  });
}

declare const acquireVsCodeApi: undefined | (() => { postMessage(message: unknown): void });
const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : undefined;
const previewParams = new URLSearchParams(window.location.search);
if (!vscode && previewParams.get("theme") === "light") document.documentElement.dataset.theme = "light";

function previewStage(): Stage {
  if (vscode) return "consent";
  const stage = previewParams.get("stage");
  return stage === "brief" || stage === "compose" || stage === "evaluate" ? stage : "consent";
}

function initialBrief(): DwiBrief {
  const stage = previewStage();
  return { ...demoBrief, confirmed: stage === "compose" || stage === "evaluate" };
}

function initialCandidate(): ReturnType<typeof compileDwiCandidate> | undefined {
  return previewStage() === "evaluate" ? compileDwiCandidate(initialBrief(), DEFAULT_MODULES) : undefined;
}

function initialSessionMode(): SessionMode {
  if (vscode) return "loading";
  const mode = previewParams.get("mode");
  return mode === "generic" || mode === "recovery" || mode === "loading" ? mode : "workspace";
}

function initialProjectSnapshot(): ProjectSnapshotViewModel {
  return vscode ? PROJECT_UI_FIXTURES.scanning : projectFixtureFromLocation();
}

function restoredStage(snapshot: DwiWorkspaceSnapshot): Stage {
  if (snapshot.candidate && snapshot.brief?.confirmed) return "evaluate";
  if (snapshot.brief?.confirmed) return snapshot.stage === "brief" ? "brief" : "compose";
  if (snapshot.brief) return "brief";
  return "consent";
}

function projectStatusCopy(snapshot: ProjectSnapshotViewModel): { label: string; message: string; level: ActivityLevel } {
  if (snapshot.status === "scanning") return { label: "Checking", message: "Reading only the project details you allowed.", level: "info" };
  if (snapshot.status === "stale") return { label: "Project changed", message: "Check the project again before continuing.", level: "warning" };
  if (snapshot.status === "error") return { label: "Check failed", message: snapshot.message ?? "The project check could not finish.", level: "error" };
  if (snapshot.status === "conflict") return { label: "Details conflict", message: "Resolve the conflicting project details before continuing.", level: "warning" };
  if (snapshot.status === "unsupported") return { label: "More details needed", message: "Add the required project details before continuing.", level: "warning" };
  if (snapshot.reviewed && snapshot.status === "current") return { label: "Approved", message: "Project details are approved and ready.", level: "info" };
  if (snapshot.reviewed) return { label: "Approved with gaps", message: "Open questions will remain explicit in the prompt.", level: "warning" };
  if (snapshot.status === "partial") return { label: "Review needed", message: "Some project details are still unknown.", level: "warning" };
  return { label: "Review needed", message: "Approve the project details before they are used.", level: "info" };
}

function compactTimestamp(value: string): string {
  if (value === "Now") return value;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function feedbackRatingFromMarkdown(markdown: string | undefined): FeedbackRating | undefined {
  const rating = markdown?.match(/^- Rating: (helpful|mixed|not-helpful)$/m)?.[1];
  return rating as FeedbackRating | undefined;
}

function diagnosticDump(
  stage: Stage,
  restored: boolean,
  snapshot: ProjectSnapshotViewModel,
  provider: ProviderSettings,
  selected: string[],
  candidate: ReturnType<typeof compileDwiCandidate> | undefined,
) {
  return {
    version: "dwi.diagnostics.v1",
    session: {
      stage,
      restored,
      selectedModuleCount: selected.length,
    },
    project: {
      name: snapshot.projectName,
      status: snapshot.status,
      reviewed: snapshot.reviewed === true,
      coveragePercent: snapshot.coverage.percent,
      conflictCount: snapshot.conflictCount,
      pendingChanges: snapshot.pendingChanges,
    },
    provider: {
      mode: provider.mode,
      configured: provider.configured,
    },
    candidate: candidate ? {
      present: true,
      selectedModuleCount: candidate.selectedModuleIds.length,
      estimate: {
        baselineTokens: candidate.estimate.baselineTokens,
        optimizedTokens: candidate.estimate.optimizedTokens,
        estimatedAvoidedDuplication: candidate.estimate.estimatedAvoidedDuplication,
      },
    } : { present: false },
  };
}

type IconName = "home" | "sparkle" | "library" | "panel" | "info" | "settings" | "lock" | "bell" | "back" | "close" | "check" | "refresh" | "folder" | "database" | "file" | "terminal" | "warning" | "external";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></>,
    sparkle: <><path d="m12 3 1.3 4.2L17.5 8.5l-4.2 1.3L12 14l-1.3-4.2-4.2-1.3 4.2-1.3L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></>,
    library: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z"/></>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8.5 4v16M13 9l3 3-3 3"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></>,
    settings: <><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7.2 4l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 20 7.2l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.8.8Z"/></>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
    back: <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" fill="currentColor" stroke="none" />,
    close: <><path d="M18 6 6 18"/><path d="m6 6 12 12"/></>,
    check: <path d="M20 6 9 17l-5-5"/>,
    refresh: <><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>,
    folder: <path d="M3 6.5h7l2 2h9v10H3v-12Z"/>,
    database: <><ellipse cx="12" cy="5.5" rx="7.5" ry="3"/><path d="M4.5 5.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6M4.5 11.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/></>,
    file: <><path d="M6 2.5h8l4 4v15H6v-19Z"/><path d="M14 2.5v4h4M9 12h6M9 16h6"/></>,
    terminal: <><path d="m4 7 4 4-4 4M11 16h8"/><rect x="2" y="3" width="20" height="18" rx="2"/></>,
    warning: <><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5M12 17v.2"/></>,
    external: <><path d="M13 5h6v6M19 5l-8 8"/><path d="M18 14v5H5V6h5"/></>,
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

interface FloatingPanelProps {
  title: string;
  label: string;
  onClose(): void;
  children: React.ReactNode;
  closeLabel?: string;
  compact?: boolean;
  dismissible?: boolean;
}

function FloatingPanel({ title, label, onClose, children, closeLabel = "Close", compact = false, dismissible = true }: FloatingPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    panelRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  function containFocus(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (dismissible) onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (controls.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = controls[0]!;
    const last = controls.at(-1)!;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !panelRef.current?.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!controls.includes(active)) {
      const candidates = event.shiftKey ? [...controls].reverse() : controls;
      const direction = event.shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
      const adjacent = candidates.find((control) => Boolean(active.compareDocumentPosition(control) & direction));
      event.preventDefault();
      (adjacent ?? (event.shiftKey ? last : first)).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <>
    <div className="panel-scrim" aria-hidden="true" onClick={dismissible ? onClose : undefined} />
    <aside ref={panelRef} className={`floating-panel${compact ? " compact-panel" : ""}`} role="dialog" aria-modal="true" aria-labelledby="floating-panel-title" tabIndex={-1} onKeyDown={containFocus}>
      <header className="panel-header"><div><span>{label}</span><h2 id="floating-panel-title">{title}</h2></div>{dismissible && <button className="icon-button" type="button" aria-label={closeLabel} onClick={onClose}><Icon name="close" /></button>}</header>
      <div className="panel-body">{children}</div>
    </aside>
  </>;
}

interface ActivitySurfaceProps {
  entries: ActivityEntry[];
  snapshot: ProjectSnapshotViewModel;
  onBack(): void;
  onOpenLog(): void;
  onOpenDiagnostics(): void;
  onOpenPrivacy(): void;
  onOpenActivityDetail(entry: ActivityEntry): void;
}

function SurfaceHeader({ title, onBack }: { title: string; onBack(): void }) {
  return <header className="utility-header">
    <button className="utility-back" type="button" autoFocus onClick={onBack}><Icon name="back" size={14} />Home</button>
    <h1>{title}</h1>
  </header>;
}

function OptimizerStepNavigation({ step, candidateAvailable, onSelect }: { step: OptimizerStep; candidateAvailable: boolean; onSelect(step: OptimizerStep): void }) {
  return <nav className="optimizer-step-navigation" aria-label="Prompt Optimizer steps">
    <ol>
      <li><button type="button" aria-label="Step 1 Input" aria-current={step === "input" ? "step" : undefined} onClick={() => onSelect("input")}><span>1</span><strong>Input</strong></button></li>
      <li><button type="button" aria-label="Step 2 Resolve" aria-current={step === "resolve" ? "step" : undefined} disabled={!candidateAvailable} onClick={() => onSelect("resolve")}><span>2</span><strong>Resolve</strong></button></li>
      <li><button type="button" aria-label="Step 3 Review" aria-current={step === "review" ? "step" : undefined} disabled={!candidateAvailable} onClick={() => onSelect("review")}><span>3</span><strong>Review</strong></button></li>
    </ol>
  </nav>;
}

function ActivitySurface({ entries, snapshot, onBack, onOpenLog, onOpenDiagnostics, onOpenPrivacy, onOpenActivityDetail }: ActivitySurfaceProps) {
  const copy = projectStatusCopy(snapshot);
  return <section className="utility-surface activity-surface" aria-label="Activity">
    <SurfaceHeader title="Activity" onBack={onBack} />
    <div className="utility-body">
      <div className={`status-summary level-${copy.level}`}><span className="status-dot" /><div><strong>{copy.label}</strong></div><b>{snapshot.coverage.percent}%</b></div>
      {vscode && <div className="activity-editor-actions"><button className="secondary full-width" type="button" onClick={onOpenLog}><Icon name="external" size={14} />Open activity log in editor</button><button className="secondary full-width" type="button" onClick={onOpenDiagnostics}><Icon name="external" size={14} />Open diagnostics in editor</button><button className="secondary full-width" type="button" onClick={onOpenPrivacy}><Icon name="external" size={14} />Open data boundaries in editor</button></div>}
      <ol className="activity-list" aria-label="Recent activity">
        {entries.length === 0 && <li className="activity-empty">No activity yet.</li>}
        {entries.map((entry) => {
          const detailBesideTitle = entry.title === "Approved with gaps";
          const detailControl = entry.detail && <div className={`activity-detail-wrap${detailBesideTitle ? " activity-title-detail" : ""}`}>
              <button className="mini-info" type="button" aria-label={`Open details for ${entry.title} in editor`} onClick={() => onOpenActivityDetail(entry)}><Icon name="info" size={13} /></button>
            </div>;
          return <li className={`level-${entry.level}${detailBesideTitle ? " title-detail" : ""}`} key={entry.id}>
            <span className="activity-marker"><Icon name={entry.level === "error" ? "warning" : entry.level === "warning" ? "info" : "check"} size={13} /><span className="sr-only">{entry.level === "error" ? "Error" : entry.level === "warning" ? "Warning" : "Information"}</span></span>
            <div className="activity-copy"><span className="activity-title-line"><strong>{entry.title}</strong>{detailBesideTitle && detailControl}</span><span className="activity-meta"><small>{entry.category}</small><time dateTime={entry.timestamp === "Now" ? undefined : entry.timestamp}>{compactTimestamp(entry.timestamp)}</time></span></div>
            {!detailBesideTitle && detailControl}
          </li>;
        })}
      </ol>
    </div>
  </section>;
}

function providerNotificationState(health: ProviderSettings["health"]): { className: string; label: string; severity: "ok" | "notice" | "warning"; count: number } {
  if (health === "ready") return { className: "provider-ok", label: "Provider connected", severity: "ok", count: 0 };
  if (health === "checking" || health === "unverified" || health === "missing") {
    return { className: "provider-warning", label: health === "checking" ? "Provider check in progress" : health === "unverified" ? "Provider not verified" : "Provider not configured", severity: "notice", count: 1 };
  }
  if (health === "invalid-credential" || health === "connectivity" || health === "timeout") {
    return { className: "provider-danger", label: health === "invalid-credential" ? "Provider credential invalid" : health === "timeout" ? "Provider timed out" : "Provider unreachable", severity: "warning", count: 1 };
  }
  if (health === "quota") return { className: "provider-warning", label: "Provider quota issue", severity: "warning", count: 1 };
  return { className: "provider-warning", label: "Provider not ready", severity: "warning", count: 1 };
}

function openFolderMessageForReason(reason?: HostMessage["reason"]): string {
  if (reason === "open-folder-cancelled") return "No folder was selected. Choose a folder in Explorer to continue.";
  if (reason === "open-folder-failed") return "Could not open a folder from DWI. Select a workspace from Explorer.";
  if (reason === "context-invalid") return "The project context changed. Open a workspace in Explorer and retry.";
  if (reason === "no-workspace") return "Open a folder to begin.";
  return "Open a folder to begin.";
}

function DocsSurface({ onBack, snapshot, provider, onOpenPrivacy }: { onBack(): void; snapshot: ProjectSnapshotViewModel; provider: ProviderSettings; onOpenPrivacy(): void }) {
  return <section className="utility-surface docs-surface" aria-label="Docs">
    <SurfaceHeader title="Docs" onBack={onBack} />
    <div className="utility-body docs-content">
      <section className="docs-card">
        <div className="section-label">Local state</div>
        <h1>Local workflow state</h1>
        <p>DWI keeps project context per workspace and uses it to keep prompts bound to this project.</p>
        <dl className="detail-grid">
          <div><dt>Workspace</dt><dd>{snapshot.projectName || "No workspace selected"}</dd></div>
          <div><dt>Workflow status</dt><dd>{snapshot.reviewed ? "Reviewed" : "Needs review"}</dd></div>
          <div><dt>Coverage</dt><dd>{snapshot.coverage.percent}%</dd></div>
          <div><dt>Conflicts</dt><dd>{snapshot.conflictCount}</dd></div>
          <div><dt>Pending changes</dt><dd>{snapshot.pendingChanges}</dd></div>
          <div><dt>Provider</dt><dd>{provider.mode === "none" ? "Not configured" : `${provider.mode} (${provider.health ?? "unknown"})`}</dd></div>
        </dl>
      </section>
      <section className="docs-card">
        <div className="section-label">Local data boundaries</div>
        <h1>What DWI reads and stores</h1>
        <p>DWI reads bounded local evidence after approval and stores only workflow artifacts needed for session continuity.</p>
        <ul className="docs-list">
          <li>Supported manifests and selected project metadata for project context.</li>
          <li>Workspace structure and project declaration files for continuity.</li>
          <li>Credentials, source code contents, and environment secrets are excluded from workflow storage.</li>
        </ul>
        {vscode && <div className="activity-editor-actions"><button className="secondary full-width" type="button" onClick={onOpenPrivacy}><Icon name="external" size={14} />Review data boundaries in editor</button><button className="secondary full-width" type="button" onClick={onOpenPrivacy}><Icon name="external" size={14} />Open Local data boundaries in editor</button></div>}
      </section>
    </div>
  </section>;
}

interface ProjectContextCardProps {
  snapshot: ProjectSnapshotViewModel;
  actionMessage: string;
  ready: boolean;
  onRefresh(): void;
  onReview(): void;
  onResolveGaps(): void;
  onOpenDiagnostics(): void;
}

function ProjectContextCard({ snapshot, actionMessage, ready, onRefresh, onReview, onResolveGaps, onOpenDiagnostics }: ProjectContextCardProps) {
  const copy = projectStatusCopy(snapshot);
  const facts = snapshot.sections.flatMap((section) => section.claims).slice(0, 3);
  const needsRefresh = snapshot.status === "stale" || snapshot.status === "error";
  const needsDetails = snapshot.status === "partial" || snapshot.status === "conflict" || snapshot.status === "unsupported";
  const canReview = snapshot.status !== "scanning" && !needsRefresh;
  return <section className="project-context" aria-labelledby="project-context-title">
    <div className="project-heading-row">
      <div><span className="section-label">Project Meta Context</span><h1 id="project-context-title">{snapshot.projectName}</h1></div>
      <div className="context-status-wrap">
        <button type="button" className={`status-trigger status-${snapshot.status}`} aria-label={`Open ${copy.label} diagnostics in editor`} onClick={onOpenDiagnostics}><span className="status-dot" />{copy.label}<Icon name="external" size={13} /></button>
      </div>
    </div>
    {snapshot.status === "scanning" && <div className="loading-line" role="status"><span />Checking project…</div>}
    {snapshot.status === "error" && <div className="inline-alert" role="alert"><Icon name="warning" /><span>{copy.message}</span></div>}
    {!ready && facts.length > 0 && <dl className="project-fact-strip">{facts.map((fact) => <div key={fact.id}><dt>{fact.label}</dt><dd title={fact.value}>{fact.value}</dd></div>)}</dl>}
    {!ready && <div className="project-next-action">{needsRefresh
      ? <button type="button" className="primary full-width" onClick={onRefresh}><Icon name="refresh" size={14} />Check project again</button>
      : <><button type="button" className="primary full-width" onClick={onReview} disabled={!canReview}>{snapshot.status === "scanning" ? "Checking project…" : <>Review and approve <span aria-hidden="true">→</span></>}</button>{needsDetails && <button type="button" className="text-button" onClick={onResolveGaps}>Add missing details</button>}</>}
    </div>}
    {ready && <div className="compact-actions"><button type="button" className="text-button" onClick={onRefresh}><Icon name="refresh" size={13} />Check again</button>{(snapshot.status === "partial" || snapshot.status === "conflict") && <button type="button" className="text-button" onClick={onResolveGaps}>Add missing details</button>}</div>}
    {actionMessage && <span className="sr-only" role="status">{actionMessage}</span>}
  </section>;
}

function WorkflowStrip({ stage, resetPending, resetting, onRequestReset, onCancelReset, onConfirmReset }: { stage: Stage; resetPending: boolean; resetting: boolean; onRequestReset(): void; onCancelReset(): void; onConfirmReset(): void }) {
  const current = stage === "consent" ? 0 : 1;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (resetPending) cancelRef.current?.focus();
    else if (wasOpen.current) triggerRef.current?.focus();
    wasOpen.current = resetPending;
  }, [resetPending]);

  function containResetFocus(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancelReset();
      return;
    }
    if (event.key !== "Tab") return;
    if (event.shiftKey && document.activeElement === cancelRef.current) {
      event.preventDefault();
      confirmRef.current?.focus();
    } else if (!event.shiftKey && document.activeElement === confirmRef.current) {
      event.preventDefault();
      cancelRef.current?.focus();
    }
  }
  return <div className="workflow-strip">
    <div className="current-step"><span>{current + 1}/{WORKFLOW_STEPS.length}</span><strong>{WORKFLOW_STEPS[current]}</strong></div>
    <ol className="step-dots" aria-label={`Step ${current + 1} of ${WORKFLOW_STEPS.length}: ${WORKFLOW_STEPS[current]}`}>{WORKFLOW_STEPS.map((label, index) => <li className={index < current ? "done" : index === current ? "current" : ""} key={label}><span className="sr-only">{label}</span></li>)}</ol>
    {(stage !== "consent" || resetPending) && <div className="session-action-wrap"><button ref={triggerRef} className="reset-button" type="button" aria-label="Reset session" aria-expanded={resetPending} onClick={onRequestReset}><Icon name="refresh" size={14} /><span>Reset</span></button>
      {resetPending && <section className="mini-popover reset-popover" role="alertdialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-description" onKeyDown={containResetFocus}><strong id="reset-title">Reset this session?</strong><p id="reset-description">Saved prompt progress will be cleared. Project files stay unchanged.</p><div><button ref={cancelRef} type="button" className="secondary" onClick={onCancelReset} disabled={resetting}>Cancel</button><button ref={confirmRef} type="button" className="danger" onClick={onConfirmReset} disabled={resetting}>{resetting ? "Resetting…" : "Reset now"}</button></div></section>}
    </div>}
  </div>;
}

export function App() {
  const [projectSnapshot, setProjectSnapshot] = useState(initialProjectSnapshot);
  const [projectActionMessage, setProjectActionMessage] = useState("");
  const [stage, setStage] = useState<Stage>(previewStage);
  const [brief, setBrief] = useState<DwiBrief>(initialBrief);
  const [selected, setSelected] = useState<string[]>(DEFAULT_MODULES);
  const [promptText, setPromptText] = useState("");
  const [assignmentId, setAssignmentId] = useState(DEFAULT_ASSIGNMENT_ID);
  const [outputSize, setOutputSize] = useState<PromptOutputSize>("low");
  const [candidate, setCandidate] = useState<ReturnType<typeof compileDwiCandidate> | undefined>(initialCandidate);
  const [optimizedResult, setOptimizedResult] = useState<PromptOptimizeResult>();
  const [optimizerStep, setOptimizerStep] = useState<OptimizerStep>(() => previewStage() === "evaluate" ? "review" : "input");
  const [optimizerSourcePlan, setOptimizerSourcePlan] = useState<PromptSourcePlanV2>();
  const [optimizerTrace, setOptimizerTrace] = useState<OptimizationTraceV1>();
  const [optimizerReview, setOptimizerReview] = useState<OptimizerReview | undefined>(() => previewStage() === "evaluate" ? { source: "local" } : undefined);
  const [tokenProjection, setTokenProjection] = useState<EngineeringTokenProjectionV1>();
  const [optimizerRecents, setOptimizerRecents] = useState<OptimizerRecent[]>([]);
  const [optimizerSaveNotice, setOptimizerSaveNotice] = useState("");
  const [note, setNote] = useState("");
  const [draft, setDraft] = useState("");
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating>();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [isSavingEvaluation, setIsSavingEvaluation] = useState(false);
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [consentCapability, setConsentCapability] = useState<string>();
  const [workflowError, setWorkflowError] = useState("");
  const [roots, setRoots] = useState<WorkspaceRoot[]>([]);
  const [provider, setProvider] = useState<ProviderSettings>({ mode: "none", configured: false, health: "missing" });
  const [providerModelDraft, setProviderModelDraft] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [providerNoticeOpen, setProviderNoticeOpen] = useState(false);
  const providerNoticeRef = useRef<HTMLSpanElement>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>(initialSessionMode);
  const [restoreNotice, setRestoreNotice] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [optimizerResetPending, setOptimizerResetPending] = useState(false);
  const [isOptimizerResetting, setIsOptimizerResetting] = useState(false);
  const optimizerResetTriggerRef = useRef<HTMLButtonElement>(null);
  const optimizerResetDialogRef = useRef<HTMLDivElement>(null);
  const [activeSurface, setActiveSurface] = useState<ActiveSurface>(() =>
    initialActiveSurface(document.documentElement.dataset.dwiInitialSurface),
  );
  const activeSurfaceRef = useRef(activeSurface);
  const [railExpanded, setRailExpanded] = useState(false);
  const [libraryState, setLibraryState] = useState<LibraryState>(initialLibraryState);
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [libraryDetail, setLibraryDetail] = useState<LibraryTemplateDetail>();
  const workflowTriggerRef = useRef<HTMLButtonElement>(null);
  const surfaceReturnFocus = useRef<HTMLElement | null>(null);
  const restoreSurfaceFocus = useRef(false);
  const pendingLibraryOperations = useRef(new Map<string, PendingLibraryOperation>());
  const libraryTemplates = useRef(new Map<string, PromptTemplate>([
    ...(!vscode ? PREVIEW_MANAGED_TEMPLATES.map((template) => [template.id, template] as const) : []),
    ...(!vscode ? [[PREVIEW_PERSONAL_TEMPLATE.id, PREVIEW_PERSONAL_TEMPLATE] as const] : []),
  ]));
  const libraryDetailCache = useRef(new Map<string, LibraryTemplateDetail>([
    ...(!vscode ? PREVIEW_MANAGED_TEMPLATES.map((template) => [template.id, previewLibraryDetail(template)] as const) : []),
    ...(!vscode ? [[PREVIEW_PERSONAL_TEMPLATE.id, previewLibraryDetail(PREVIEW_PERSONAL_TEMPLATE, 3)] as const] : []),
  ]));
  const activitySequence = useRef(0);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>(() => [{ id: "session-open", timestamp: "Now", level: "info", category: "session", title: "DWI opened", detail: "Ready for a local project workflow." }]);
  const [activityAttention, setActivityAttention] = useState(false);
  const feedbackTriggerRef = useRef<HTMLButtonElement>(null);
  const feedbackFocusPending = useRef(false);
  const optimizerRevision = useRef(0);
  const optimizerRequest = useRef<{ requestId: string; correlationId: string; cancellationId: string } | undefined>(undefined);
  const optimizerDraftTimer = useRef<number | undefined>(undefined);
  const restoredOptimizerStep = useRef<OptimizerStep>("input");
  const contextReviewReturnStep = useRef<OptimizerStep | undefined>(undefined);
  const optimizerFocusPending = useRef<OptimizerStep | undefined>(undefined);
  const optimizerReviewHeadingRef = useRef<HTMLHeadingElement>(null);
  const assignmentOptions = useMemo<PromptAssignmentOption[]>(() => {
    const managed = libraryState.managedTemplates.map((item) => ({ id: item.id, name: item.name, promptType: item.promptType ?? "General", source: "managed" as const }));
    const personal = libraryState.personalTemplates.map((item) => ({ id: item.id, name: item.name, promptType: item.promptType ?? "General", source: "developer" as const }));
    return [...managed, ...personal];
  }, [libraryState.managedTemplates, libraryState.personalTemplates]);
  const projectReviewed = stage !== "consent" && projectSnapshot.reviewed === true;
  const projectReady = projectReviewed && (projectSnapshot.status === "current" || projectSnapshot.status === "partial");
  const optimizerResetEligible = projectReady && brief.confirmed && (stage === "compose" || stage === "evaluate");

  useEffect(() => { activeSurfaceRef.current = activeSurface; }, [activeSurface]);

  useEffect(() => {
    if (optimizerResetPending) optimizerResetDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    else optimizerResetTriggerRef.current?.focus();
  }, [optimizerResetPending]);

  useEffect(() => {
    if (!providerNoticeOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setProviderNoticeOpen(false);
      providerNoticeRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!providerNoticeRef.current?.contains(event.target as Node)) setProviderNoticeOpen(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => { document.removeEventListener("keydown", onKeyDown, true); document.removeEventListener("pointerdown", onPointerDown); };
  }, [providerNoticeOpen]);

  useEffect(() => {
    if (assignmentOptions.length && !assignmentOptions.some(({ id }) => id === assignmentId)) setAssignmentId(assignmentOptions[0]!.id);
  }, [assignmentId, assignmentOptions]);

  useEffect(() => {
    if (!feedbackFocusPending.current || feedbackOpen || !feedbackNotice) return;
    feedbackFocusPending.current = false;
    feedbackTriggerRef.current?.focus();
  }, [feedbackNotice, feedbackOpen]);

  function recordActivity(title: string, detail: string | undefined, level: ActivityLevel = "info", category = "workflow") {
    activitySequence.current += 1;
    const entry: ActivityEntry = { id: `ui-${Date.now()}-${activitySequence.current}`, timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), level, category, title, detail };
    setActivityEntries((current) => [entry, ...current].slice(0, MAX_ACTIVITY_HISTORY));
    if (level !== "info") setActivityAttention(true);
  }

  function resetProjectWorkflowState(): void {
    setBrief(demoBrief);
    setCandidate(undefined);
    setOptimizedResult(undefined);
    setOptimizerStep("input");
    setOptimizerReview(undefined);
    setOptimizerSourcePlan(undefined);
    setOptimizerTrace(undefined);
    setTokenProjection(undefined);
    setOptimizerSaveNotice("");
    setPromptText("");
    setAssignmentId(DEFAULT_ASSIGNMENT_ID);
    setOutputSize("low");
    setDraft("");
    setFeedbackRating(undefined);
    setFeedbackOpen(false);
    setIsSavingEvaluation(false);
    setFeedbackNotice("");
    setCopyNotice("");
    setNote("");
    setWorkflowError("");
    setConsentError("");
    setSelected(DEFAULT_MODULES);
    setStage("consent");
    setRestoreNotice(false);
    setIsApproving(false);
    setIsConfirming(false);
    setIsCompiling(false);
    setIsResetting(false);
    if (optimizerDraftTimer.current !== undefined) window.clearTimeout(optimizerDraftTimer.current);
  }

  function hydrateSnapshot(snapshot: DwiWorkspaceSnapshot): void {
    if (snapshot.brief) setBrief(snapshot.brief);
    if (snapshot.selectedModuleIds) setSelected(snapshot.selectedModuleIds);
    const input = snapshot.optimizerDraft ?? snapshot.candidateInput;
    setCandidate(snapshot.candidate);
    setPromptText(input?.task ?? "");
    setAssignmentId(input?.assignmentId ?? DEFAULT_ASSIGNMENT_ID);
    setOutputSize(input?.outputSize ?? "low");
    const review = snapshot.optimizerReview;
    setOptimizerReview(review);
    setTokenProjection(undefined);
    setOptimizedResult(undefined);
    setOptimizerStep(restoredOptimizerStep.current === "review" && snapshot.candidate && review ? "review" : "input");
    setDraft(snapshot.evaluationMarkdown ?? "");
    setFeedbackRating(feedbackRatingFromMarkdown(snapshot.evaluationMarkdown));
    setFeedbackOpen(false);
    setIsSavingEvaluation(false);
    setStage(restoredStage(snapshot));
    setWorkflowError("");
  }

  useEffect(() => {
    const listener = (event: MessageEvent<HostMessage>) => {
      const data = event.data;
      if (data.type === "dwi.surface.select" && data.surface) setActiveSurface(data.surface);
      if (data.type === "prompt.v2.view.state" && data.view) restoredOptimizerStep.current = data.view;
      if (data.type === "prompt.v2.recents") setOptimizerRecents(data.recents ?? []);
      if (data.type === "prompt.v2.pending") {
        setIsCompiling(true);
        setWorkflowError("");
        setActiveSurface("optimizer");
      }
      if (data.type === "prompt.v2.compiled" && data.candidate) {
        setCandidate(data.candidate);
        setOptimizerSourcePlan(data.sourcePlan);
        setOptimizerTrace(undefined);
        setTokenProjection(undefined);
        setOptimizerReview({ source: "local" });
        setIsCompiling(false);
        setWorkflowError("");
        setStage("evaluate");
        optimizerFocusPending.current = "resolve";
        setOptimizerStep("resolve");
        setActiveSurface("optimizer");
      }
      if (data.type === "prompt.v2.semantic.result" && data.candidate && data.localCandidate && (data.semantic || data.result)) {
        setCandidate(data.candidate);
        setOptimizerSourcePlan(data.sourcePlan);
        setOptimizerTrace(data.trace);
        setOptimizedResult(data.result);
        const reviewProvider = data.semantic?.provider ?? (data.result?.provider === "gemini" || data.result?.provider === "openai" ? data.result.provider : undefined);
        setOptimizerReview({ source: "provider", provider: reviewProvider, model: data.semantic?.model ?? data.result?.model, title: data.semantic ? "Validated semantic enhancement" : data.result?.title, summary: data.semantic ? `${data.semantic.appliedOperations} current hash-bound section operation(s) compiled locally.` : data.result?.summary });
        setTokenProjection(data.semantic?.projection);
        setOptimizerSaveNotice("");
        setIsCompiling(false);
        setStage("evaluate");
        optimizerFocusPending.current = "review";
        setOptimizerStep("review");
        setActiveSurface("optimizer");
      }
      if (data.type === "prompt.v2.semantic.fallback" && data.localCandidate) {
        setCandidate(data.localCandidate);
        setOptimizerSourcePlan(data.sourcePlan);
        setOptimizerTrace(data.trace);
        setOptimizedResult(undefined);
        setTokenProjection(undefined);
        setOptimizerReview({ source: "local" });
        setIsCompiling(false);
        setWorkflowError(data.message ?? "The provider result was rejected. The local candidate remains available.");
        setStage("evaluate");
        optimizerFocusPending.current = "review";
        setOptimizerStep("review");
        setActiveSurface("optimizer");
      }
      if (data.type === "prompt.v2.error") {
        setIsCompiling(false);
        setWorkflowError(data.message ?? "Prompt Optimizer could not complete this request.");
        if (data.failureKind === "initialization_required") setActiveSurface("initializer");
        else setActiveSurface("optimizer");
        const health = data.failureKind === "authentication" ? "invalid-credential" : data.failureKind === "invalid_model" ? "invalid-model" : data.failureKind === "quota" ? "quota" : data.failureKind === "rate-limit" ? "rate-limit" : data.failureKind === "timeout" ? "timeout" : data.failureKind === "network" ? "connectivity" : undefined;
        if (health) setProvider((current) => ({ ...current, health, configured: false, errorMessage: data.message }));
      }
      if (data.type === "prompt.v2.cancelled") {
        setIsCompiling(false);
        setWorkflowError("Prompt rewrite cancelled.");
      }
      if (data.type === "prompt.v2.record.result") setOptimizerSaveNotice("Saved to recent prompts.");
      if (data.type === "prompt.v2.session.state") {
        if (data.draft) {
          setPromptText(data.draft.task);
          setAssignmentId(data.draft.assignmentId);
          setOutputSize(data.draft.outputSize);
        }
        setCandidate(data.candidate);
        setOptimizerReview(data.review);
        const restored = data.view === "review" && data.candidate && data.review ? "review" : "input";
        setOptimizerStep(restored);
        restoredOptimizerStep.current = restored;
      }
      if (data.type === "prompt.v2.session.reset.result") {
        setPromptText("");
        setCandidate(undefined);
        setOptimizedResult(undefined);
        setOptimizerReview(undefined);
        setOptimizerSourcePlan(undefined);
        setOptimizerTrace(undefined);
        setTokenProjection(undefined);
        setOptimizerRecents([]);
        setOptimizerSaveNotice("");
        setCopyNotice("");
        setFeedbackOpen(false);
        setWorkflowError("");
        setOptimizerStep("input");
        setStage("compose");
        setOptimizerResetPending(false);
        setIsOptimizerResetting(false);
        setActiveSurface("optimizer");
      }
      if (data.type === "dwi.activity.entry" && data.entry) {
        setActivityEntries((current) => [data.entry!, ...current.filter((entry) => entry.id !== data.entry!.id)].slice(0, MAX_ACTIVITY_HISTORY));
        if (data.entry.level !== "info") setActivityAttention(true);
      }
      if (data.type === "dwi.library.state" && data.state) {
        setLibraryRevision(data.state.revision);
        setLibraryState(libraryStateFromHost(data.state));
      }
      if (data.type === "dwi.library.detail" && data.detail) {
        const detail = libraryDetailFromHost(data.detail);
        libraryTemplates.current.set(detail.template.id, detail.template);
        libraryDetailCache.current.set(detail.template.id, detail);
        setLibraryRevision(data.detail.revision);
        setLibraryDetail(detail);
      }
      if (data.type === "dwi.library.saved" && data.detail && data.state && data.operationId) {
        const detail = libraryDetailFromHost(data.detail);
        libraryTemplates.current.set(detail.template.id, detail.template);
        libraryDetailCache.current.set(detail.template.id, detail);
        setLibraryRevision(data.state.revision);
        setLibraryState(libraryStateFromHost(data.state));
        setLibraryDetail(detail);
        const pending = pendingLibraryOperations.current.get(data.operationId);
        if (pending?.kind === "save") {
          if (data.published === false) pending.reject(new Error("Saved locally, but the backup was not acknowledged. Review the latest local version and retry."));
          else pending.resolve(detail);
        }
        pendingLibraryOperations.current.delete(data.operationId);
      }
      if (data.type === "dwi.library.deleted" && data.state && data.operationId && data.templateId) {
        libraryTemplates.current.delete(data.templateId);
        libraryDetailCache.current.delete(data.templateId);
        setLibraryRevision(data.state.revision);
        setLibraryState(libraryStateFromHost(data.state));
        setLibraryDetail((current) => current?.item.id === data.templateId ? undefined : current);
        const pending = pendingLibraryOperations.current.get(data.operationId);
        if (pending?.kind === "delete") pending.resolve();
        pendingLibraryOperations.current.delete(data.operationId);
      }
      if (data.type === "dwi.library.feedback" && data.state && data.operationId && data.templateId) {
        const templateId = data.templateId;
        const revision = data.state.revision;
        setLibraryRevision(revision);
        setLibraryState(libraryStateFromHost(data.state));
        setLibraryDetail((current) => {
          if (!current || current.item.id !== templateId) return current;
          const refreshed: LibraryTemplateDetail = { ...current, revision };
          libraryDetailCache.current.set(templateId, refreshed);
          return refreshed;
        });
        const pending = pendingLibraryOperations.current.get(data.operationId);
        if (pending?.kind === "feedback") {
          if (data.published === false) pending.reject(new Error("Feedback was kept here because delivery was not acknowledged. Try sending it again."));
          else pending.resolve();
        }
        pendingLibraryOperations.current.delete(data.operationId);
      }
      if (data.type === "dwi.library.clone" && data.operationId && data.status) {
        const pending = pendingLibraryOperations.current.get(data.operationId);
        if (pending?.kind === "clone") {
          if (data.status === "ready" && data.template) pending.resolve({ operationId: data.operationId, status: "ready", template: data.template });
          else if (data.status === "invalid") pending.resolve({ operationId: data.operationId, status: "invalid", message: data.message ?? "The source is not a valid template." });
          else pending.resolve(undefined);
        }
        pendingLibraryOperations.current.delete(data.operationId);
      }
      if (data.type === "dwi.open-folder.result") {
        if (data.ok) {
          setProjectActionMessage("");
          vscode?.postMessage({ type: "dwi.session.open" });
        } else {
          setProjectActionMessage(openFolderMessageForReason(data.reason));
        }
        return;
      }
      if (data.type === "dwi.library.error") {
        const pending = data.operationId ? pendingLibraryOperations.current.get(data.operationId) : undefined;
        pending?.reject(new Error(data.message ?? "The Library request could not be completed."));
        if (data.operationId) pendingLibraryOperations.current.delete(data.operationId);
        if (typeof data.currentRevision === "number") {
          setLibraryRevision(data.currentRevision);
          vscode?.postMessage({ type: "dwi.library.open" });
          if (pending && pending.kind !== "clone" && pending.templateId) {
            vscode?.postMessage({ type: "dwi.library.item.get", templateId: pending.templateId });
          }
        }
        if (!pending) setLibraryState((current) => ({ ...current, status: "error", error: data.message ?? "The Library could not be loaded." }));
      }
      if (data.type === "dwi.project.snapshot" && data.snapshot) {
        const normalized = normalizeProjectSnapshot(data.snapshot);
        setProjectSnapshot(normalized);
        setProjectActionMessage("");
      }
      if (data.type === "dwi.project.scanning") {
        setProjectSnapshot((current) => ({ ...current, status: "scanning", message: data.message }));
        setProjectActionMessage("");
      }
      if (data.type === "dwi.project.error") setProjectSnapshot((current) => ({ ...current, status: "error", message: data.message ?? "The project check failed." }));
      if (data.type === "dwi.project.action") setProjectActionMessage(data.message ?? "Done.");
      if (data.type === "dwi.consent.loading") {
        setIsApproving(true);
        setConsentError("");
      }
      if (data.type === "dwi.brief.ready" && data.brief) {
        setBrief({ ...data.brief, confirmed: false });
        setCandidate(undefined);
        setOptimizerReview(undefined);
        setDraft("");
        setFeedbackRating(undefined);
        setFeedbackOpen(false);
        setIsSavingEvaluation(false);
        setFeedbackNotice("");
        setCopyNotice("");
        setNote("");
        setWorkflowError("");
        setIsApproving(false);
        setIsConfirming(false);
        setStage("brief");
        setRestoreNotice(false);
        setSessionMode("workspace");
      }
      if (data.type === "dwi.brief.confirmed" && data.brief) {
        setBrief({ ...data.brief, confirmed: true });
        setCandidate(undefined);
        setOptimizerReview(undefined);
        setWorkflowError("");
        setIsConfirming(false);
        setStage("compose");
        const returnStep = contextReviewReturnStep.current ??
          (activeSurfaceRef.current === "initializer" && restoredOptimizerStep.current !== "input" ? restoredOptimizerStep.current : undefined);
        if (returnStep) {
          restoredOptimizerStep.current = returnStep;
          optimizerFocusPending.current = returnStep;
          setOptimizerStep(returnStep);
          setActiveSurface("optimizer");
          contextReviewReturnStep.current = undefined;
        } else {
          setOptimizerStep("input");
          setActiveSurface((current) => current === "optimizer" ? "optimizer" : "home");
        }
      }
      if (data.type === "dwi.snapshot.partial") {
        const snapshot = data.snapshot as DwiWorkspaceSnapshot | undefined;
        if (snapshot) hydrateSnapshot(snapshot);
        setSessionMode("workspace");
        setRestoreNotice(Boolean(snapshot?.brief));
      }
      if (data.type === "dwi.snapshot.complete" || data.type === "dwi.journey.completed") {
        const snapshot = data.snapshot as DwiWorkspaceSnapshot | undefined;
        if (data.type === "dwi.journey.completed") {
          feedbackFocusPending.current = true;
          setFeedbackNotice("Evaluation saved.");
        }
        if (snapshot) hydrateSnapshot(snapshot);
        setSessionMode("workspace");
        setRestoreNotice(Boolean(snapshot));
      }
      if (data.type === "dwi.snapshot.absent") {
        resetProjectWorkflowState();
        setSessionMode("workspace");
        setResetPending(false);
        setIsResetting(false);
      }
      if (data.type === "dwi.snapshot.recovery") {
        resetProjectWorkflowState();
        setSessionMode("recovery");
      }
      if (data.type === "dwi.session.generic") {
        resetProjectWorkflowState();
        setSessionMode("generic");
        setProjectSnapshot({ ...PROJECT_UI_FIXTURES.unsupported, projectName: "No project open", message: openFolderMessageForReason(data.reason) });
        setProjectActionMessage("");
      }
      if (data.type === "dwi.workspace.changed") {
        setRoots([]);
        resetProjectWorkflowState();
        setSessionMode("loading");
        setProjectSnapshot(PROJECT_UI_FIXTURES.scanning);
        vscode?.postMessage({ type: "dwi.session.open" });
      }
      if (data.type === "dwi.error") {
        setIsApproving(false);
        setIsConfirming(false);
        setIsCompiling(false);
        setIsResetting(false);
        setIsSavingEvaluation(false);
        setConsentError(data.message ?? "DWI could not check this project.");
        setWorkflowError(data.message ?? "DWI could not complete this step.");
        if (data.code === "project-stale") {
          setProjectSnapshot((current) => ({ ...current, status: "stale", reviewed: false, message: data.message }));
          setStage("brief");
        } else if (data.code === "review-required") {
          setProjectSnapshot((current) => ({ ...current, reviewed: false }));
          setStage("brief");
        } else if (data.code === "project-details-required") {
          setProjectSnapshot((current) => ({ ...current, status: "conflict", reviewed: false, message: data.message }));
          setStage("brief");
        } else if (data.code === "candidate-invalid" || data.code === "candidate-missing") {
          setCandidate(undefined);
          setOptimizerReview(undefined);
          setOptimizerStep("input");
          setStage("compose");
          setActiveSurface("optimizer");
        } else if (data.code?.startsWith("provider-")) {
          setActiveSurface("optimizer");
        }
      }
      if (data.type === "dwi.candidate.ready" && data.candidate) {
        setCandidate(data.candidate);
        setOptimizerReview({ source: "local" });
        setDraft("");
        setFeedbackRating(undefined);
        setFeedbackOpen(false);
        setFeedbackNotice("");
        setCopyNotice("");
        setWorkflowError("");
        setIsCompiling(false);
        setStage("evaluate");
        optimizerFocusPending.current = "review";
        setOptimizerStep("review");
        setActiveSurface("optimizer");
      }
      if (data.type === "dwi.feedback.deleted") {
        feedbackFocusPending.current = true;
        setDraft("");
        setFeedbackRating(undefined);
        setFeedbackOpen(false);
        setIsSavingEvaluation(false);
        setFeedbackNotice("Evaluation deleted.");
        setCopyNotice("");
        setNote("");
        setWorkflowError("");
      }
      if ((data.type === "dwi.provider.state" || data.type === "dwi.provider.saved") && data.settings) {
        const settings = { ...data.settings, health: data.settings.health ?? (data.settings.configured ? "unverified" : "missing") };
        setProvider(settings);
        setProviderModelDraft(settings.model ?? "");
        setSettingsError("");
      }
      if (data.type === "dwi.provider.error") setSettingsError(data.message ?? "Provider settings could not be saved.");
      if (data.type === "dwi.provider.checking" && data.settings) setProvider({ ...data.settings, health: "checking" });
      if (data.type === "dwi.provider.check-failed") {
        setProvider((current) => ({ ...current, health: data.health as ProviderSettings["health"], errorMessage: data.message }));
        setSettingsError(data.message ?? "The provider did not respond.");
      }
      if (data.type === "dwi.workspace.choose-root") {
        setRoots(data.roots ?? []);
        setActiveSurface((current) => current === "optimizer" ? "optimizer" : "home");
      }
      if (data.type === "dwi.consent.required") {
        resetProjectWorkflowState();
        setSessionMode("workspace");
        setActiveSurface("initializer");
        setConsentCapability(data.consentCapability);
        setConsentError(data.message ?? "Allow the local project check before continuing.");
      }
      if (data.type === "dwi.project.snapshot" && data.consentCapability) setConsentCapability(data.consentCapability);
    };
    window.addEventListener("message", listener);
    vscode?.postMessage({ type: "dwi.session.open" });
    vscode?.postMessage({ type: "dwi.library.open" });
    return () => window.removeEventListener("message", listener);
  }, []);

  useEffect(() => {
    if (activeSurface === "settings") vscode?.postMessage({ type: "dwi.provider.get" });
  }, [activeSurface]);

  useEffect(() => {
    if (activeSurface !== "home" || !restoreSurfaceFocus.current) return;
    restoreSurfaceFocus.current = false;
    const opener = surfaceReturnFocus.current;
    surfaceReturnFocus.current = null;
    (opener?.isConnected ? opener : workflowTriggerRef.current)?.focus();
  }, [activeSurface]);

  useEffect(() => {
    if (activeSurface !== "optimizer" || optimizerFocusPending.current !== optimizerStep) return;
    optimizerFocusPending.current = undefined;
    window.requestAnimationFrame(() => {
      if (optimizerStep === "review") optimizerReviewHeadingRef.current?.focus();
      else if (optimizerStep === "resolve") document.querySelector<HTMLElement>('[data-optimizer-resolve-heading]')?.focus();
      else document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Task to optimize"]')?.focus();
    });
  }, [activeSurface, optimizerStep]);

  useEffect(() => () => {
    if (optimizerDraftTimer.current !== undefined) window.clearTimeout(optimizerDraftTimer.current);
  }, []);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (resetPending) setResetPending(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [resetPending]);

  function approve() {
    setConsentError("");
    setIsApproving(true);
    recordActivity("Project check started", "Bounded local inspection requested.");
    if (vscode) vscode.postMessage({ type: "dwi.consent.approve", consentCapability });
    else {
      setIsApproving(false);
      setStage("brief");
    }
  }

  function confirmBrief() {
    setWorkflowError("");
    recordActivity("Brief confirmation requested", undefined);
    if (vscode) {
      setIsConfirming(true);
      vscode.postMessage({ type: "dwi.brief.confirm", brief: { confirmed: true, corrections: brief.corrections } });
      return;
    }
    setBrief({ ...brief, confirmed: true });
    setStage("compose");
    setActiveSurface("home");
  }

  function optimizerInputFor(task = promptText, nextAssignmentId = assignmentId, nextOutputSize = outputSize) {
    const assignment = assignmentOptions.find(({ id }) => id === nextAssignmentId);
    return assignment ? { task, assignmentId: assignment.id, promptType: assignment.promptType as PromptType, outputSize: nextOutputSize } : undefined;
  }

  function persistOptimizerDraft(input: NonNullable<DwiWorkspaceSnapshot["optimizerDraft"]>): void {
    if (optimizerDraftTimer.current !== undefined) window.clearTimeout(optimizerDraftTimer.current);
    optimizerDraftTimer.current = window.setTimeout(() => {
      vscode?.postMessage({ type: "prompt.v2.draft.save", schemaVersion: "prompt-command.v2", input });
      optimizerDraftTimer.current = undefined;
    }, 250);
  }

  function invalidateOptimizerReview(input: NonNullable<DwiWorkspaceSnapshot["optimizerDraft"]>): void {
    setCandidate(undefined);
    setOptimizedResult(undefined);
    setOptimizerReview(undefined);
    setOptimizerSourcePlan(undefined);
    setOptimizerTrace(undefined);
    setTokenProjection(undefined);
    setOptimizerSaveNotice("");
    setCopyNotice("");
    setStage("compose");
    setOptimizerStep("input");
    restoredOptimizerStep.current = "input";
    vscode?.postMessage({ type: "prompt.v2.view.set", schemaVersion: "prompt-command.v2", view: "input" });
    persistOptimizerDraft(input);
  }

  function changePromptText(value: string): void {
    setPromptText(value);
    const input = optimizerInputFor(value);
    if (input) invalidateOptimizerReview(input);
  }

  function changeAssignment(assignment: PromptAssignmentOption): void {
    setAssignmentId(assignment.id);
    const input = { task: promptText, assignmentId: assignment.id, promptType: assignment.promptType as PromptType, outputSize };
    invalidateOptimizerReview(input);
  }

  function changeOutputSize(value: PromptOutputSize): void {
    setOutputSize(value);
    const input = optimizerInputFor(promptText, assignmentId, value);
    if (input) invalidateOptimizerReview(input);
  }

  function selectOptimizerStep(next: OptimizerStep): void {
    if (next !== "input" && (!candidate || !optimizerReview)) return;
    setWorkflowError("");
    optimizerFocusPending.current = next;
    restoredOptimizerStep.current = next;
    setOptimizerStep(next);
    vscode?.postMessage({ type: "prompt.v2.view.set", schemaVersion: "prompt-command.v2", view: next });
  }

  function runOptimizer(operation: "compile" | "enhance") {
    if (optimizerDraftTimer.current !== undefined) {
      window.clearTimeout(optimizerDraftTimer.current);
      optimizerDraftTimer.current = undefined;
    }
    setWorkflowError("");
    setDraft("");
    setFeedbackRating(undefined);
    setFeedbackOpen(false);
    setFeedbackNotice("");
    setCopyNotice("");
    const assignment = assignmentOptions.find(({ id }) => id === assignmentId);
    if (!assignment) {
      setWorkflowError("Template assignments are still loading. Try again in a moment.");
      return;
    }
    if (operation === "enhance" && provider.health !== "ready") {
      setWorkflowError("Configure and verify an LLM provider before rewriting the prompt.");
      return;
    }
    setActiveSurface("optimizer");
    setIsCompiling(true);
    optimizerRevision.current += 1;
    const requestId = `request-${crypto.randomUUID()}`;
    const correlationId = `correlation-${crypto.randomUUID()}`;
    const cancellationId = `cancel-${crypto.randomUUID()}`;
    optimizerRequest.current = { requestId, correlationId, cancellationId };
    const identity = { schemaVersion: "prompt-command.v2", requestId, correlationId, cancellationId, documentId: "current-prompt", revision: optimizerRevision.current, baseHash: "0".repeat(64) };
    const input = { task: promptText, assignmentId: assignment.id, promptType: assignment.promptType, outputSize };
    recordActivity(operation === "compile" ? "Local preview started" : "LLM rewrite started", assignment.name, "info", "prompt");
    if (vscode) {
      vscode.postMessage(operation === "compile"
        ? { type: "prompt.v2.compile", ...identity, input }
        : { type: "prompt.v2.semantic", ...identity, operation: "enhance", input });
      return;
    }
    const template = libraryTemplates.current.get(assignment.id);
    const preview = compileDwiCandidate({ ...brief, confirmed: true }, DEFAULT_MODULES, {
      task: promptText,
      promptType: assignment.promptType as PromptType,
      template,
      outputSize,
    });
    setOptimizerSourcePlan(resolvePromptSourcesV2({
      task: promptText,
      template: { id: assignment.id, label: assignment.name },
      guidance: DEFAULT_MODULES.map((id) => ({ id, label: id, required: true })),
      project: {
        sourceId: "project:preview",
        label: "Reviewed project snapshot",
        approved: projectReady,
        current: projectReady,
        provenance: ["local preview fixture"],
        facts: brief.facts.map(({ label, value }) => ({ label, value })),
        conflicts: [],
        questions: brief.unknowns.slice(0, 3).map((unknown, index) => ({ id: `preview-question:${index}`, prompt: unknown, targetSectionId: "relevant-context", reason: "Project knowledge marks this as unknown." })),
        assumptions: [],
      },
    }));
    setCandidate(preview);
    setOptimizerReview({ source: "local" });
    setIsCompiling(false);
    if (operation === "compile") {
      setStage("evaluate");
      optimizerFocusPending.current = "resolve";
      setOptimizerStep("resolve");
    } else setWorkflowError("LLM rewriting is available in the installed VS Code extension.");
  }

  function cancelOptimizer(): void {
    const request = optimizerRequest.current;
    if (!request) return;
    vscode?.postMessage({ type: "prompt.v2.cancel", schemaVersion: "prompt-command.v2", ...request });
  }

  function saveOptimizerRecent(): void {
    if (!candidate || !optimizerReview) return;
    const request = optimizerRequest.current;
    vscode?.postMessage({ type: "prompt.v2.record.save", schemaVersion: "prompt-command.v2", requestId: request?.requestId ?? `request-${crypto.randomUUID()}`, correlationId: request?.correlationId ?? `correlation-${crypto.randomUUID()}`, documentId: "current-prompt" });
  }

  function openPromptReview(): void {
    if (!candidate || !optimizerReview) return;
    vscode?.postMessage({ type: "prompt.v2.review.open", schemaVersion: "prompt-command.v2" });
  }

  function feedback(rating: FeedbackRating) {
    if (!candidate) return;
    const input = { rating, tags: ["feature-delivery"], note, selectedModuleIds: candidate.selectedModuleIds, estimate: candidate.estimate, elapsedMs: 0 };
    setWorkflowError("");
    setIsSavingEvaluation(true);
    setFeedbackNotice("");
    if (vscode) {
      vscode.postMessage({ type: "dwi.journey.complete", feedback: input });
      return;
    }
    const markdown = evaluationMarkdown(createFeedback(input), brief);
    setDraft(markdown);
    setFeedbackRating(rating);
    feedbackFocusPending.current = true;
    setFeedbackOpen(false);
    setIsSavingEvaluation(false);
    setFeedbackNotice("Evaluation saved.");
    recordActivity("Evaluation note created", `Feedback: ${rating}.`);
  }

  async function copyCandidate(): Promise<void> {
    if (!candidate) return;
    try {
      await navigator.clipboard.writeText(candidate.text);
      setWorkflowError("");
      setCopyNotice("Prompt copied.");
      recordActivity("Prompt copied", "Generated prompt copied to the clipboard.");
    } catch {
      setCopyNotice("");
      setWorkflowError("The prompt could not be copied. Select the prompt text and copy it manually.");
    }
  }

  async function copyEvaluation(): Promise<void> {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setWorkflowError("");
      setCopyNotice("Evaluation note copied.");
    } catch {
      setCopyNotice("");
      setWorkflowError("The evaluation note could not be copied.");
    }
  }

  function refreshProject() {
    setProjectActionMessage("");
    setProjectSnapshot((current) => ({ ...current, status: "scanning", message: undefined }));
    recordActivity("Project check started", "Refreshing bounded project details.");
    if (vscode) vscode.postMessage({ type: "dwi.project.refresh" });
    else window.setTimeout(() => setProjectSnapshot(projectFixtureFromLocation()), 150);
  }

  function reviewProject() {
    setProjectActionMessage("Opening project review…");
    recordActivity("Project review opened", undefined);
    vscode?.postMessage({ type: "dwi.project.review" });
  }

  function resolveProjectGaps() {
    setProjectActionMessage("Opening project details…");
    recordActivity("Project declaration opened", "Add or correct explicit project details.");
    vscode?.postMessage({ type: "dwi.project.open-declaration" });
  }

  function openFolderFromExplorer() {
    setProjectActionMessage("Opening Explorer to choose a workspace.");
    vscode?.postMessage({ type: "dwi.session.open-folder" });
  }

  function requestReset() {
    setResetPending(true);
  }

  function confirmReset() {
    setIsResetting(true);
    recordActivity("Session reset requested", undefined, "warning", "session");
    if (vscode) {
      vscode.postMessage({ type: "dwi.snapshot.reset" });
      return;
    }
    resetProjectWorkflowState();
    setResetPending(false);
    setIsResetting(false);
  }

  function confirmOptimizerReset() {
    setIsOptimizerResetting(true);
    setWorkflowError("");
    recordActivity("Prompt Optimizer reset requested", "Approved project knowledge will be retained.", "warning", "prompt");
    if (vscode) {
      vscode.postMessage({ type: "prompt.v2.session.reset", schemaVersion: "prompt-command.v2" });
      return;
    }
    setPromptText("");
    setCandidate(undefined);
    setOptimizerReview(undefined);
    setOptimizerStep("input");
    setStage("compose");
    setOptimizerResetPending(false);
    setIsOptimizerResetting(false);
  }

  function openInfo() {
    setResetPending(false);
    setActivityAttention(false);
    restoreSurfaceFocus.current = true;
    surfaceReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveSurface("activity");
  }

  function openEditorDocument(document: Record<string, unknown>) {
    vscode?.postMessage({ type: "dwi.document.open", document });
  }

  function openDiagnostics() {
    openEditorDocument({
      kind: "diagnostics",
      data: diagnosticDump(stage, restoreNotice, projectSnapshot, provider, selected, candidate),
    });
  }

  function openSettings() {
    setResetPending(false);
    restoreSurfaceFocus.current = true;
    surfaceReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveSurface("settings");
  }

  function returnToWorkflow() {
    setActiveSurface("home");
  }

  function activateWorkflow() {
    restoreSurfaceFocus.current = false;
    surfaceReturnFocus.current = null;
    setActiveSurface("home");
  }

  function activateInitializer() {
    setResetPending(false);
    restoreSurfaceFocus.current = false;
    surfaceReturnFocus.current = null;
    if (activeSurfaceRef.current === "optimizer") {
      const visibleStep = document.querySelector<HTMLElement>('.optimizer-step-navigation [aria-current="step"]')?.getAttribute("aria-label");
      contextReviewReturnStep.current = visibleStep?.includes("3") ? "review" : visibleStep?.includes("2") ? "resolve" : restoredOptimizerStep.current;
    }
    setActiveSurface("initializer");
  }

  function activateOptimizer() {
    setResetPending(false);
    restoreSurfaceFocus.current = false;
    surfaceReturnFocus.current = null;
    setActiveSurface("optimizer");
  }

  async function requestLibraryDetail({ templateId }: { templateId: string }): Promise<LibraryTemplateDetail | undefined> {
    setLibraryDetail(undefined);
    if (vscode) {
      vscode.postMessage({ type: "dwi.library.item.get", templateId });
      return undefined;
    }
    const detail = libraryDetailCache.current.get(templateId);
    if (!detail) return undefined;
    const reviewedAt = new Date().toISOString();
    const next = { ...detail, item: { ...detail.item, reviewedAt } };
    libraryDetailCache.current.set(templateId, next);
    setLibraryDetail(next);
    setLibraryState((current) => ({
      ...current,
      recents: [next.item, ...current.recents.filter(({ id }) => id !== templateId)],
      managedTemplates: current.managedTemplates.map((item) => item.id === templateId ? next.item : item),
      personalTemplates: current.personalTemplates.map((item) => item.id === templateId ? next.item : item),
    }));
    return next;
  }

  function saveLibraryTemplate(request: LibrarySaveRequest): Promise<LibraryTemplateDetail> {
    if (vscode) {
      return new Promise((resolve, reject) => {
        pendingLibraryOperations.current.set(request.operationId, { kind: "save", templateId: request.template.templateId, resolve, reject });
        vscode.postMessage({
          type: "dwi.library.template.save",
          operationId: request.operationId,
          expectedRevision: request.expectedRevision ?? libraryRevision,
          template: request.template,
        });
      });
    }
    const { templateId, ...input } = request.template;
    const id = templateId ?? `personal-${Date.now()}`;
    if (libraryState.managedTemplates.some((template) => template.id === id)) return Promise.reject(new Error("Managed templates cannot be changed."));
    const previous = libraryDetailCache.current.get(id);
    const now = new Date().toISOString();
    const template: PromptTemplate = {
      id,
      builtIn: false,
      ...input,
      createdAt: previous?.template.createdAt ?? now,
      updatedAt: now,
    };
    const nextRevision = libraryRevision + 1;
    const itemVersion = (previous?.versions[0]?.revision ?? 0) + 1;
    const detail: LibraryTemplateDetail = {
      item: { id, name: template.name, kind: "template", source: "personal", updatedAt: now, reviewedAt: now, promptType: template.promptType },
      template,
      revision: nextRevision,
      versions: [
        { revision: itemVersion, updatedAt: now, label: "Current" },
        ...(previous?.versions ?? []).map((version) => ({ ...version, label: undefined })),
      ].slice(0, 5),
    };
    libraryTemplates.current.set(id, template);
    libraryDetailCache.current.set(id, detail);
    setLibraryRevision(nextRevision);
    setLibraryDetail(detail);
    setLibraryState((current) => ({
      ...current,
      personalTemplates: [detail.item, ...current.personalTemplates.filter((item) => item.id !== id)],
      recents: [detail.item, ...current.recents.filter((item) => item.id !== id)],
    }));
    recordActivity(templateId ? "Personal template updated" : "Personal template created", undefined, "info", "library");
    return Promise.resolve(detail);
  }

  function deleteLibraryTemplate(request: LibraryDeleteRequest): Promise<void> {
    if (vscode) {
      return new Promise((resolve, reject) => {
        pendingLibraryOperations.current.set(request.operationId, { kind: "delete", templateId: request.templateId, resolve, reject });
        vscode.postMessage({ type: "dwi.library.template.delete", ...request });
      });
    }
    libraryTemplates.current.delete(request.templateId);
    libraryDetailCache.current.delete(request.templateId);
    setLibraryRevision((revision) => revision + 1);
    setLibraryDetail((current) => current?.item.id === request.templateId ? undefined : current);
    setLibraryState((current) => ({
      ...current,
      personalTemplates: current.personalTemplates.filter(({ id }) => id !== request.templateId),
      recents: current.recents.filter(({ id }) => id !== request.templateId),
    }));
    recordActivity("Personal template deleted", undefined, "warning", "library");
    return Promise.resolve();
  }

  function submitLibraryFeedback(request: LibraryFeedbackRequest): Promise<void> {
    if (vscode) {
      return new Promise((resolve, reject) => {
        pendingLibraryOperations.current.set(request.operationId, { kind: "feedback", templateId: request.templateId, resolve, reject });
        vscode.postMessage({
          type: "dwi.library.feedback.submit",
          operationId: request.operationId,
          expectedRevision: request.expectedRevision,
          templateId: request.templateId,
          rating: request.rating,
          stars: request.stars,
          note: request.note,
        });
      });
    }
    const reviewedAt = new Date().toISOString();
    setLibraryRevision((revision) => revision + 1);
    setLibraryState((current) => {
      const update = (item: LibraryItemSummary) => item.id === request.templateId ? { ...item, reviewedAt } : item;
      const source = current.managedTemplates.find(({ id }) => id === request.templateId) ?? current.personalTemplates.find(({ id }) => id === request.templateId);
      const reviewed = source ? update(source) : undefined;
      return {
        ...current,
        managedTemplates: current.managedTemplates.map(update),
        personalTemplates: current.personalTemplates.map(update),
        recents: reviewed ? [reviewed, ...current.recents.filter(({ id }) => id !== request.templateId)] : current.recents,
      };
    });
    recordActivity("Managed template feedback sent", undefined, "info", "library");
    return Promise.resolve();
  }

  function cloneFromPaste(operationId: string, text: string): Promise<LibraryCloneResult> {
    if (vscode) {
      return new Promise<LibraryCloneResult | undefined>((resolve, reject) => {
        pendingLibraryOperations.current.set(operationId, { kind: "clone", resolve, reject });
        vscode.postMessage({ type: "dwi.library.clone.paste.validate", operationId, text });
      }).then((result) => result ?? { operationId, status: "invalid" as const, message: "No clone source was selected." });
    }
    const template = previewCloneInput(text);
    return Promise.resolve(template
      ? { operationId, status: "ready", template }
      : { operationId, status: "invalid", message: "The response is empty or does not match a supported template." });
  }

  function cloneFromFile(operationId: string): Promise<LibraryCloneResult | undefined> {
    if (vscode) {
      return new Promise<LibraryCloneResult | undefined>((resolve, reject) => {
        pendingLibraryOperations.current.set(operationId, { kind: "clone", resolve, reject });
        vscode.postMessage({ type: "dwi.library.clone.file.pick", operationId });
      });
    }
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".md,.txt,.json,.yaml,.yml";
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) { resolve(undefined); return; }
        void file.text().then((text) => {
          const template = previewCloneInput(text);
          resolve(template
            ? { operationId, status: "ready", template }
            : { operationId, status: "invalid", message: "The selected file is not a supported template." });
        }, () => resolve({ operationId, status: "invalid", message: "The selected file could not be read." }));
      }, { once: true });
      input.addEventListener("cancel", () => resolve(undefined), { once: true });
      input.click();
    });
  }

  const homeProviderStatus = providerNotificationState(provider.health ?? "missing");
  return <div className="webview-surface">
    <main className={`shell${railExpanded ? " rail-expanded" : ""}`}>
    <nav className="activity-rail" aria-label="Prompt Optimizer navigation">
      <div className="rail-primary">
        <button ref={workflowTriggerRef} className={`rail-button${activeSurface === "home" ? " active" : ""}`} type="button" aria-current={activeSurface === "home" ? "page" : undefined} aria-label="Home" onClick={activateWorkflow}><Icon name="home" /><span className="rail-label">Home</span></button>
        <button className={`rail-button${activeSurface === "initializer" ? " active" : ""}`} type="button" aria-current={activeSurface === "initializer" ? "page" : undefined} aria-label="Project Meta Context" onClick={() => { if (activeSurface === "optimizer") contextReviewReturnStep.current = optimizerStep; activateInitializer(); }}><Icon name="database" /><span className="rail-label">Meta Context</span></button>
        <button className={`rail-button${activeSurface === "optimizer" ? " active" : ""}`} type="button" aria-current={activeSurface === "optimizer" ? "page" : undefined} aria-label="Prompt Optimizer" onClick={activateOptimizer}><Icon name="sparkle" /><span className="rail-label">Optimizer</span></button>
        <button className={`rail-button${activeSurface === "library" ? " active" : ""}`} type="button" aria-current={activeSurface === "library" ? "page" : undefined} aria-label="Library" onClick={() => { setActiveSurface("library"); vscode?.postMessage({ type: "dwi.library.open" }); }}><Icon name="library" /><span className="rail-label">Library</span></button>
      </div>
      <div className="rail-secondary">
        <button className={`rail-button${activeSurface === "activity" ? " active" : ""}`} type="button" aria-label={activityAttention ? "Activity and editor documents; new attention" : "Activity and editor documents"} aria-current={activeSurface === "activity" ? "page" : undefined} onClick={openInfo}><Icon name="info" /><span className="rail-label">Activity</span>{activityAttention && <span className="rail-badge" />}</button>
        <button className={`rail-button${activeSurface === "docs" ? " active" : ""}`} type="button" aria-label="Docs" aria-current={activeSurface === "docs" ? "page" : undefined} onClick={() => setActiveSurface("docs")}><Icon name="file" /><span className="rail-label">Docs</span></button>
        <button className={`rail-button${activeSurface === "settings" ? " active" : ""}`} type="button" aria-label="DWI settings" aria-current={activeSurface === "settings" ? "page" : undefined} onClick={openSettings}><Icon name="settings" /><span className="rail-label">Settings</span></button>
        <button className="rail-button rail-toggle" type="button" aria-label={railExpanded ? "Collapse activity bar" : "Expand activity bar"} aria-pressed={railExpanded} onClick={() => setRailExpanded((expanded) => !expanded)}><Icon name="panel" /><span className="rail-label">{railExpanded ? "Collapse" : "Expand"}</span></button>
      </div>
    </nav>

    {activeSurface === "home" && <><header className="app-header">
      <div className="app-title"><strong className="app-product-title" aria-hidden="true">Prompt Optimizer</strong><span>Home</span></div>
      <div className="header-status-group"><span className="local-indicator"><Icon name="lock" size={13} />Local</span><span ref={providerNoticeRef} className="provider-notice-anchor">
        <button className={`provider-warning-trigger provider-${homeProviderStatus.className}`} type="button" aria-label={`Provider status: ${provider.health ?? "missing"}. ${homeProviderStatus.label}.`} aria-expanded={providerNoticeOpen} aria-controls="provider-notice" onClick={() => setProviderNoticeOpen((open) => !open)}><span className="provider-status-wrap"><span className="provider-status-icon"><Icon name="bell" size={14} /></span>{homeProviderStatus.count > 0 && <span className="warning-count" aria-hidden="true">{homeProviderStatus.count}</span>}</span></button>
        {providerNoticeOpen && <section id="provider-notice" className="provider-notice-popover" role="dialog" aria-label="Provider status"><strong>{provider.health === "ready" ? "Provider connected" : "Prompt Optimizer is unavailable"}</strong><p>{provider.health === "missing" ? "Configure a provider and verify that its model responds." : provider.health === "invalid-credential" ? "The saved API key was rejected." : provider.health === "quota" ? "Requests are blocked by quota or balance." : provider.health === "rate-limit" ? "The provider is temporarily rate limited." : provider.health === "timeout" ? "The provider did not respond in time." : provider.health === "connectivity" ? "The provider could not be reached." : provider.health === "invalid-model" ? "The selected model is unavailable." : provider.health === "checking" ? "Checking the selected model…" : "The provider has not been checked."}</p>{provider.health !== "ready" && <button type="button" className="primary" onClick={() => { setProviderNoticeOpen(false); openSettings(); }}>Open provider settings</button>}</section>}
      </span></div>
    </header><section className="content"><div className="prompt-workflow home-workflow">
      {sessionMode === "loading" && <article className="work-card empty-state" aria-live="polite"><span className="section-label">Opening workspace</span><h1>Loading DWI state…</h1></article>}
      {sessionMode === "generic" && <article className="work-card empty-state"><div className="empty-icon"><Icon name="folder" /></div><span className="section-label">No project open</span><h1>Open a folder to begin</h1><p>{projectActionMessage || openFolderMessageForReason("no-workspace")}</p><button className="primary" type="button" onClick={openFolderFromExplorer}>Open Explorer</button></article>}
      {sessionMode === "recovery" && <article className="work-card empty-state"><div className="empty-icon warning"><Icon name="warning" /></div><span className="section-label">Saved state needs attention</span><h1>Review the local session</h1><p>Your project files are unchanged.</p><button className="primary" type="button" onClick={activateInitializer}>Open Project Meta Context</button></article>}
      {sessionMode === "workspace" && (stage === "consent" || stage === "brief") && <article className="work-card home-primary-card"><div className="card-heading"><span className="section-label">Project Meta Context</span><h1>{stage === "consent" ? "Initialize this project" : "Review Project Meta Context"}</h1><p>{stage === "consent" ? "Build a bounded, consent-based knowledge layer before project-aware prompt work." : "Confirm the reviewed project metadata Prompt Optimizer will use."}</p></div><button className="primary" type="button" onClick={activateInitializer}>{stage === "consent" ? "Start initialization" : "Continue review"} <span aria-hidden="true">→</span></button></article>}
      {sessionMode === "workspace" && (stage === "compose" || stage === "evaluate") && <><article className="work-card home-primary-card"><div className="card-heading"><span className="section-label">Project Meta Context · Ready</span><h1>{projectSnapshot.projectName || "Project metadata is ready"}</h1><p>The reviewed knowledge layer is ready for project-aware prompts.</p></div><div className="actions"><button className="secondary" type="button" onClick={activateInitializer}>Review Project Meta Context</button><button className="primary" type="button" onClick={activateOptimizer}>Open Prompt Optimizer <span aria-hidden="true">→</span></button></div></article><section className="home-recents" aria-labelledby="recent-prompts-title"><div className="section-head"><div><span className="section-label">Recent</span><h2 id="recent-prompts-title">Prompt activity</h2></div><button className="text-button" type="button" onClick={() => openEditorDocument({ kind: "activity-log", entries: activityEntries })}>All activity <Icon name="external" size={12} /></button></div>{optimizerRecents.length ? <ul>{optimizerRecents.map((recent) => <li key={recent.id}><button type="button" onClick={activateOptimizer}><strong>{recent.title}</strong><span>{recent.source === "local" ? "Local preview" : recent.model || "LLM rewrite"} · {recent.promptType} · {new Date(recent.updatedAt).toLocaleDateString()}</span><small>{recent.preview}</small></button></li>)}</ul> : <p className="empty-copy">Saved local previews and LLM rewrites will appear here, ordered by latest saved time.</p>}</section></>}
    </div></section></>}

    {activeSurface === "initializer" && <><header className="app-header">
      <div className="app-title"><strong>Project Meta Context</strong><span>{stage === "consent" ? "Access" : stage === "brief" ? "Review" : "Ready"}</span></div>
      <div className="header-status-group">
        <span ref={providerNoticeRef} className="provider-notice-anchor">
          {(() => {
            const status = providerNotificationState(provider.health ?? "missing");
            return (
              <button
                className={`provider-warning-trigger provider-${status.className}`}
                type="button"
                aria-label={`Provider status: ${provider.health ?? "missing"}. ${status.label}.`}
                aria-expanded={providerNoticeOpen}
                aria-controls="provider-notice"
                title="Provider status"
                onClick={() => setProviderNoticeOpen((open) => !open)}
              >
                <span className="provider-status-wrap">
                  <span className="provider-status-icon">
                    <Icon name="bell" size={14} />
                  </span>
                  {status.count > 0 && <span className="warning-count" aria-hidden="true">{status.count}</span>}
                  <span className="provider-status-label">{status.label}</span>
                </span>
              </button>
            );
          })()}
          {providerNoticeOpen && <section id="provider-notice" className="provider-notice-popover" role="dialog" aria-label="Provider status">
            <strong>{provider.health === "ready" ? "Provider connected" : "Prompt Optimizer is unavailable"}</strong>
            <p>{provider.health === "missing" ? "Configure a Gemini provider and verify that the selected model responds." : provider.health === "invalid-credential" ? "The saved API key was rejected. Replace it and check again." : provider.health === "quota" ? "Requests are blocked by quota or balance." : provider.health === "rate-limit" ? "The provider is temporarily rate limited. Retry shortly." : provider.health === "connectivity" ? "The provider could not be reached." : provider.health === "invalid-model" ? "The selected model is unavailable for this key." : provider.health === "checking" ? "Checking the selected model…" : "The provider is saved but has not been checked."}</p>
            {provider.health !== "ready" && <button type="button" className="primary" onClick={() => { setProviderNoticeOpen(false); openSettings(); }}>Open provider settings</button>}
          </section>}
        </span>
      </div>
    </header>

    <section className="content">
      <div className="prompt-workflow">
        {(sessionMode === "workspace" || sessionMode === "recovery") && (stage === "consent" || stage === "brief") && <WorkflowStrip stage={stage} resetPending={resetPending} resetting={isResetting} onRequestReset={requestReset} onCancelReset={() => setResetPending(false)} onConfirmReset={confirmReset} />}

        {sessionMode === "generic" && <>
          <article className="work-card empty-state"><div className="empty-icon"><Icon name="folder" /></div><span className="section-label">No project open</span><h1>Open a folder to begin</h1><p>DWI keeps each prompt session tied to one workspace.</p></article>
          <article className="work-card empty-state">
            <div className="project-inline-message">{projectActionMessage || openFolderMessageForReason("no-workspace")}</div>
            <button className="primary full-width" type="button" onClick={openFolderFromExplorer}>Open folder in Explorer</button>
          </article>
        </>}

        {sessionMode === "recovery" && <article className="work-card empty-state"><div className="empty-icon warning"><Icon name="warning" /></div><span className="section-label">Saved session needs attention</span><h1>Start a clean local session</h1><p>Your project files are unchanged.</p><button className="primary" type="button" onClick={requestReset}>Review reset</button></article>}

        {sessionMode !== "generic" && sessionMode !== "recovery" && stage === "consent" && <article className="work-card consent-card">
          <div className="card-heading"><div className="section-heading-with-info"><span className="section-label">Project Meta Context · Access</span><button type="button" className="mini-info" aria-label="About project metadata collection" title="About project metadata collection" aria-describedby="project-access-help" onClick={(event) => { const help = event.currentTarget.nextElementSibling as HTMLSpanElement | null; if (help) help.hidden = !help.hidden; }}><Icon name="info" size={13} /></button><span id="project-access-help" className="inline-help" hidden>DWI collects only bounded project-level metadata to build a reviewable brief for later prompts. Nothing is sent until you approve the project brief.</span></div><h1>Build Project Meta Context</h1></div>
          <ul className="scope-list"><li><Icon name="database" /><span>Manifests</span></li><li><Icon name="folder" /><span>Workspace</span></li><li><Icon name="file" /><span>Guidance</span></li></ul>
          {consentError && <div className="inline-alert" role="alert"><Icon name="warning" /><span>{consentError}</span></div>}
          <div className="primary-stack"><button className="primary full-width" onClick={approve} disabled={isApproving || sessionMode === "loading"}>{sessionMode === "loading" ? "Opening project…" : isApproving ? "Checking project…" : <>Check this project <span aria-hidden="true">→</span></>}</button><button className="text-button centered" type="button" onClick={() => openEditorDocument({ kind: "privacy" })}><Icon name="external" size={13} />Review data boundaries in editor</button></div>
        </article>}

        {sessionMode !== "generic" && sessionMode !== "recovery" && stage === "brief" && <article className="work-card brief-card">
          <ProjectContextCard snapshot={projectSnapshot} actionMessage={projectActionMessage} ready={projectReady} onRefresh={refreshProject} onReview={reviewProject} onResolveGaps={resolveProjectGaps} onOpenDiagnostics={openDiagnostics} />
          {projectReady && <section className="brief-review" aria-labelledby="brief-title">
            <div className="card-heading compact-heading"><span className="section-label">Project brief</span><h2 id="brief-title">Confirm what the prompt should know</h2></div>
            <div className="facts">{brief.facts.map((fact) => <div className="fact-tile" key={fact.id}><span>{fact.label}</span><strong title={fact.value}>{fact.value}</strong><button className="mini-info" type="button" aria-label={`Open source for ${fact.label} in editor`} onClick={() => openEditorDocument({ kind: "evidence", label: fact.label, value: fact.value, evidence: fact.evidence ?? "" })}><Icon name="external" size={13} /></button></div>)}</div>
            <label className="field">Corrections or helpful context<textarea value={brief.corrections} onChange={(event) => setBrief({ ...brief, confirmed: false, corrections: event.target.value })} maxLength={500} placeholder="Optional" /></label>
            <div className="brief-meta"><div className="questions-wrap"><button type="button" className="text-button" aria-label={`Open ${brief.unknowns.length} project questions in editor`} onClick={() => openEditorDocument({ kind: "questions", questions: brief.unknowns })}><Icon name="external" size={13} />Open questions <span className="count-badge">{brief.unknowns.length}</span></button></div></div>
            {workflowError && <div className="inline-alert" role="alert"><Icon name="warning" /><span>{workflowError}</span></div>}
            <div className="actions"><button className="primary" onClick={confirmBrief} disabled={isConfirming}>{isConfirming ? "Saving confirmation…" : <>Confirm project brief <span aria-hidden="true">→</span></>}</button></div>
          </section>}
          {!projectReady && workflowError && <div className="inline-alert" role="alert"><Icon name="warning" /><span>{workflowError}</span></div>}
        </article>}

        {sessionMode === "workspace" && (stage === "compose" || stage === "evaluate") && <article className="work-card ready-card">
          <div className="card-heading"><span className="section-label">Project Meta Context · Ready</span><h1>Project metadata is ready</h1><p>The approved brief is available to Prompt Optimizer and future project-aware tools.</p></div>
          <div className="actions"><button className="secondary" type="button" onClick={() => setActiveSurface("library")}>Open Library</button><button className="primary" type="button" onClick={activateOptimizer}>Open Prompt Optimizer <span aria-hidden="true">→</span></button></div>
        </article>}
      </div>
    </section></>}

    {activeSurface === "optimizer" && <><header className="app-header">
      <div className="app-title"><strong>Prompt Optimizer</strong><span>{optimizerStep === "resolve" ? "Resolve" : optimizerStep === "review" ? "Review" : "Input"}</span></div>
      <button className="icon-button compact" type="button" aria-label="Open provider settings" title="Provider settings" onClick={openSettings}><Icon name="settings" size={14} /></button>
    </header><section className="content"><div className="prompt-workflow">

        {(stage === "consent" || stage === "brief") && <article className="work-card empty-state"><div className="empty-icon"><Icon name="database" /></div><span className="section-label">Project context required</span><h1>Initialize this project first</h1><p>Prompt Optimizer uses the reviewed project brief as its bounded knowledge layer.</p><button className="primary" type="button" onClick={activateInitializer}>Open Project Initializer</button></article>}

        {sessionMode !== "generic" && sessionMode !== "recovery" && (stage === "compose" || stage === "evaluate") && <OptimizerStepNavigation step={optimizerStep} candidateAvailable={Boolean(candidate && optimizerReview)} onSelect={selectOptimizerStep} />}

        {sessionMode !== "generic" && sessionMode !== "recovery" && (stage === "compose" || stage === "evaluate") && optimizerStep === "input" && <article className="work-card compose-card">
          <div className="section-head"><div className="card-heading compact-heading"><span className="section-label">Step 1 · Input</span><div className="task-heading-with-info"><h1>Shape the task</h1><span className="task-context-info"><button type="button" className="mini-info" aria-label="About included Project Meta Context" aria-describedby="task-context-help"><Icon name="info" size={13} /></button><span id="task-context-help" className="task-context-tooltip" role="tooltip">Reviewed Project Meta Context and the selected template are included automatically.</span></span></div></div><button type="button" className="mini-info" aria-label="Review Project Meta Context" onClick={activateInitializer}><Icon name="database" size={13} /></button></div>
          <div className="compose-input"><PromptInputEditor
            text={promptText}
            onTextChange={changePromptText}
            assignments={assignmentOptions}
            assignmentId={assignmentId}
            onAssignmentChange={changeAssignment}
            outputSize={outputSize}
            onOutputSizeChange={changeOutputSize}
            label="Task to optimize"
            disabled={false}
          /></div>
          {provider.health !== "ready" && <div className="inline-alert provider-required" role="status"><Icon name="warning" /><span>Connect and verify an LLM provider before rewriting.</span><button type="button" className="text-button" onClick={openSettings}>Open settings</button></div>}
          {workflowError && <div className="inline-alert" role="alert"><Icon name="warning" /><span>{workflowError}</span></div>}
          <div className="actions optimizer-actions">{isCompiling ? <button className="secondary" type="button" onClick={cancelOptimizer}>Cancel resolve</button> : <><button className="secondary" type="button" disabled={!promptText.trim() || !assignmentOptions.length} onClick={() => runOptimizer("compile")}>Continue to resolve</button><button className="primary" disabled={provider.health !== "ready" || !promptText.trim() || !assignmentOptions.length} onClick={() => runOptimizer("enhance")} title={provider.health !== "ready" ? "Connect and verify a provider before rewriting." : !promptText.trim() ? "Describe the task before rewriting it." : undefined}>Rewrite with LLM <span aria-hidden="true">→</span></button></>}</div>
        </article>}

        {sessionMode !== "generic" && sessionMode !== "recovery" && optimizerStep !== "input" && !candidate && <article className="work-card context-recovery-card" role="status">
          <div className="card-heading"><span className="section-label">Project Meta Context updated</span><h1>Resolve this step with the reviewed metadata</h1><p>Your task draft and workflow position were retained. The old generated candidate was discarded because it was bound to an earlier project review.</p></div>
          <div className="actions"><button className="secondary" type="button" onClick={() => selectOptimizerStep("input")}><Icon name="back" size={13} />Back to input</button><button className="primary" type="button" disabled={!promptText.trim() || isCompiling} onClick={() => runOptimizer("compile")}>{isCompiling ? "Resolving…" : "Resolve again"}</button></div>
        </article>}

        {sessionMode !== "generic" && sessionMode !== "recovery" && optimizerStep === "resolve" && candidate && <article className="work-card resolve-card">
          <div className="section-head"><div className="card-heading compact-heading"><span className="section-label">Step 2 · Resolve</span><h1 data-optimizer-resolve-heading tabIndex={-1}>Confirm the local interpretation</h1><p>The task, reviewed project context, selected template, and deterministic candidate are current.</p></div><div className="review-context-actions"><span className="review-source" aria-label="Result source: Local deterministic"><Icon name="lock" size={12} />Local</span><button type="button" className="mini-info" aria-label="Review Project Meta Context" onClick={() => { contextReviewReturnStep.current = "resolve"; activateInitializer(); }}><Icon name="database" size={13} /></button></div></div>
          <div className="optimizer-resolve-facts"><div><span>Project knowledge</span><strong>Approved snapshot</strong></div><div><span>Candidate</span><strong>Local deterministic</strong></div><div><span>Provider</span><strong>Not required</strong></div></div>
          {optimizerSourcePlan && <section className="source-plan" aria-labelledby="source-plan-heading">
            <div className="source-plan-heading"><div><span className="section-label">Source plan</span><h2 id="source-plan-heading">What will shape this prompt</h2></div><span>{optimizerSourcePlan.decisions.filter(({ disposition }) => disposition !== "exclude").length} active</span></div>
            <ul className="source-decision-list">{optimizerSourcePlan.decisions.map((decision) => <li key={decision.id} className={`source-decision source-${decision.disposition}`}><div><strong>{decision.label}</strong><span>{decision.authority} · {decision.freshness} · {decision.relevance}</span></div><span className="source-disposition">{decision.disposition}</span><p>{decision.reason}</p><small>{decision.provenance.join(" · ")}</small></li>)}</ul>
            {optimizerSourcePlan.conflicts.length > 0 && <div className="source-plan-alert" role="alert"><strong>Conflicts require review</strong>{optimizerSourcePlan.conflicts.map((conflict) => <p key={conflict.id}>{conflict.label}: {conflict.reason}</p>)}</div>}
            {optimizerSourcePlan.questions.length > 0 && <div className="source-plan-questions"><strong>Material questions</strong><ol>{optimizerSourcePlan.questions.map((question) => <li key={question.id}>{question.prompt}<small>{question.reason}</small></li>)}</ol></div>}
            {optimizerSourcePlan.assumptions.length > 0 && <details><summary>Assumptions ({optimizerSourcePlan.assumptions.length})</summary><ul>{optimizerSourcePlan.assumptions.map((assumption) => <li key={assumption.id}>{assumption.text}</li>)}</ul></details>}
          </section>}
          {workflowError && <div className="inline-alert" role="alert"><Icon name="warning" /><span>{workflowError}</span></div>}
          <div className="actions"><button className="secondary" type="button" onClick={() => selectOptimizerStep("input")}><Icon name="back" size={13} />Back to input</button><button className="primary" type="button" onClick={() => selectOptimizerStep("review")}>Continue to review <span aria-hidden="true">→</span></button></div>
        </article>}

        {sessionMode !== "generic" && sessionMode !== "recovery" && optimizerStep === "review" && candidate && <article className="work-card review-card">
          <div className="section-head review-heading"><div className="card-heading compact-heading review-heading-copy"><span className="section-label">Step 3 · {optimizerReview?.source === "local" ? "Local preview" : "LLM rewrite"}</span><h1 ref={optimizerReviewHeadingRef} tabIndex={-1} title={optimizerReview?.source === "provider" ? optimizerReview.title || optimizedResult?.title || "Review the optimized prompt" : "Review the local preview"}>{optimizerReview?.source === "provider" ? optimizerReview.title || optimizedResult?.title || "Review the optimized prompt" : "Review the local preview"}</h1>{optimizerReview?.source === "provider" && (optimizerReview.summary || optimizedResult?.summary) && <p title={optimizerReview.summary || optimizedResult?.summary}>{optimizerReview.summary || optimizedResult?.summary}</p>}</div><div className="review-context-actions"><span className="review-source" aria-label={optimizerReview?.source === "local" ? "Result source: Local preview" : `Result source: ${optimizerReview?.model || provider.model || "verified provider"}`}><Icon name={optimizerReview?.source === "local" ? "lock" : "sparkle"} size={12} />{optimizerReview?.source === "local" ? "Local" : optimizerReview?.model || provider.model || "Provider"}</span><button type="button" className="mini-info" aria-label="Review Project Meta Context" onClick={() => { contextReviewReturnStep.current = "review"; activateInitializer(); }}><Icon name="database" size={13} /></button></div></div>
          <div className="prompt-output" role="region" aria-label="Generated prompt"><pre tabIndex={0} aria-label="Generated prompt text">{candidate.text}</pre></div>
          {tokenProjection && <details className="review-source-plan token-projection" open><summary>Estimated engineering token cost · {tokenProjection.estimationStatus.replace("_", " ")}</summary><p className="projection-disclaimer">Projection only—not a billing record or deterministic token count.</p><div className="projection-totals"><div><span>Without refinement</span><strong>{tokenProjection.baselineProjection.totalTokens.toLocaleString()}</strong></div><div><span>With refined prompt</span><strong>{tokenProjection.optimizedProjection.totalTokens.toLocaleString()}</strong></div><div><span>Projected change</span><strong>{projectedTokenDeltaLabel(tokenProjection.projectedDelta)}</strong></div></div><dl className="projection-breakdown">{(["planning", "contextIngestion", "promptInput", "toolProviderCalls", "retries", "finalOutput"] as const).map((part) => <div key={part}><dt>{part.replace(/([A-Z])/g, " $1")}</dt><dd>{tokenProjection.baselineProjection.breakdown[part].toLocaleString()} → {tokenProjection.optimizedProjection.breakdown[part].toLocaleString()}</dd></div>)}</dl><p>Confidence: {tokenProjection.confidence} · Range: {tokenProjection.optimizedProjection.totalTokens.toLocaleString()} ({tokenProjection.uncertainty.optimizedMin.toLocaleString()}–{tokenProjection.uncertainty.optimizedMax.toLocaleString()})</p><p>Cost: {tokenProjection.cost.status === "cost_unavailable" ? "unavailable—no validated provider price supplied" : `$${tokenProjection.cost.optimized.toFixed(4)} estimated`}</p><p>Routing: requested {tokenProjection.routing.requestedProvider}/{tokenProjection.routing.requestedModel}{tokenProjection.routing.actualProvider || tokenProjection.routing.actualModel ? `; actual ${tokenProjection.routing.actualProvider ?? "provider unknown"}/${tokenProjection.routing.actualModel ?? "model unknown"}` : "; actual route not reported"}{tokenProjection.routing.substitutionReason ? `; ${tokenProjection.routing.substitutionReason}` : ""}.</p>{tokenProjection.telemetry && <p>{tokenProjection.telemetry.scope === "task_execution" ? "Reconciled task-execution telemetry" : "Measured optimizer-call telemetry"}: {tokenProjection.telemetry.totalTokens.toLocaleString()} tokens{tokenProjection.telemetry.scope === "optimizer_call" ? "; this does not measure downstream task execution" : ""}.</p>}<details><summary>Assumptions and metadata</summary><ul>{tokenProjection.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul><p>Metadata used: {tokenProjection.metadataUsed.length ? tokenProjection.metadataUsed.join(", ") : "none declared"}</p><p>{tokenProjection.optimizationRationale}</p><small>Estimation ID: {tokenProjection.estimationId}</small></details></details>}
          {optimizerSourcePlan && <details className="review-source-plan"><summary>Source provenance · {optimizerSourcePlan.decisions.filter(({ disposition }) => disposition !== "exclude").length} active sources</summary><ul>{optimizerSourcePlan.decisions.filter(({ disposition }) => disposition !== "exclude").map((decision) => <li key={decision.id}><strong>{decision.label}</strong><span>{decision.disposition} · {decision.provenance.join(" · ")}</span></li>)}</ul></details>}
          {optimizerTrace && <details className="review-source-plan semantic-evidence"><summary>{optimizerTrace.outcome === "candidate" ? "Validated semantic execution" : "Local fallback retained"} · {optimizerTrace.calls.length} call</summary><ul>{optimizerTrace.calls.map((call) => <li key={`${call.ordinal}-${call.purpose}`}><strong>{call.purpose} · {call.result}</strong><span>{call.provider}/{call.model} · {call.latencyMs ?? 0} ms{call.inputTokens === undefined ? "" : ` · ${call.inputTokens} input tokens`}{call.outputTokens === undefined ? "" : ` · ${call.outputTokens} output tokens`}{call.failureCode ? ` · ${call.failureCode}` : ""}</span></li>)}</ul></details>}
          {isCompiling && <div className="inline-alert optimizer-progress" role="status"><Icon name="refresh" /><span>Rewriting with the verified provider…</span></div>}
          {workflowError && <div className="inline-alert" role="alert"><Icon name="warning" /><span>{workflowError}</span></div>}
          <div className="actions prompt-actions"><button className="secondary" type="button" onClick={() => selectOptimizerStep("resolve")} disabled={isCompiling}><Icon name="back" size={13} />Back to resolve</button><button className="primary" type="button" onClick={() => void copyCandidate()} disabled={isCompiling}>{copyNotice === "Prompt copied." ? <><Icon name="check" size={14} />Copied</> : "Copy prompt"}</button></div>
          <div className="review-utilities"><button type="button" onClick={saveOptimizerRecent} disabled={isCompiling}>{optimizerSaveNotice || "Save to recents"}</button><button type="button" onClick={openPromptReview}>Open in editor <Icon name="external" size={12} /></button><button type="button" onClick={() => openEditorDocument({ kind: "estimate", estimate: candidate.estimate })}>{candidate.estimate.estimatedAvoidedDuplication} fewer tokens <Icon name="external" size={12} /></button></div>
          {provider.health !== "ready" && <div className="inline-alert provider-required" role="status"><Icon name="warning" /><span>The result is available, but another rewrite needs a verified provider.</span><button type="button" className="text-button" onClick={openSettings}>Open settings</button></div>}
          <div className="actions regenerate-actions">{isCompiling ? <button className="secondary" type="button" onClick={cancelOptimizer}>Cancel rewrite</button> : <button className="secondary" type="button" disabled={provider.health !== "ready"} onClick={() => runOptimizer("enhance")}>{optimizerReview?.source === "local" ? "Rewrite with LLM" : "Rewrite again"}</button>}</div>
          <section className="feedback-disclosure">
            <button ref={feedbackTriggerRef} className="feedback-trigger" type="button" aria-expanded={feedbackOpen} aria-controls="feedback-panel" onClick={() => setFeedbackOpen((open) => !open)}><span>{draft && <Icon name="check" size={14} />}{draft ? "Feedback saved" : "Add feedback"}</span><span aria-hidden="true">{feedbackOpen ? "−" : "+"}</span></button>
            {feedbackOpen && <div id="feedback-panel" className="feedback-panel" role="region" aria-label={draft ? "Saved feedback" : "Prompt feedback"} onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              setFeedbackOpen(false);
              feedbackTriggerRef.current?.focus();
            }}>
              <label className="field compact-field">Private session note<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="Optional" /></label>
              <fieldset className="feedback-row"><legend>Was this useful?</legend><div>{(["helpful", "mixed", "not-helpful"] as const).map((rating) => <button type="button" key={rating} aria-pressed={feedbackRating === rating} onClick={() => setFeedbackRating(rating)}>{rating === "not-helpful" ? "No" : rating === "helpful" ? "Yes" : "Partly"}</button>)}</div></fieldset>
              <button className="secondary full-width save-evaluation" type="button" disabled={!feedbackRating || isSavingEvaluation} onClick={() => feedbackRating && feedback(feedbackRating)}>{isSavingEvaluation ? "Saving evaluation…" : draft ? "Update evaluation" : "Save evaluation"}</button>
              {draft && <div className="completion-row"><span><Icon name="check" size={14} />Evaluation saved</span><div><button type="button" onClick={() => void copyEvaluation()}>Copy note</button>{feedbackRating && <button type="button" onClick={() => candidate && vscode?.postMessage({ type: "dwi.evaluation.export", brief, feedback: { rating: feedbackRating, tags: ["feature-delivery"], note, selectedModuleIds: candidate.selectedModuleIds, estimate: candidate.estimate, elapsedMs: 0 } })}>Export…</button>}<button type="button" aria-label="Delete local evaluation note" onClick={() => { setFeedbackNotice(""); if (vscode) vscode.postMessage({ type: "dwi.feedback.delete" }); else { feedbackFocusPending.current = true; setDraft(""); setFeedbackRating(undefined); setFeedbackOpen(false); setFeedbackNotice("Evaluation deleted."); } }}>Delete</button></div></div>}
            </div>}
          </section>
          <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{feedbackNotice}</span>
          {copyNotice && <span className="sr-only" role="status">{copyNotice}</span>}
        </article>}
      </div>
    </section></>}

    <div className="library-slot" hidden={activeSurface !== "library"}>
      <LibraryWorkspace
        state={libraryState}
        detail={libraryDetail}
        onOpen={() => vscode?.postMessage({ type: "dwi.library.open" })}
        onReload={() => vscode?.postMessage({ type: "dwi.library.open" })}
        onRequestDetail={requestLibraryDetail}
        onSave={saveLibraryTemplate}
        onDelete={deleteLibraryTemplate}
        onFeedback={submitLibraryFeedback}
        onCloneFile={({ operationId }) => cloneFromFile(operationId)}
        onClonePaste={({ operationId, text }) => cloneFromPaste(operationId, text)}
        onOpenDocument={openEditorDocument}
      />
    </div>

    {activeSurface === "activity" && <ActivitySurface entries={activityEntries} snapshot={projectSnapshot} onBack={returnToWorkflow} onOpenLog={() => openEditorDocument({ kind: "activity-log", entries: activityEntries })} onOpenDiagnostics={openDiagnostics} onOpenPrivacy={() => openEditorDocument({ kind: "privacy" })} onOpenActivityDetail={(entry) => openEditorDocument({ kind: "activity-detail", entry })} />}

    {activeSurface === "settings" && <section className="utility-surface settings-surface" aria-label="Settings">
      <SurfaceHeader title="Settings" onBack={returnToWorkflow} />
      <div className="utility-body settings-view">
      <section className="settings-section"><div className="settings-heading"><strong>LLM provider</strong><span className={`provider-state${provider.health === "ready" ? " configured" : " required"}`} aria-label={`Provider status: ${provider.health ?? "missing"}`}>{provider.health === "ready" ? "Connected" : provider.health === "checking" ? "Checking…" : provider.health === "unverified" ? "Needs check" : provider.health === "invalid-credential" ? "Credential rejected" : provider.health === "quota" ? "Quota issue" : provider.health === "timeout" ? "Timed out" : provider.health === "connectivity" ? "Unreachable" : provider.health === "invalid-model" ? "Model unavailable" : "Required"}</span></div>
        {provider.health !== "ready" && <div className={`settings-required-note provider-note-${provider.health ?? "missing"}`} role={provider.health === "invalid-credential" || provider.health === "quota" || provider.health === "rate-limit" || provider.health === "connectivity" || provider.health === "timeout" || provider.health === "invalid-model" ? "alert" : "status"}><Icon name="bell" size={14} /><span>{provider.errorMessage ? <>{provider.errorMessage}</> : <><strong>{provider.health === "missing" ? "Provider not configured." : provider.health === "unverified" ? "Connection not checked." : provider.health === "checking" ? "Checking provider connection…" : provider.health === "invalid-credential" ? "Credential rejected." : provider.health === "quota" ? "Quota or balance issue." : provider.health === "rate-limit" ? "Temporarily rate limited." : provider.health === "timeout" ? "Provider timed out." : provider.health === "connectivity" ? "Provider unreachable." : provider.health === "invalid-model" ? "Model unavailable." : "Provider not ready."}</strong> Prompt Optimizer stays disabled until a model responds successfully.</>}</span></div>}
        <label className="field">Provider<select required value={provider.mode === "none" ? "" : provider.mode} onChange={(event) => { const mode = event.target.value as ProviderSettings["mode"]; setProvider({ ...provider, mode, configured: false, health: "unverified" }); if (mode === "gemini") setProviderModelDraft("gemini-3.7-flash"); }}><option value="" disabled>Select provider</option><option value="gemini">Gemini</option><option value="openai-compatible">OpenAI-compatible</option></select></label>
        {provider.mode === "gemini" && <label className="field">Model<GeminiModelPicker value={providerModelDraft} onChange={setProviderModelDraft} disabled={provider.health === "checking"} /></label>}
        {provider.mode === "openai-compatible" && <label className="field">Model<input value={providerModelDraft} name="model" onChange={(event) => setProviderModelDraft(event.target.value)} /></label>}
        {provider.mode === "openai-compatible" && <label className="field">Base URL<input defaultValue={provider.baseUrl} name="baseUrl" placeholder="https://…" /></label>}
        {provider.mode !== "none" && <label className="field">API key<input type="password" name="apiKey" autoComplete="off" placeholder="Stored in VS Code" /></label>}
        <button className="primary" disabled={provider.mode === "none" || provider.health === "checking" || !providerModelDraft.trim()} onClick={(event) => {
          const form = event.currentTarget.closest("section") as HTMLElement;
          const model = providerModelDraft;
          const baseUrl = (form.querySelector('[name="baseUrl"]') as HTMLInputElement | null)?.value;
          const key = (form.querySelector('[name="apiKey"]') as HTMLInputElement | null)?.value;
          if (provider.mode === "none") {
            setProvider({ mode: "none", configured: false, health: "missing" });
            setSettingsError("");
            vscode?.postMessage({ type: "dwi.provider.clear" });
            return;
          }
          vscode?.postMessage({ type: "dwi.provider.save", settings: { mode: provider.mode, model, baseUrl, key } });
          const apiKeyInput = form.querySelector('[name="apiKey"]') as HTMLInputElement | null;
          if (apiKeyInput) apiKeyInput.value = "";
        }}>{provider.health === "checking" ? "Checking provider…" : "Check & save provider"}</button>
        {provider.configured && <button className="secondary full-width" type="button" onClick={() => {
          setProvider({ mode: "none", configured: false, health: "missing" });
          setSettingsError("");
          vscode?.postMessage({ type: "dwi.provider.clear" });
        }}>Remove provider configuration</button>}
        {settingsError && <div className="inline-alert" role="alert"><Icon name="warning" /><span>{settingsError}</span></div>}
      </section>
      {optimizerResetEligible && <section className="settings-section danger-zone"><div><strong>Prompt Optimizer session</strong><span>Clear this project's prompt draft, generated candidates, saved prompt recents, and optimizer view. The approved project brief, project declaration, consent, and provider settings stay intact.</span></div>{optimizerResetPending ? <div ref={optimizerResetDialogRef} className="reset-inline-confirm" role="alertdialog" aria-labelledby="optimizer-reset-title" aria-describedby="optimizer-reset-description" onKeyDown={(event) => { if (event.key === "Escape" && !isOptimizerResetting) { event.preventDefault(); setOptimizerResetPending(false); } }}><strong id="optimizer-reset-title">Reset Prompt Optimizer?</strong><span id="optimizer-reset-description">Only Prompt Optimizer progress for this project will be cleared.</span><div className="actions"><button type="button" className="secondary" disabled={isOptimizerResetting} onClick={() => setOptimizerResetPending(false)}>Cancel</button><button type="button" className="danger-outline" disabled={isOptimizerResetting} onClick={confirmOptimizerReset}>{isOptimizerResetting ? "Resetting…" : "Reset prompt progress"}</button></div></div> : <button ref={optimizerResetTriggerRef} type="button" className="danger-outline" onClick={() => setOptimizerResetPending(true)}>Reset Prompt Optimizer</button>}</section>}
      </div>
    </section>}

    {activeSurface === "docs" && <DocsSurface onBack={returnToWorkflow} snapshot={projectSnapshot} provider={provider} onOpenPrivacy={() => openEditorDocument({ kind: "privacy" })} />}

    {roots.length > 0 && <FloatingPanel title="Choose a project" label="Workspace" compact dismissible={false} onClose={() => undefined}>{roots.map((root) => <button className="root-choice" type="button" key={root.uri} onClick={() => { resetProjectWorkflowState(); vscode?.postMessage({ type: "dwi.workspace.select-root", uri: root.uri }); setRoots([]); }}><Icon name="folder" /><span>{root.label}</span></button>)}</FloatingPanel>}
    </main>
  </div>;
}

type DwiRootElement = HTMLElement & { __dwiReactRoot?: Root };
const rootElement = document.getElementById("root") as DwiRootElement | null;
if (rootElement) {
  rootElement.__dwiReactRoot ??= createRoot(rootElement);
  rootElement.__dwiReactRoot.render(<App />);
}
