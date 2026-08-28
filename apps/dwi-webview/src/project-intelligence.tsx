import React from "react";

export const PROJECT_SECTION_IDS = [
  "identity",
  "toolchain",
  "commands",
  "components",
  "boundaries",
  "documentation",
  "gaps",
] as const;

export type ProjectSectionId = (typeof PROJECT_SECTION_IDS)[number];
export type ProjectSnapshotStatus =
  | "scanning"
  | "current"
  | "stale"
  | "partial"
  | "conflict"
  | "unsupported"
  | "error";

export interface ProjectEvidenceView {
  id: string;
  kind?: string;
  source: string;
  detail?: string;
  digest?: string;
  parser?: string;
  collectedAt?: string;
}

export interface ProjectClaimView {
  id: string;
  label: string;
  value: string;
  confidence?: "high" | "medium" | "low";
  authority?: string;
  state?: string;
  evidence: ProjectEvidenceView[];
}

export interface ProjectSectionView {
  id: ProjectSectionId;
  title: string;
  description: string;
  claims: ProjectClaimView[];
}

export interface ProjectCoverageView {
  percent: number;
  complete: number;
  total: number;
  label: string;
}

export interface ProjectSnapshotViewModel {
  status: ProjectSnapshotStatus;
  projectName: string;
  description?: string;
  owner?: string;
  componentType?: string;
  lifecycle?: string;
  generatedAt?: string;
  revision?: string;
  coverage: ProjectCoverageView;
  conflictCount: number;
  pendingChanges: number;
  reviewed?: boolean;
  sections: ProjectSectionView[];
  message?: string;
}

type UnknownRecord = Record<string, unknown>;

const SECTION_COPY: Record<ProjectSectionId, { title: string; description: string }> = {
  identity: { title: "Identity", description: "Purpose, ownership, and lifecycle" },
  toolchain: { title: "Toolchain", description: "Languages, ecosystems, and runtimes" },
  commands: { title: "Commands", description: "Declared build and verification workflows" },
  components: { title: "Components", description: "Modules, services, and entrypoints" },
  boundaries: { title: "Boundaries", description: "APIs, dependencies, and repository roots" },
  documentation: { title: "Documentation", description: "Trusted project guidance" },
  gaps: { title: "Gaps", description: "Unknown, unsupported, or conflicting facts" },
};

const STATUS_COPY: Record<ProjectSnapshotStatus, { label: string; message: string }> = {
  scanning: { label: "Scanning", message: "Reading approved metadata and bounded evidence…" },
  current: { label: "Current", message: "Project intelligence is current and ready for downstream use." },
  stale: { label: "Stale", message: "The repository changed after this snapshot. Refresh before using it." },
  partial: { label: "Partial", message: "Some project dimensions remain unresolved. Review the gaps before use." },
  conflict: { label: "Conflict", message: "Two or more claims disagree. Review changes before using this snapshot." },
  unsupported: { label: "Unsupported", message: "No supported ecosystem metadata was found for this project yet." },
  error: { label: "Error", message: "Project intelligence could not be loaded. Retry the scan or inspect the error." },
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(", ");
  if (isRecord(value)) {
    const reason = asString(value.reason);
    if (reason) {
      const path = asString(value.path);
      return path ? `${reason} · ${path}` : reason;
    }
    if (Array.isArray(value.argv)) {
      const cwd = asString(value.cwd);
      return `${value.argv.map(displayValue).join(" ")}${cwd && cwd !== "." ? ` · in ${cwd}` : ""}`;
    }
    const preferred = [value.name, value.id, value.command, value.relativePath, value.path]
      .map(asString)
      .find(Boolean);
    if (preferred) {
      const version = asString(value.version) ?? asString(value.versionConstraint);
      return version ? `${preferred} ${version}` : preferred;
    }
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${displayValue(item)}`)
      .join(" · ");
  }
  return "Unknown";
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function pathSection(path: string): ProjectSectionId {
  if (/unknown|gap/i.test(path)) return "gaps";
  if (/identity|owner|lifecycle|projectName|description|domain|system|tags/i.test(path)) return "identity";
  if (/workflow|command|script|test|build|lint|format|typecheck/i.test(path)) return "commands";
  if (/boundar|api|depend|root|resource/i.test(path)) return "boundaries";
  if (/document|readme|guide/i.test(path)) return "documentation";
  if (/component|module|entrypoint/i.test(path)) return "components";
  return "toolchain";
}

function claimLabel(path: string): string {
  const finalSegment = path.split("/").filter(Boolean).at(-1) ?? "Fact";
  return /^\d+$/.test(finalSegment) ? "Detected item" : titleCase(finalSegment);
}

function normalizedStatus(value: unknown): ProjectSnapshotStatus | undefined {
  return typeof value === "string" && ["scanning", "current", "stale", "partial", "conflict", "unsupported", "error"].includes(value)
    ? (value as ProjectSnapshotStatus)
    : undefined;
}

function normalizeEvidence(value: unknown): ProjectEvidenceView | undefined {
  const evidence = asRecord(value);
  const id = asString(evidence.id);
  if (!id) return undefined;
  // Evidence content can be as large as the bounded per-file allowance. Keep the
  // overview useful without copying complete manifests into the DOM.
  const digest = asString(evidence.sha256);
  const detail = asString(evidence.detail) ?? asString(evidence.selector);
  return {
    id,
    kind: asString(evidence.kind),
    source: asString(evidence.source) ?? asString(evidence.relativePath) ?? "Local project evidence",
    detail,
    digest,
    parser: asString(evidence.parser),
    collectedAt: asString(evidence.collectedAt),
  };
}

function normalizeProjectedSnapshot(input: UnknownRecord): ProjectSnapshotViewModel | undefined {
  if (!asString(input.projectName) || !Array.isArray(input.sections)) return undefined;
  const sections = input.sections.flatMap((rawSection): ProjectSectionView[] => {
    const section = asRecord(rawSection);
    const id = asString(section.id) as ProjectSectionId | undefined;
    if (!id || !PROJECT_SECTION_IDS.includes(id)) return [];
    return [{
      id,
      title: asString(section.title) ?? SECTION_COPY[id].title,
      description: asString(section.description) ?? SECTION_COPY[id].description,
      claims: asArray(section.claims).flatMap((rawClaim): ProjectClaimView[] => {
        const claim = asRecord(rawClaim);
        const claimId = asString(claim.id);
        if (!claimId) return [];
        return [{
          id: claimId,
          label: asString(claim.label) ?? "Fact",
          value: displayValue(claim.value),
          confidence: asString(claim.confidence) as ProjectClaimView["confidence"],
          authority: asString(claim.authority),
          state: asString(claim.state),
          evidence: asArray(claim.evidence).flatMap((item) => {
            const normalized = normalizeEvidence(item);
            return normalized ? [normalized] : [];
          }),
        }];
      }),
    }];
  });
  const coverage = asRecord(input.coverage);
  return {
    status: normalizedStatus(input.status) ?? "partial",
    projectName: asString(input.projectName)!,
    description: asString(input.description),
    owner: asString(input.owner),
    componentType: asString(input.componentType),
    lifecycle: asString(input.lifecycle),
    generatedAt: asString(input.generatedAt),
    revision: asString(input.revision),
    coverage: {
      percent: Number.isFinite(coverage.percent) ? Math.max(0, Math.min(100, Number(coverage.percent))) : 0,
      complete: Number(coverage.complete) || 0,
      total: Number(coverage.total) || 0,
      label: asString(coverage.label) ?? "Coverage unavailable",
    },
    conflictCount: Number(input.conflictCount) || 0,
    pendingChanges: Number(input.pendingChanges) || 0,
    reviewed: typeof input.reviewed === "boolean" ? input.reviewed : undefined,
    sections: PROJECT_SECTION_IDS.map((id) => sections.find((section) => section.id === id) ?? { id, ...SECTION_COPY[id], claims: [] }),
    message: asString(input.message),
  };
}

/**
 * Converts either the compact host projection or a canonical dwi.dev/v1 Project
 * snapshot into the stable view model. Malformed optional fields degrade to gaps;
 * they never become high-confidence claims.
 */
export function normalizeProjectSnapshot(input: unknown): ProjectSnapshotViewModel {
  const raw = asRecord(input);
  const projected = normalizeProjectedSnapshot(raw);
  if (projected) return projected;

  const metadata = asRecord(raw.metadata);
  const revision = asRecord(metadata.revision);
  const review = asRecord(metadata.review);
  const resolution = asRecord(raw.resolution);
  const effectiveSnapshot = asRecord(resolution.effectiveSnapshot);
  const spec = Object.keys(asRecord(effectiveSnapshot.spec)).length ? asRecord(effectiveSnapshot.spec) : asRecord(raw.spec);
  const identity = asRecord(spec.identity);
  const observed = Object.keys(asRecord(effectiveSnapshot.observed)).length ? asRecord(effectiveSnapshot.observed) : asRecord(raw.observed);
  const coverageRecord = asRecord(resolution.coverage);
  const canonicalClaims = asArray(raw.claims).map(asRecord);
  const evidenceById = new Map(
    asArray(raw.evidence)
      .flatMap((item) => {
        const normalized = normalizeEvidence(item);
        return normalized ? [normalized] : [];
      })
      .map((evidence) => [evidence.id, evidence]),
  );

  const claimsBySection = new Map<ProjectSectionId, ProjectClaimView[]>(PROJECT_SECTION_IDS.map((id) => [id, []]));
  for (const claim of canonicalClaims) {
    const id = asString(claim.id);
    const path = asString(claim.path);
    if (!id || !path) continue;
    claimsBySection.get(pathSection(path))!.push({
      id,
      label: claimLabel(path),
      value: displayValue(claim.value),
      confidence: asString(claim.confidence) as ProjectClaimView["confidence"],
      authority: asString(claim.authority),
      state: asString(claim.state),
      evidence: asArray(claim.evidenceRefs).flatMap((ref) => {
        const evidence = evidenceById.get(String(ref));
        return evidence ? [evidence] : [];
      }),
    });
  }

  const addSynthetic = (section: ProjectSectionId, id: string, label: string, value: unknown, authority = "declared") => {
    if (value === undefined || value === null || (Array.isArray(value) && !value.length)) return;
    const sectionClaims = claimsBySection.get(section)!;
    if (sectionClaims.some((claim) => claim.value === displayValue(value))) return;
    sectionClaims.push({ id, label, value: displayValue(value), authority, state: "accepted", evidence: [] });
  };

  addSynthetic("identity", "identity-description", "Purpose", identity.description);
  addSynthetic("identity", "identity-owner", "Owner", identity.owners);
  addSynthetic("identity", "identity-component-type", "Component type", identity.componentType);
  addSynthetic("identity", "identity-lifecycle", "Lifecycle", identity.lifecycle);
  addSynthetic("identity", "identity-system", "System", identity.system);
  addSynthetic("identity", "identity-domain", "Domain", identity.domain);

  for (const [key, section] of Object.entries({
    languages: "toolchain",
    ecosystems: "toolchain",
    frameworks: "toolchain",
    toolchains: "toolchain",
    components: "components",
    entrypoints: "components",
    documentation: "documentation",
    ciSystems: "commands",
    dependencyArtifacts: "boundaries",
    securitySignals: "gaps",
  } satisfies Record<string, ProjectSectionId>)) {
    asArray(observed[key]).forEach((value, index) => addSynthetic(section, `${key}-${index}`, titleCase(key), value, "deterministic"));
  }
  asArray(spec.workflows).forEach((value, index) => addSynthetic("commands", `workflow-${index}`, "Workflow", value));
  const boundaries = asRecord(spec.boundaries);
  Object.entries(boundaries).forEach(([key, value]) => addSynthetic("boundaries", `boundary-${key}`, titleCase(key), value));
  asArray(resolution.unknowns).forEach((value, index) => addSynthetic("gaps", `unknown-${index}`, "Unknown", value, "unresolved"));
  asArray(resolution.conflicts).forEach((value, index) => addSynthetic("gaps", `conflict-${index}`, "Conflict", value, "resolver"));

  const coverageValues = Object.values(coverageRecord).filter((value) => typeof value === "string") as string[];
  const coverageScore = coverageValues.reduce((sum, value) => sum + (value === "complete" ? 1 : value === "partial" ? 0.5 : 0), 0);
  const conflictCount = asArray(resolution.conflicts).length;
  const hasObservedFacts = Object.values(observed).some((value) => Array.isArray(value) && value.length > 0);
  const derivedStatus: ProjectSnapshotStatus = conflictCount
    ? "conflict"
    : coverageValues.length && coverageValues.every((value) => value === "unsupported")
      ? "unsupported"
      : coverageValues.some((value) => value === "partial" || value === "incomplete")
        ? "partial"
        : !hasObservedFacts && canonicalClaims.length === 0
          ? "unsupported"
          : "current";
  const proposals = asArray(raw.proposals).map(asRecord);
  proposals.forEach((proposal, index) => {
    const path = asString(proposal.path) ?? "/spec";
    const evidence = asArray(proposal.evidenceRefs).flatMap((ref) => {
      const item = evidenceById.get(String(ref));
      return item ? [item] : [];
    });
    claimsBySection.get(pathSection(path))!.push({
      id: asString(proposal.id) ?? `proposal-${index}`,
      label: `Proposed ${claimLabel(path)}`,
      value: displayValue(proposal.value),
      authority: [asString(proposal.producer), asString(proposal.risk) ? `${asString(proposal.risk)} risk` : undefined].filter(Boolean).join(" · ") || "proposal",
      state: asString(proposal.state) ?? "pending",
      evidence,
    });
  });
  const pendingChanges = proposals.filter((proposal) => !["accepted", "rejected", "auto-accepted"].includes(asString(proposal.state) ?? "")).length;
  const reviewed = review.state === "approved";

  return {
    status: normalizedStatus(raw.status) ?? normalizedStatus(resolution.status) ?? derivedStatus,
    projectName: asString(metadata.name) ?? "Unnamed project",
    description: asString(identity.description),
    owner: asArray(identity.owners).map(displayValue).join(", ") || undefined,
    componentType: asString(identity.componentType),
    lifecycle: asString(identity.lifecycle),
    generatedAt: asString(revision.generatedAt),
    revision: asString(revision.commit),
    coverage: {
      percent: coverageValues.length ? Math.round((coverageScore / coverageValues.length) * 100) : 0,
      complete: coverageValues.filter((value) => value === "complete").length,
      total: coverageValues.length,
      label: coverageValues.length ? `${coverageValues.filter((value) => value === "complete").length} of ${coverageValues.length} dimensions complete` : "Coverage unavailable",
    },
    conflictCount,
    pendingChanges,
    reviewed,
    sections: PROJECT_SECTION_IDS.map((id) => ({ id, ...SECTION_COPY[id], claims: claimsBySection.get(id) ?? [] })),
    message: asString(raw.message) ?? (derivedStatus === "current" && !reviewed ? "Project facts are resolved. Record human review before using them as AI context." : undefined),
  };
}

function relativeTime(value?: string): string {
  if (!value) return "Not scanned";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const elapsed = Date.now() - timestamp;
  if (Math.abs(elapsed) < 60_000) return "Just now";
  const minutes = Math.round(elapsed / 60_000);
  if (Math.abs(minutes) < 60) return `${Math.abs(minutes)}m ${minutes >= 0 ? "ago" : "from now"}`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 48) return `${Math.abs(hours)}h ${hours >= 0 ? "ago" : "from now"}`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}

function EvidenceDetails({ claim }: { claim: ProjectClaimView }) {
  if (!claim.evidence.length) return <span className="claim-no-evidence">No linked evidence</span>;
  return <details className="claim-evidence">
    <summary>{claim.evidence.length} evidence {claim.evidence.length === 1 ? "item" : "items"}</summary>
    <div className="evidence-list">
      {claim.evidence.map((evidence) => <div className="evidence-item" key={evidence.id}>
        <div><strong>{evidence.source}</strong>{evidence.kind && <span>{evidence.kind}</span>}</div>
        {evidence.detail && <code>{evidence.detail}</code>}
        {evidence.digest && <code className="evidence-digest" title={`SHA-256 ${evidence.digest}`}>SHA-256 {evidence.digest}</code>}
        {(evidence.parser || evidence.collectedAt) && <small>{[evidence.parser, relativeTime(evidence.collectedAt)].filter(Boolean).join(" · ")}</small>}
      </div>)}
    </div>
  </details>;
}

function ProjectSection({ section }: { section: ProjectSectionView }) {
  return <details className="project-section">
    <summary>
      <span className="section-chevron" aria-hidden="true">›</span>
      <span className="section-label"><strong>{section.title}</strong><small>{section.description}</small></span>
      <span className={`section-count${section.claims.length ? "" : " empty"}`}>{section.claims.length || "—"}</span>
    </summary>
    <div className="claim-list">
      {section.claims.length ? section.claims.map((claim) => <article className="claim" key={claim.id}>
        <div className="claim-value">
          <small>{claim.label}</small>
          <strong>{claim.value}</strong>
        </div>
        <div className="claim-badges" aria-label="Claim metadata">
          {claim.state && <span>{claim.state}</span>}
          {claim.authority && <span>{claim.authority}</span>}
          {claim.confidence && <span>{claim.confidence} confidence</span>}
        </div>
        <EvidenceDetails claim={claim} />
      </article>) : <p className="section-empty">No established facts in this section.</p>}
    </div>
  </details>;
}

export interface ProjectIntelligenceViewProps {
  snapshot: ProjectSnapshotViewModel;
  onRefresh(): void;
  onReview(): void;
  onResolveGaps?(): void;
  onUseContext(): void;
  actionMessage?: string;
}

export function ProjectIntelligenceView({ snapshot, onRefresh, onReview, onResolveGaps, onUseContext, actionMessage }: ProjectIntelligenceViewProps) {
  const status = STATUS_COPY[snapshot.status];
  const blocked = snapshot.reviewed === false || snapshot.status === "scanning" || snapshot.status === "stale" || snapshot.status === "partial" || snapshot.status === "error" || snapshot.status === "unsupported" || snapshot.status === "conflict";
  const refreshIsPrimary = snapshot.status !== "current";
  return <section className="project-intelligence" aria-labelledby="project-title">
    <article className="project-overview">
      <div className="project-heading">
        <div className="project-title-copy">
          <span className={`project-status status-${snapshot.status}`}><i aria-hidden="true" />{status.label}</span>
          <h1 id="project-title">{snapshot.projectName}</h1>
          {snapshot.description && <p>{snapshot.description}</p>}
        </div>
        <div className="coverage-ring" role="progressbar" aria-label="Project metadata coverage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={snapshot.coverage.percent}>
          <svg aria-hidden="true" viewBox="0 0 36 36"><circle className="coverage-track" cx="18" cy="18" r="15.8" pathLength="100" /><circle className="coverage-value" cx="18" cy="18" r="15.8" pathLength="100" strokeDasharray={`${snapshot.coverage.percent} 100`} /></svg>
          <strong>{snapshot.coverage.percent}%</strong><small>coverage</small>
        </div>
      </div>

      <div className={`status-message status-${snapshot.status}`} role={snapshot.status === "error" ? "alert" : "status"} aria-live="polite">
        <span className={snapshot.status === "scanning" ? "status-spinner" : "status-symbol"} aria-hidden="true">{snapshot.status === "scanning" ? "" : snapshot.status === "current" ? "✓" : "!"}</span>
        <span><strong>{snapshot.message ?? status.message}</strong><small>{snapshot.coverage.label}</small></span>
      </div>

      <dl className="project-meta">
        <div><dt>Owner</dt><dd title={snapshot.owner}>{snapshot.owner ?? "Unassigned"}</dd></div>
        <div><dt>Type</dt><dd>{snapshot.componentType ?? "Unknown"}</dd></div>
        <div><dt>Lifecycle</dt><dd>{snapshot.lifecycle ?? "Unknown"}</dd></div>
        <div><dt>Updated</dt><dd title={snapshot.generatedAt}>{relativeTime(snapshot.generatedAt)}</dd></div>
      </dl>

      <div className="project-signals" aria-label="Snapshot signals">
        <span className={snapshot.conflictCount ? "has-attention" : ""}>{snapshot.conflictCount} conflicts</span>
        <span className={snapshot.pendingChanges ? "has-attention" : ""}>{snapshot.pendingChanges} pending proposals</span>
        {snapshot.revision && <span title={snapshot.revision}>Revision {snapshot.revision.slice(0, 8)}</span>}
      </div>

      <div className="project-actions">
        <button type="button" className={refreshIsPrimary ? "primary" : "secondary"} onClick={onRefresh} disabled={snapshot.status === "scanning"}>{snapshot.status === "scanning" ? "Scanning…" : "Refresh"}</button>
        <button type="button" className="secondary" onClick={onReview} disabled={snapshot.status === "scanning"}>Review snapshot</button>
        {(snapshot.status === "partial" || snapshot.status === "conflict") && <button type="button" className="secondary" onClick={() => onResolveGaps?.()}>Open declaration</button>}
        <button type="button" className={`${refreshIsPrimary ? "secondary" : "primary"} context-copy`} onClick={onUseContext} disabled={blocked}>Copy AI context to clipboard</button>
      </div>
      <p className="context-disclosure">Copies only the approved bounded brief to the OS clipboard. It does not contact a provider.</p>
      {actionMessage && <p className="action-message" role="status">{actionMessage}</p>}
    </article>

    <div className="project-sections" aria-label="Project intelligence sections">
      {snapshot.sections.map((section) => <ProjectSection section={section} key={section.id} />)}
    </div>
  </section>;
}
