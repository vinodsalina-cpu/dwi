import { PROMPT_TEXT_LIMIT_CHARS, isEntityId, promptTypes } from "@platform/domain-prompt-optimizer";
import type { PromptOptimizerInput, PromptOptimizerView } from "./prompt-optimizer-protocol.js";
import type { DwiCandidate } from "@platform/dwi-core";
import { isValidPromptOptimizerRecovery, type DwiOptimizerReview } from "./workspace-snapshot.js";

export const PROMPT_OPTIMIZER_SESSIONS_KEY = "dwi.promptOptimizer.sessions.v1";
export const PROMPT_OPTIMIZER_SESSIONS_SCHEMA = "dwi.prompt-optimizer.sessions.v1" as const;
export const PROMPT_OPTIMIZER_SESSION_SCHEMA = "dwi.prompt-optimizer.session.v1" as const;
export const PROMPT_OPTIMIZER_SESSION_LIMIT = 50;
export const PROMPT_OPTIMIZER_SESSION_BYTES_LIMIT = 256 * 1024;
export const PROMPT_OPTIMIZER_SESSION_RECENT_LIMIT = 5;
const utf8 = new TextEncoder();

export function serializedUtf8ByteLength(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? utf8.encode(serialized).byteLength : undefined;
  } catch {
    return undefined;
  }
}

export interface PromptOptimizerSessionRecent {
  id: string;
  title: string;
  preview: string;
  promptType: PromptOptimizerInput["promptType"];
  updatedAt: string;
  source?: "local" | "provider";
  provider?: string;
  model?: string;
}

export interface PromptOptimizerSession {
  schema: typeof PROMPT_OPTIMIZER_SESSION_SCHEMA;
  workspaceFingerprint: string;
  revision: number;
  view: Exclude<PromptOptimizerView, "resolve">;
  draft?: PromptOptimizerInput;
  candidate?: DwiCandidate;
  review?: DwiOptimizerReview;
  recents: PromptOptimizerSessionRecent[];
  updatedAt: string;
}

export interface PromptOptimizerSessionsEnvelope {
  schema: typeof PROMPT_OPTIMIZER_SESSIONS_SCHEMA;
  revision: number;
  sessions: PromptOptimizerSession[];
}

export interface PromptOptimizerSessionStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export type PromptOptimizerSessionOpen =
  | { status: "absent" }
  | { status: "ready"; session: PromptOptimizerSession }
  | { status: "unavailable"; reason: "corrupt" | "newer-version" | "oversized" };

export class PromptOptimizerSessionStoreError extends Error {
  constructor(readonly code: "conflict" | "corrupt" | "limit" | "storage", message: string) {
    super(message);
    this.name = "PromptOptimizerSessionStoreError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key));
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 && Number.isFinite(Date.parse(value));
}

function fingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{24}$/.test(value);
}

function boundedText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function input(value: unknown): value is PromptOptimizerInput {
  return record(value) && exact(value, ["task", "assignmentId", "promptType", "outputSize"]) &&
    boundedText(value.task, PROMPT_TEXT_LIMIT_CHARS) && isEntityId(value.assignmentId) &&
    (promptTypes as readonly unknown[]).includes(value.promptType) &&
    (value.outputSize === "low" || value.outputSize === "medium" || value.outputSize === "high" || value.outputSize === "auto");
}

function recent(value: unknown): value is PromptOptimizerSessionRecent {
  if (!record(value) || !exact(value, ["id", "title", "preview", "promptType", "updatedAt"], ["source", "provider", "model"])) return false;
  return isEntityId(value.id) && boundedText(value.title, 96) && boundedText(value.preview, 180) &&
    (promptTypes as readonly unknown[]).includes(value.promptType) && timestamp(value.updatedAt) &&
    (value.source === undefined || value.source === "local" || value.source === "provider") &&
    (value.provider === undefined || boundedText(value.provider, 128)) &&
    (value.model === undefined || boundedText(value.model, 128));
}

export function parsePromptOptimizerSession(value: unknown): PromptOptimizerSession | undefined {
  if (!record(value) || !exact(value, ["schema", "workspaceFingerprint", "revision", "view", "recents", "updatedAt"], ["draft", "candidate", "review"]) ||
    value.schema !== PROMPT_OPTIMIZER_SESSION_SCHEMA || !fingerprint(value.workspaceFingerprint) ||
    !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 ||
    (value.view !== "input" && value.view !== "review") || !Array.isArray(value.recents) ||
    value.recents.length > PROMPT_OPTIMIZER_SESSION_RECENT_LIMIT || !value.recents.every(recent) ||
    !timestamp(value.updatedAt) || (value.draft !== undefined && !input(value.draft)) ||
    !isValidPromptOptimizerRecovery(value.candidate, value.draft, value.review)) return undefined;
  let cloned: PromptOptimizerSession;
  try { cloned = structuredClone(value) as unknown as PromptOptimizerSession; }
  catch { return undefined; }
  const byteLength = serializedUtf8ByteLength(cloned);
  return byteLength !== undefined && byteLength <= PROMPT_OPTIMIZER_SESSION_BYTES_LIMIT ? cloned : undefined;
}

export function parsePromptOptimizerSessionsEnvelope(value: unknown): PromptOptimizerSessionsEnvelope | undefined {
  if (!record(value) || !exact(value, ["schema", "revision", "sessions"]) || value.schema !== PROMPT_OPTIMIZER_SESSIONS_SCHEMA ||
    !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 || !Array.isArray(value.sessions) ||
    value.sessions.length > PROMPT_OPTIMIZER_SESSION_LIMIT) return undefined;
  const sessions = value.sessions.map(parsePromptOptimizerSession);
  if (sessions.some((session) => !session)) return undefined;
  const ready = sessions as PromptOptimizerSession[];
  if (new Set(ready.map(({ workspaceFingerprint }) => workspaceFingerprint)).size !== ready.length) return undefined;
  return { schema: PROMPT_OPTIMIZER_SESSIONS_SCHEMA, revision: Number(value.revision), sessions: structuredClone(ready) };
}

export class PromptOptimizerSessionStore {
  constructor(private readonly storage: PromptOptimizerSessionStorage, private readonly now = () => new Date().toISOString()) {}

  open(workspaceFingerprint: string): PromptOptimizerSessionOpen {
    if (!fingerprint(workspaceFingerprint)) return { status: "unavailable", reason: "corrupt" };
    let stored: unknown;
    try { stored = this.storage.get<unknown>(PROMPT_OPTIMIZER_SESSIONS_KEY); }
    catch { return { status: "unavailable", reason: "corrupt" }; }
    if (stored === undefined) return { status: "absent" };
    if (record(stored) && typeof stored.schema === "string" && stored.schema !== PROMPT_OPTIMIZER_SESSIONS_SCHEMA) {
      return { status: "unavailable", reason: "newer-version" };
    }
    const envelope = parsePromptOptimizerSessionsEnvelope(stored);
    if (!envelope) {
      const byteLength = serializedUtf8ByteLength(stored);
      return { status: "unavailable", reason: byteLength !== undefined && byteLength > PROMPT_OPTIMIZER_SESSION_BYTES_LIMIT * PROMPT_OPTIMIZER_SESSION_LIMIT ? "oversized" : "corrupt" };
    }
    const session = envelope.sessions.find((candidate) => candidate.workspaceFingerprint === workspaceFingerprint);
    return session ? { status: "ready", session: structuredClone(session) } : { status: "absent" };
  }

  async save(session: Omit<PromptOptimizerSession, "schema" | "revision" | "updatedAt">, expectedRevision: number | "new"): Promise<PromptOptimizerSession> {
    if (!fingerprint(session.workspaceFingerprint)) throw new PromptOptimizerSessionStoreError("corrupt", "Invalid workspace fingerprint.");
    const raw = this.storage.get<unknown>(PROMPT_OPTIMIZER_SESSIONS_KEY);
    const envelope = raw === undefined ? { schema: PROMPT_OPTIMIZER_SESSIONS_SCHEMA, revision: 0, sessions: [] } : parsePromptOptimizerSessionsEnvelope(raw);
    if (!envelope) throw new PromptOptimizerSessionStoreError("corrupt", "Optimizer session storage is invalid and was left unchanged.");
    const current = envelope.sessions.find((candidate) => candidate.workspaceFingerprint === session.workspaceFingerprint);
    if ((expectedRevision === "new" && current) || (typeof expectedRevision === "number" && current?.revision !== expectedRevision)) {
      throw new PromptOptimizerSessionStoreError("conflict", "Optimizer session changed before this update.");
    }
    const next = parsePromptOptimizerSession({ ...structuredClone(session), schema: PROMPT_OPTIMIZER_SESSION_SCHEMA, revision: (current?.revision ?? 0) + 1, updatedAt: this.now() });
    if (!next) throw new PromptOptimizerSessionStoreError("limit", "Optimizer session exceeds its bounded storage contract.");
    const sessions = [...envelope.sessions.filter((candidate) => candidate.workspaceFingerprint !== next.workspaceFingerprint), next]
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt)).slice(-PROMPT_OPTIMIZER_SESSION_LIMIT);
    try { await this.storage.update(PROMPT_OPTIMIZER_SESSIONS_KEY, { schema: PROMPT_OPTIMIZER_SESSIONS_SCHEMA, revision: envelope.revision + 1, sessions }); }
    catch { throw new PromptOptimizerSessionStoreError("storage", "Optimizer session could not be persisted."); }
    return structuredClone(next);
  }

  async migrateLegacy(
    workspaceFingerprint: string,
    legacy: { view?: Exclude<PromptOptimizerView, "resolve">; draft?: PromptOptimizerInput; candidate?: DwiCandidate; review?: DwiOptimizerReview; recents?: PromptOptimizerSessionRecent[] },
  ): Promise<PromptOptimizerSessionOpen> {
    const opened = this.open(workspaceFingerprint);
    if (opened.status !== "absent") return opened;
    const saved = await this.save({
      workspaceFingerprint,
      view: legacy.view ?? "input",
      ...(legacy.draft ? { draft: legacy.draft } : {}),
      ...(legacy.candidate ? { candidate: legacy.candidate } : {}),
      ...(legacy.review ? { review: legacy.review } : {}),
      recents: legacy.recents ?? [],
    }, "new");
    return { status: "ready", session: saved };
  }

  async reset(workspaceFingerprint: string): Promise<boolean> {
    const raw = this.storage.get<unknown>(PROMPT_OPTIMIZER_SESSIONS_KEY);
    if (raw === undefined) return false;
    const envelope = parsePromptOptimizerSessionsEnvelope(raw);
    if (!envelope) throw new PromptOptimizerSessionStoreError("corrupt", "Optimizer session storage is invalid and was left unchanged.");
    const sessions = envelope.sessions.filter((candidate) => candidate.workspaceFingerprint !== workspaceFingerprint);
    if (sessions.length === envelope.sessions.length) return false;
    try { await this.storage.update(PROMPT_OPTIMIZER_SESSIONS_KEY, { ...envelope, revision: envelope.revision + 1, sessions }); }
    catch { throw new PromptOptimizerSessionStoreError("storage", "Optimizer session could not be reset."); }
    return true;
  }
}
