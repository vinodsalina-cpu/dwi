import { createHash, randomUUID } from "node:crypto";
import {
  validateProjectSnapshot,
  type DwiBrief,
  type DwiCandidate,
  type DwiEstimate,
  type DwiFeedback,
  type DwiProjectSnapshot,
} from "@platform/dwi-core";
import { PROMPT_TEXT_LIMIT_CHARS } from "@platform/domain-prompt-optimizer";
import { canResetPromptOptimizerState } from "./workflow-state.js";
import type { WorkspaceIdentity } from "./workspace-identity.js";
import { isPromptComposeInput, type PromptComposeInput } from "./prompt-compose-protocol.js";

export const DWI_SNAPSHOT_SCHEMA = "dwi.workspace.snapshot.v1" as const;
export const DWI_INITIALIZATION_SCHEMA = "dwi.workspace.initialization.v1" as const;
const MANIFEST_FILE = "manifest.json";
const INITIALIZATION_FILE = "initialization.json";
const INTEGRITY_FILE = "initialization.sha256";
const PARTIAL_FILE = "PARTIAL";
const COMPLETE_FILE = "COMPLETE";
export const DWI_PROJECT_DECLARATION_FILE = "project.yaml";
const MANAGED_FILES = new Set([
  MANIFEST_FILE,
  INITIALIZATION_FILE,
  INTEGRITY_FILE,
  PARTIAL_FILE,
  COMPLETE_FILE,
]);
const BACKUP_NAME = /^\.managed\.backup-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;
const TRANSACTION_NAME = /^\.managed\.(?:backup|staging|migration)-[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)?$/;
const MAX_SHORT_TEXT = 4_096;
const MAX_LIST_ITEMS = 512;
const MAX_CANDIDATE_BYTES = 1024 * 1024;

export type DwiJourneyStage = "consent" | "brief" | "compose" | "evaluate";
export type DwiOptimizerReview =
  | { source: "local" }
  | { source: "provider"; provider: "gemini" | "openai"; model: string; title?: string; summary?: string };
export interface DwiWorkspaceConsent {
  policyVersion: string;
  scopeDigest: string;
  workspaceFingerprint: string;
  approvedAt: string;
}
export interface DwiInitializationRecord {
  schema: typeof DWI_INITIALIZATION_SCHEMA;
  workspace: Pick<WorkspaceIdentity, "kind" | "value" | "fingerprint">;
  createdAt: string;
}
export interface DwiWorkspaceSnapshot {
  schema: typeof DWI_SNAPSHOT_SCHEMA;
  status: "partial" | "complete";
  stage: DwiJourneyStage;
  updatedAt: string;
  generation?: number;
  consent?: DwiWorkspaceConsent;
  project?: DwiProjectSnapshot;
  brief?: DwiBrief;
  selectedModuleIds?: string[];
  candidate?: DwiCandidate;
  candidateInput?: PromptComposeInput;
  optimizerDraft?: PromptComposeInput;
  optimizerReview?: DwiOptimizerReview;
  evaluationMarkdown?: string;
  feedback?: DwiFeedback;
}

export function clearPromptOptimizerState(snapshot: DwiWorkspaceSnapshot, updatedAt: string): DwiWorkspaceSnapshot {
  if (!canResetPromptOptimizerState(snapshot)) {
    throw new Error("A current approved project and confirmed brief are required before resetting Prompt Optimizer state.");
  }
  const {
    candidate: _candidate,
    candidateInput: _candidateInput,
    optimizerDraft: _optimizerDraft,
    optimizerReview: _optimizerReview,
    evaluationMarkdown: _evaluationMarkdown,
    feedback: _feedback,
    ...retained
  } = snapshot;
  const cleared: DwiWorkspaceSnapshot = {
    ...retained,
    status: "partial",
    stage: "compose",
    updatedAt,
  };
  assertSnapshot(cleared);
  return cleared;
}
export interface SnapshotFs<Path> {
  exists(path: Path): Promise<boolean>;
  stat(path: Path): Promise<{ size: number; isDirectory?: boolean; isSymbolicLink?: boolean }>;
  readFile(path: Path): Promise<Uint8Array>;
  writeFile(path: Path, content: Uint8Array): Promise<void>;
  readDirectory(path: Path): Promise<readonly string[]>;
  createDirectory(path: Path): Promise<void>;
  rename(from: Path, to: Path): Promise<void>;
  delete(path: Path): Promise<void>;
}
export interface SnapshotPath<Path> { join(base: Path, child: string): Path }
export type RecoveryReason =
  | "integrity-failed"
  | "workspace-identity-mismatch"
  | "corrupt-or-unsupported"
  | "unrecognized-content"
  | "unsafe-managed-path";
export type SnapshotLoad<Path> =
  | { status: "absent" }
  | { status: "complete" | "partial"; snapshot: DwiWorkspaceSnapshot }
  | { status: "recovery"; reason: RecoveryReason };

type Classification = {
  snapshot?: DwiWorkspaceSnapshot;
  unexpected: boolean;
  declarationOnly?: boolean;
  reason?: RecoveryReason;
};

export class DwiWorkspaceSnapshotStore<Path> {
  private readonly dwi: Path;
  private readonly managed: Path;

  constructor(
    root: Path,
    private readonly identity: WorkspaceIdentity,
    private readonly fs: SnapshotFs<Path>,
    private readonly paths: SnapshotPath<Path>,
    private readonly stamp: () => string = () => new Date().toISOString(),
    private readonly nonce: () => string = () => randomUUID(),
  ) {
    this.dwi = paths.join(root, ".dwi");
    this.managed = paths.join(this.dwi, ".managed");
  }

  async load(): Promise<SnapshotLoad<Path>> {
    if (!await this.fs.exists(this.dwi)) return { status: "absent" };
    if (!await this.isSafeDirectory(this.dwi)) return { status: "recovery", reason: "unsafe-managed-path" };
    const legacy = await this.migrateLegacyState();
    if (legacy?.reason || legacy?.unexpected) {
      return {
        status: "recovery",
        reason: legacy.reason ?? "unrecognized-content",
      };
    }
    await this.restoreInterruptedSwap();
    if (!await this.fs.exists(this.managed)) return { status: "absent" };
    const result = await this.classify(this.managed);
    if (result.snapshot?.status === "complete") return { status: "complete", snapshot: result.snapshot };
    if (result.snapshot?.status === "partial") return { status: "partial", snapshot: result.snapshot };
    return {
      status: "recovery",
      reason: result.reason ?? (result.unexpected ? "unrecognized-content" : "corrupt-or-unsupported"),
    };
  }

  async begin(consent?: DwiWorkspaceConsent): Promise<DwiWorkspaceSnapshot> {
    await this.prepareForFreshJourney();
    const snapshot: DwiWorkspaceSnapshot = {
      schema: DWI_SNAPSHOT_SCHEMA,
      status: "partial",
      stage: "consent",
      updatedAt: this.stamp(),
      ...(consent ? { consent } : {}),
    };
    const initialization: DwiInitializationRecord = {
      schema: DWI_INITIALIZATION_SCHEMA,
      workspace: {
        kind: this.identity.kind,
        value: this.identity.value,
        fingerprint: this.identity.localFingerprint,
      },
      createdAt: this.stamp(),
    };
    return this.write(snapshot, encode(JSON.stringify(initialization)));
  }

  async updatePartial(snapshot: DwiWorkspaceSnapshot): Promise<void> {
    if (snapshot.status !== "partial") throw new Error("DWI partial persistence requires a partial snapshot.");
    await this.write({ ...snapshot, updatedAt: this.stamp() }, undefined, snapshot.generation ?? 0);
  }

  async complete(snapshot: DwiWorkspaceSnapshot): Promise<void> {
    if (snapshot.status !== "complete") throw new Error("DWI completion requires a complete snapshot.");
    await this.write({ ...snapshot, updatedAt: this.stamp() }, undefined, snapshot.generation ?? 0);
  }

  async reset(): Promise<void> {
    if (!await this.fs.exists(this.dwi)) return;
    if (!await this.isSafeDirectory(this.dwi)) throw new Error("DWI refuses to reset a symlinked or non-directory .dwi path.");
    const legacy = await this.migrateLegacyState();
    if (legacy?.reason || legacy?.unexpected) {
      await this.recoverLegacyState();
    }
    await this.restoreInterruptedSwap();
    if (!await this.fs.exists(this.managed)) return;
    const result = await this.classify(this.managed);
    if (result.unexpected || result.reason) {
      await this.recover();
      return;
    }
    await this.fs.delete(this.managed);
  }

  private async prepareForFreshJourney(): Promise<void> {
    if (!await this.fs.exists(this.dwi)) await this.fs.createDirectory(this.dwi);
    if (!await this.isSafeDirectory(this.dwi)) throw new Error("DWI refuses to use a symlinked or non-directory .dwi path.");
    const legacy = await this.migrateLegacyState();
    if (legacy?.reason || legacy?.unexpected) await this.recoverLegacyState();
    await this.restoreInterruptedSwap();
    if (!await this.fs.exists(this.managed)) return;
    const result = await this.classify(this.managed);
    if (result.unexpected || result.reason) await this.recover();
  }

  private async restoreInterruptedSwap(): Promise<void> {
    if (!await this.fs.exists(this.dwi)) return;
    if (await this.fs.exists(this.managed)) {
      const active = await this.classify(this.managed);
      if (active.snapshot && !active.unexpected && !active.reason) await this.cleanupTransactionResidues();
      return;
    }
    let entries: readonly string[];
    try {
      entries = await this.fs.readDirectory(this.dwi);
    } catch {
      return;
    }
    const backups = entries.filter((name) => BACKUP_NAME.test(name)).sort(compareCodeUnits).reverse();
    for (const name of backups) {
      const candidate = this.paths.join(this.dwi, name);
      const result = await this.classify(candidate);
      if (result.reason || result.unexpected || !result.snapshot) continue;
      try {
        await this.fs.rename(candidate, this.managed);
      } catch {
        if (!await this.fs.exists(this.managed)) continue;
      }
      await this.cleanupTransactionResidues();
      return;
    }
  }

  private async cleanupTransactionResidues(): Promise<void> {
    const entries = await this.fs.readDirectory(this.dwi);
    for (const name of entries.filter((entry) => TRANSACTION_NAME.test(entry))) {
      const candidate = this.paths.join(this.dwi, name);
      const classified = await this.classify(candidate);
      if (classified.snapshot && !classified.unexpected && !classified.reason) await this.fs.delete(candidate);
    }
  }

  private async write(
    snapshot: DwiWorkspaceSnapshot,
    initializationBytes?: Uint8Array,
    expectedGeneration?: number,
  ): Promise<DwiWorkspaceSnapshot> {
    assertSnapshot(snapshot);
    const initialState = await this.currentTrustedState();
    const initialGeneration = initialState.snapshot?.generation ?? 0;
    if (expectedGeneration !== undefined && (!initialState.snapshot || initialGeneration !== expectedGeneration)) {
      throw new Error("DWI workspace state changed before this update; reload and retry.");
    }
    const persisted: DwiWorkspaceSnapshot = { ...snapshot, generation: initialGeneration + 1 };
    assertSnapshot(persisted);
    const init = initializationBytes ?? await this.readManagedFile(this.paths.join(this.managed, INITIALIZATION_FILE));
    assertInitialization(JSON.parse(decode(init)));
    const unique = `${safeStamp(this.stamp())}-${safeStamp(this.nonce())}`;
    const staging = this.paths.join(this.dwi, `.managed.staging-${unique}`);
    const backup = this.paths.join(this.dwi, `.managed.backup-${unique}`);
    let movedCurrent = false;
    try {
      if (await this.fs.exists(staging) || await this.fs.exists(backup)) {
        throw new Error("DWI staging paths already exist.");
      }
      await this.fs.createDirectory(staging);
      await this.fs.writeFile(this.paths.join(staging, INITIALIZATION_FILE), init);
      await this.fs.writeFile(this.paths.join(staging, INTEGRITY_FILE), encode(`${sha256(init)}\n`));
      await this.fs.writeFile(this.paths.join(staging, MANIFEST_FILE), encode(JSON.stringify(persisted)));
      await this.fs.writeFile(
        this.paths.join(staging, persisted.status === "complete" ? COMPLETE_FILE : PARTIAL_FILE),
        encode(`${DWI_SNAPSHOT_SCHEMA}\n`),
      );
      const verified = await this.classify(staging);
      if (!verified.snapshot || verified.snapshot.status !== persisted.status || verified.snapshot.generation !== persisted.generation) {
        throw new Error("DWI staging snapshot did not validate.");
      }
      if (await this.fs.exists(this.managed)) {
        const current = await this.classify(this.managed);
        if (current.unexpected || current.reason) throw new Error("DWI cannot replace untrusted workspace files.");
        if (expectedGeneration !== undefined && (!current.snapshot || (current.snapshot.generation ?? 0) !== expectedGeneration)) {
          throw new Error("DWI workspace state changed before this update; reload and retry.");
        }
        await this.fs.rename(this.managed, backup);
        movedCurrent = true;
        if (expectedGeneration !== undefined) {
          const moved = await this.classify(backup);
          if (!moved.snapshot || (moved.snapshot.generation ?? 0) !== expectedGeneration) {
            await this.fs.rename(backup, this.managed);
            movedCurrent = false;
            throw new Error("DWI workspace state changed before this update; reload and retry.");
          }
        }
      } else if (expectedGeneration !== undefined) {
        throw new Error("DWI workspace state changed before this update; reload and retry.");
      }
      await this.fs.rename(staging, this.managed);
      if (movedCurrent && await this.fs.exists(backup)) {
        await this.fs.delete(backup);
      }
      return persisted;
    } catch (error) {
      if (await this.fs.exists(staging)) await this.fs.delete(staging);
      if (movedCurrent && !await this.fs.exists(this.managed) && await this.fs.exists(backup)) {
        await this.fs.rename(backup, this.managed);
      }
      throw error;
    }
  }

  private async currentTrustedState(): Promise<{ snapshot?: DwiWorkspaceSnapshot }> {
    if (!await this.fs.exists(this.dwi)) return {};
    if (!await this.isSafeDirectory(this.dwi)) throw new Error("DWI cannot use an unsafe .dwi path.");
    const legacy = await this.migrateLegacyState();
    if (legacy?.reason || legacy?.unexpected) throw new Error("DWI cannot replace untrusted legacy workspace files.");
    await this.restoreInterruptedSwap();
    if (!await this.fs.exists(this.managed)) return {};
    const current = await this.classify(this.managed);
    if (current.unexpected || current.reason) throw new Error("DWI cannot replace untrusted workspace files.");
    return { snapshot: current.snapshot };
  }

  private async recover(): Promise<Path> {
    const recovery = this.paths.join(this.dwi, `.managed.recovered-${safeStamp(this.stamp())}-${safeStamp(this.nonce())}`);
    await this.fs.rename(this.managed, recovery);
    return recovery;
  }

  /**
   * Moves the pre-0.2 flat managed files into an isolated subtree. The checked-in
   * project declaration and any unrelated `.dwi` content never participate in
   * an atomic state swap.
   */
  private async migrateLegacyState(): Promise<Classification | undefined> {
    const entries = await this.fs.readDirectory(this.dwi);
    const legacyFiles = entries.filter((name) => MANAGED_FILES.has(name));
    if (legacyFiles.length === 0) return undefined;
    if (await this.fs.exists(this.managed)) {
      for (const name of legacyFiles) {
        const legacyPath = this.paths.join(this.dwi, name);
        const managedPath = this.paths.join(this.managed, name);
        if (!await this.fs.exists(managedPath)) return { unexpected: true };
        try {
          const legacyBytes = await this.readManagedFile(legacyPath);
          const managedBytes = await this.readManagedFile(managedPath);
          if (!equalBytes(legacyBytes, managedBytes)) return { unexpected: true };
        } catch {
          return { unexpected: false, reason: "unsafe-managed-path" };
        }
      }
      await this.quarantineLegacyFiles(legacyFiles);
      return undefined;
    }
    const legacy = await this.classify(this.dwi, true);
    if (!legacy.snapshot) return legacy;

    const unique = `${safeStamp(this.stamp())}-${safeStamp(this.nonce())}`;
    const staging = this.paths.join(this.dwi, `.managed.migration-${unique}`);
    if (await this.fs.exists(staging)) throw new Error("DWI migration staging path already exists.");
    await this.fs.createDirectory(staging);
    try {
      for (const name of legacyFiles) {
        const source = this.paths.join(this.dwi, name);
        await this.fs.writeFile(this.paths.join(staging, name), await this.readManagedFile(source));
      }
      const verified = await this.classify(staging);
      if (!verified.snapshot) throw new Error("Legacy DWI state did not validate after migration.");
      if (await this.fs.exists(this.managed)) throw new Error("DWI managed state appeared during migration; reload and retry.");
      await this.fs.rename(staging, this.managed);
      await this.quarantineLegacyFiles(legacyFiles);
      return undefined;
    } catch (error) {
      if (await this.fs.exists(staging)) await this.fs.delete(staging);
      throw error;
    }
  }

  private async recoverLegacyState(): Promise<void> {
    const entries = await this.fs.readDirectory(this.dwi);
    const legacyFiles = entries.filter((name) => MANAGED_FILES.has(name));
    if (legacyFiles.length === 0) return;
    const recovery = this.paths.join(this.dwi, `.managed.recovered-${safeStamp(this.stamp())}-${safeStamp(this.nonce())}`);
    await this.fs.createDirectory(recovery);
    for (const name of legacyFiles) {
      const source = this.paths.join(this.dwi, name);
      if (await this.fs.exists(source)) await this.fs.rename(source, this.paths.join(recovery, name));
    }
  }

  private async quarantineLegacyFiles(legacyFiles: readonly string[]): Promise<void> {
    if (legacyFiles.length === 0) return;
    const quarantine = this.paths.join(this.dwi, `.managed.legacy-${safeStamp(this.stamp())}-${safeStamp(this.nonce())}`);
    if (await this.fs.exists(quarantine)) throw new Error("DWI legacy quarantine path already exists.");
    await this.fs.createDirectory(quarantine);
    for (const name of legacyFiles) {
      const source = this.paths.join(this.dwi, name);
      if (await this.fs.exists(source)) await this.fs.rename(source, this.paths.join(quarantine, name));
    }
  }

  private async isSafeDirectory(path: Path): Promise<boolean> {
    try {
      const value = await this.fs.stat(path);
      return !value.isSymbolicLink && value.isDirectory !== false;
    } catch {
      return false;
    }
  }

  private async readManagedFile(path: Path): Promise<Uint8Array> {
    const value = await this.fs.stat(path);
    if (value.isSymbolicLink || value.isDirectory) throw new Error("DWI managed paths must be regular files.");
    return this.fs.readFile(path);
  }

  private async classify(directory: Path, legacy = false): Promise<Classification> {
    if (!await this.isSafeDirectory(directory)) return { unexpected: false, reason: "unsafe-managed-path" };
    let files: readonly string[];
    try {
      files = await this.fs.readDirectory(directory);
    } catch {
      return { unexpected: false, reason: "corrupt-or-unsupported" };
    }
    if (legacy) files = files.filter((file) => MANAGED_FILES.has(file));
    const unexpected = files.some((file) => !MANAGED_FILES.has(file));
    if (unexpected) return { unexpected };
    for (const file of files) {
      try {
        const value = await this.fs.stat(this.paths.join(directory, file));
        if (value.isSymbolicLink || value.isDirectory) return { unexpected: false, reason: "unsafe-managed-path" };
      } catch {
        return { unexpected: false, reason: "corrupt-or-unsupported" };
      }
    }
    if (!files.includes(MANIFEST_FILE) || !files.includes(INITIALIZATION_FILE) || !files.includes(INTEGRITY_FILE)) {
      return { unexpected: false, reason: "corrupt-or-unsupported" };
    }
    try {
      const initBytes = await this.readManagedFile(this.paths.join(directory, INITIALIZATION_FILE));
      if (decode(await this.readManagedFile(this.paths.join(directory, INTEGRITY_FILE))).trim() !== sha256(initBytes)) {
        return { unexpected: false, reason: "integrity-failed" };
      }
      const init = JSON.parse(decode(initBytes)) as unknown;
      assertInitialization(init);
      if (
        init.workspace.kind !== this.identity.kind ||
        init.workspace.value !== this.identity.value ||
        init.workspace.fingerprint !== this.identity.localFingerprint
      ) {
        return { unexpected: false, reason: "workspace-identity-mismatch" };
      }
      const snapshot = JSON.parse(decode(await this.readManagedFile(this.paths.join(directory, MANIFEST_FILE)))) as unknown;
      assertSnapshot(snapshot);
      const marker = snapshot.status === "complete" ? COMPLETE_FILE : PARTIAL_FILE;
      const other = snapshot.status === "complete" ? PARTIAL_FILE : COMPLETE_FILE;
      if (
        !files.includes(marker) ||
        files.includes(other) ||
        decode(await this.readManagedFile(this.paths.join(directory, marker))) !== `${DWI_SNAPSHOT_SCHEMA}\n`
      ) {
        return { unexpected: false, reason: "corrupt-or-unsupported" };
      }
      return { snapshot, unexpected: false };
    } catch {
      return { unexpected: false, reason: "corrupt-or-unsupported" };
    }
  }
}

function assertSnapshot(value: unknown): asserts value is DwiWorkspaceSnapshot {
  const snapshot = asRecord(value, "DWI snapshot");
  onlyKeys(snapshot, [
    "schema", "status", "stage", "updatedAt", "generation", "consent", "project", "brief",
    "selectedModuleIds", "candidate", "candidateInput", "optimizerDraft", "optimizerReview", "evaluationMarkdown", "feedback",
  ], "DWI snapshot");
  if (
    snapshot.schema !== DWI_SNAPSHOT_SCHEMA ||
    (snapshot.status !== "partial" && snapshot.status !== "complete") ||
    !["consent", "brief", "compose", "evaluate"].includes(String(snapshot.stage)) ||
    !isIsoTimestamp(snapshot.updatedAt) ||
    (snapshot.generation !== undefined && (!Number.isSafeInteger(snapshot.generation) || Number(snapshot.generation) < 1))
  ) throw new Error("DWI snapshot schema is invalid.");

  if (snapshot.consent !== undefined) validateConsent(snapshot.consent);
  if (snapshot.project !== undefined && !validateProjectSnapshot(snapshot.project).valid) {
    throw new Error("DWI project snapshot schema is invalid.");
  }
  if (snapshot.brief !== undefined) validateBrief(snapshot.brief);
  if (snapshot.selectedModuleIds !== undefined) validateStringArray(snapshot.selectedModuleIds, "selectedModuleIds", 64, 128);
  if (snapshot.candidate !== undefined) validateCandidate(snapshot.candidate);
  if (snapshot.candidateInput !== undefined && !isPromptComposeInput(snapshot.candidateInput)) {
    throw new Error("DWI candidate input is invalid.");
  }
  if (snapshot.optimizerDraft !== undefined && !isOptimizerDraft(snapshot.optimizerDraft)) {
    throw new Error("DWI optimizer draft is invalid.");
  }
  if (snapshot.optimizerReview !== undefined) validateOptimizerReview(snapshot.optimizerReview);
  if (snapshot.evaluationMarkdown !== undefined) boundedString(snapshot.evaluationMarkdown, "evaluationMarkdown", MAX_CANDIDATE_BYTES, true);
  if (snapshot.feedback !== undefined) validateFeedback(snapshot.feedback);
  if (snapshot.candidate !== undefined && snapshot.brief === undefined) throw new Error("DWI candidate requires a project brief.");
  if (snapshot.candidateInput !== undefined && snapshot.candidate === undefined) throw new Error("DWI candidate input requires a candidate.");
  if (snapshot.optimizerReview !== undefined && snapshot.candidate === undefined) throw new Error("DWI optimizer review requires a candidate.");
  if (snapshot.status === "complete") {
    if (snapshot.stage !== "evaluate" || snapshot.brief === undefined || snapshot.candidate === undefined || typeof snapshot.evaluationMarkdown !== "string") {
      throw new Error("DWI completion snapshot is incomplete.");
    }
  }
}

function isOptimizerDraft(value: unknown): value is PromptComposeInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.task === "string" && draft.task.length <= PROMPT_TEXT_LIMIT_CHARS &&
    isPromptComposeInput({ ...draft, task: draft.task.trim() || "Draft" });
}

function validateOptimizerReview(value: unknown): void {
  const review = asRecord(value, "DWI optimizer review");
  if (review.source === "local") {
    onlyKeys(review, ["source"], "DWI optimizer review");
    return;
  }
  onlyKeys(review, ["source", "provider", "model", "title", "summary"], "DWI optimizer review");
  if (
    review.source !== "provider" ||
    (review.provider !== "gemini" && review.provider !== "openai") ||
    typeof review.model !== "string" || !review.model || review.model.length > 256
  ) throw new Error("DWI optimizer review is invalid.");
  if (review.title !== undefined) boundedString(review.title, "optimizer review title", 256, true);
  if (review.summary !== undefined) boundedString(review.summary, "optimizer review summary", 2_048, true);
}

export function isValidPromptOptimizerRecovery(
  candidate: unknown,
  draft: unknown,
  review: unknown,
): candidate is DwiCandidate {
  try {
    if (candidate === undefined && review === undefined) return draft === undefined || isOptimizerDraft(draft);
    if (candidate === undefined || review === undefined || !isOptimizerDraft(draft)) return false;
    validateCandidate(candidate);
    validateOptimizerReview(review);
    return true;
  } catch {
    return false;
  }
}

function assertInitialization(value: unknown): asserts value is DwiInitializationRecord {
  const initialization = asRecord(value, "DWI initialization");
  onlyKeys(initialization, ["schema", "workspace", "createdAt"], "DWI initialization");
  const workspace = asRecord(initialization.workspace, "DWI initialization workspace");
  onlyKeys(workspace, ["kind", "value", "fingerprint"], "DWI initialization workspace");
  if (
    initialization.schema !== DWI_INITIALIZATION_SCHEMA ||
    !isIsoTimestamp(initialization.createdAt) ||
    (workspace.kind !== "remote" && workspace.kind !== "canonical-folder") ||
    typeof workspace.value !== "string" || !workspace.value || workspace.value.length > MAX_SHORT_TEXT ||
    typeof workspace.fingerprint !== "string" || !/^[a-f0-9]{24}$/.test(workspace.fingerprint)
  ) throw new Error("DWI initialization schema is invalid.");
}

function validateConsent(value: unknown): void {
  const consent = asRecord(value, "DWI consent");
  onlyKeys(consent, ["policyVersion", "scopeDigest", "workspaceFingerprint", "approvedAt"], "DWI consent");
  if (
    typeof consent.policyVersion !== "string" || !consent.policyVersion || consent.policyVersion.length > 256 ||
    typeof consent.scopeDigest !== "string" || !/^[a-f0-9]{64}$/.test(consent.scopeDigest) ||
    typeof consent.workspaceFingerprint !== "string" || !/^[a-f0-9]{24}$/.test(consent.workspaceFingerprint) ||
    !isIsoTimestamp(consent.approvedAt)
  ) throw new Error("DWI consent receipt is invalid.");
}

function validateBrief(value: unknown): void {
  const brief = asRecord(value, "DWI brief");
  onlyKeys(brief, [
    "version", "projectName", "archetype", "stack", "packageManager", "scripts", "modules", "facts",
    "unknowns", "confirmed", "corrections",
  ], "DWI brief");
  if (brief.version !== "dwi.brief.v1" || typeof brief.confirmed !== "boolean") throw new Error("DWI brief schema is invalid.");
  boundedString(brief.projectName, "brief.projectName", MAX_SHORT_TEXT);
  boundedString(brief.archetype, "brief.archetype", MAX_SHORT_TEXT);
  boundedString(brief.packageManager, "brief.packageManager", MAX_SHORT_TEXT, true);
  boundedString(brief.corrections, "brief.corrections", 10_000, true);
  validateStringArray(brief.stack, "brief.stack", MAX_LIST_ITEMS, MAX_SHORT_TEXT);
  validateStringArray(brief.scripts, "brief.scripts", MAX_LIST_ITEMS, MAX_SHORT_TEXT);
  validateStringArray(brief.modules, "brief.modules", MAX_LIST_ITEMS, MAX_SHORT_TEXT);
  validateStringArray(brief.unknowns, "brief.unknowns", MAX_LIST_ITEMS, MAX_SHORT_TEXT);
  if (!Array.isArray(brief.facts) || brief.facts.length > MAX_LIST_ITEMS) throw new Error("DWI brief facts are invalid.");
  for (const item of brief.facts) {
    const fact = asRecord(item, "DWI brief fact");
    onlyKeys(fact, ["id", "label", "value", "confidence", "evidence"], "DWI brief fact");
    boundedString(fact.id, "brief.fact.id", 512);
    boundedString(fact.label, "brief.fact.label", MAX_SHORT_TEXT);
    boundedString(fact.value, "brief.fact.value", MAX_SHORT_TEXT, true);
    boundedString(fact.evidence, "brief.fact.evidence", MAX_SHORT_TEXT, true);
    if (!["high", "medium", "low"].includes(String(fact.confidence))) throw new Error("DWI brief fact confidence is invalid.");
  }
}

function validateCandidate(value: unknown): void {
  const candidate = asRecord(value, "DWI candidate");
  onlyKeys(candidate, ["text", "estimate", "selectedModuleIds"], "DWI candidate");
  boundedString(candidate.text, "candidate.text", MAX_CANDIDATE_BYTES);
  validateEstimate(candidate.estimate);
  validateStringArray(candidate.selectedModuleIds, "candidate.selectedModuleIds", 64, 128);
}

function validateEstimate(value: unknown): asserts value is DwiEstimate {
  const estimate = asRecord(value, "DWI estimate");
  onlyKeys(estimate, ["baselineTokens", "optimizedTokens", "estimatedAvoidedDuplication", "method"], "DWI estimate");
  for (const field of ["baselineTokens", "optimizedTokens", "estimatedAvoidedDuplication"] as const) {
    if (!Number.isSafeInteger(estimate[field]) || Number(estimate[field]) < 0) throw new Error(`DWI estimate ${field} is invalid.`);
  }
  boundedString(estimate.method, "estimate.method", MAX_SHORT_TEXT);
}

function validateFeedback(value: unknown): void {
  const feedback = asRecord(value, "DWI feedback");
  onlyKeys(feedback, ["id", "createdAt", "rating", "tags", "note", "selectedModuleIds", "estimate", "elapsedMs"], "DWI feedback");
  boundedString(feedback.id, "feedback.id", 1_024);
  if (!isIsoTimestamp(feedback.createdAt) || !["helpful", "mixed", "not-helpful"].includes(String(feedback.rating))) {
    throw new Error("DWI feedback schema is invalid.");
  }
  validateStringArray(feedback.tags, "feedback.tags", 8, 256);
  if (feedback.note !== undefined) boundedString(feedback.note, "feedback.note", 500, true);
  validateStringArray(feedback.selectedModuleIds, "feedback.selectedModuleIds", 64, 128);
  validateEstimate(feedback.estimate);
  if (!Number.isSafeInteger(feedback.elapsedMs) || Number(feedback.elapsedMs) < 0) throw new Error("DWI feedback elapsed time is invalid.");
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains unsupported fields.`);
}

function boundedString(value: unknown, label: string, maximum: number, allowEmpty = false): asserts value is string {
  if (typeof value !== "string" || (!allowEmpty && !value) || new TextEncoder().encode(value).byteLength > maximum) {
    throw new Error(`${label} is invalid.`);
  }
}

function validateStringArray(value: unknown, label: string, maximumItems: number, maximumBytes: number): asserts value is string[] {
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`${label} is invalid.`);
  for (const item of value) boundedString(item, label, maximumBytes);
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates.`);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

const compareCodeUnits = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(value);
const sha256 = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
const safeStamp = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "") || "now";
