import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, open, readdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  canonicalJsonStringify,
  projectSnapshotReviewHash,
  sha256Hex,
  validateProjectSnapshot,
  type DwiProjectSnapshot,
} from "@platform/dwi-core";

const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;
const MAX_ENCRYPTED_FILE_BYTES = 8 * 1024 * 1024;
const ENVELOPE_AAD = Buffer.from("dwi-catalog:snapshot-envelope:v1", "utf8");

interface EncryptedEnvelope {
  version: 1;
  algorithm: "aes-256-gcm";
  projectHash: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export type CatalogStoreErrorCode =
  | "invalid_input"
  | "invalid_snapshot"
  | "snapshot_not_approved"
  | "review_binding_required"
  | "inline_evidence_forbidden"
  | "snapshot_too_large"
  | "precondition_failed"
  | "corrupt_data";

export class CatalogStoreError extends Error {
  constructor(
    readonly code: CatalogStoreErrorCode,
    message: string,
    /** Current full-record hash when a conditional write loses a race. */
    readonly currentSnapshotHash?: string,
  ) {
    super(message);
    this.name = "CatalogStoreError";
  }
}

/**
 * A write precondition is checked inside the same per-project critical section
 * as the encrypted atomic replacement, so competing requests cannot both win.
 */
export type CatalogWritePrecondition =
  | { kind: "create" }
  | { kind: "match"; snapshotHash: string };

export interface CatalogWriteOptions {
  precondition?: CatalogWritePrecondition;
}

export interface EncryptedCatalogStoreOptions {
  /**
   * Inline evidence can contain source or secrets. It is rejected unless a
   * catalog deployment deliberately enables encrypted inline-evidence storage.
   */
  allowInlineEvidenceContent?: boolean;
  now?: () => string;
}

export interface CatalogProjectSummary {
  id: string;
  name: string;
  namespace: string;
  status: DwiProjectSnapshot["resolution"]["status"];
  generatedAt: string;
  /** Hash of the complete persisted snapshot; used as the strong HTTP ETag. */
  snapshotHash: string;
  effectiveSnapshotHash: string;
  evidenceCount: number;
  unresolvedCount: number;
}

export interface CatalogAuditEvent {
  timestamp: string;
  principal: string;
  action: "snapshot.write" | "snapshot.read" | "snapshot.list";
  projectId?: string;
  /** Full persisted-record hash, not resolution.effectiveSnapshotHash. */
  snapshotHash?: string;
}

export class EncryptedCatalogStore {
  private readonly key: Buffer;
  private readonly auditPath: string;
  private readonly now: () => string;
  private readonly allowInlineEvidenceContent: boolean;
  private auditQueue: Promise<void> = Promise.resolve();
  private readonly projectWriteQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly directory: string,
    secret: string | Uint8Array,
    nowOrOptions: (() => string) | EncryptedCatalogStoreOptions = {},
  ) {
    const options = typeof nowOrOptions === "function"
      ? { now: nowOrOptions }
      : nowOrOptions;
    this.now = options.now ?? (() => new Date().toISOString());
    this.allowInlineEvidenceContent = options.allowInlineEvidenceContent === true;
    const secretBytes = Buffer.from(secret);
    if (secretBytes.byteLength < 16) {
      secretBytes.fill(0);
      throw new CatalogStoreError(
        "invalid_input",
        "DWI catalog encryption secret must contain at least 16 bytes.",
      );
    }
    this.key = createHash("sha256").update(secretBytes).digest();
    secretBytes.fill(0);
    this.auditPath = join(directory, "audit.jsonl");
  }

  async put(
    snapshot: DwiProjectSnapshot,
    principal: string,
    options: CatalogWriteOptions = {},
  ): Promise<CatalogProjectSummary> {
    assertPrincipal(principal);
    const review = isRecord(snapshot) && isRecord(snapshot.metadata) &&
      isRecord(snapshot.metadata.review)
      ? snapshot.metadata.review
      : undefined;
    if (review?.state === "approved" && review.reviewedSnapshotHash === undefined) {
      throw new CatalogStoreError(
        "review_binding_required",
        "Approved snapshots must include metadata.review.reviewedSnapshotHash.",
      );
    }
    const validation = validateProjectSnapshot(snapshot);
    if (!validation.valid) {
      throw new CatalogStoreError(
        "invalid_snapshot",
        `Invalid project snapshot: ${validation.issues
          .map(({ path, message }) => `${path} ${message}`)
          .join("; ")}`,
      );
    }
    assertProjectId(snapshot.metadata.id);
    assertCatalogSnapshotPolicy(snapshot, this.allowInlineEvidenceContent);
    if (
      options.precondition?.kind === "match" &&
      !isSnapshotHash(options.precondition.snapshotHash)
    ) {
      throw new CatalogStoreError("invalid_input", "Catalog write precondition is invalid.");
    }

    let plaintext: string;
    try {
      const serialized = JSON.stringify(snapshot);
      if (typeof serialized !== "string") throw new TypeError("Snapshot is not serializable.");
      plaintext = serialized;
    } catch {
      throw new CatalogStoreError("invalid_snapshot", "Project snapshot is not valid JSON.");
    }
    if (Buffer.byteLength(plaintext, "utf8") > MAX_SNAPSHOT_BYTES) {
      throw new CatalogStoreError(
        "snapshot_too_large",
        "Project snapshot exceeds the 4 MiB catalog limit.",
      );
    }
    // Use the exact JSON value that will be encrypted so caller mutation cannot
    // change the project key, audit version, or response during an async write.
    const persistedSnapshot = JSON.parse(plaintext) as DwiProjectSnapshot;
    const persistedValidation = validateProjectSnapshot(persistedSnapshot);
    if (!persistedValidation.valid) {
      throw new CatalogStoreError(
        "invalid_snapshot",
        "The serialized project snapshot failed catalog validation.",
      );
    }
    assertCatalogSnapshotPolicy(persistedSnapshot, this.allowInlineEvidenceContent);
    const projectId = persistedSnapshot.metadata.id;
    const snapshotHash = catalogSnapshotHash(persistedSnapshot);
    const precondition = options.precondition
      ? { ...options.precondition } as CatalogWritePrecondition
      : undefined;

    await this.ensureDirectory();
    const projectHash = hashProjectId(projectId);
    return this.withProjectWriteLock(projectHash, async () => {
      if (precondition) {
        const current = await this.readSnapshot(projectId);
        enforceWritePrecondition(precondition, current);
      }

      const target = this.snapshotPath(projectId);
      const envelope = `${JSON.stringify(this.encrypt(plaintext, projectHash))}\n`;
      await atomicWrite(target, envelope, this.directory);
      await this.audit({
        principal,
        action: "snapshot.write",
        projectId,
        snapshotHash,
      });
      return summary(persistedSnapshot);
    });
  }

  async get(projectId: string, principal: string): Promise<DwiProjectSnapshot | undefined> {
    assertProjectId(projectId);
    assertPrincipal(principal);

    const snapshot = await this.readSnapshot(projectId);
    if (!snapshot) return undefined;
    await this.audit({
      principal,
      action: "snapshot.read",
      projectId,
      snapshotHash: catalogSnapshotHash(snapshot),
    });
    return snapshot;
  }

  async list(principal: string): Promise<CatalogProjectSummary[]> {
    assertPrincipal(principal);
    await this.ensureDirectory();
    const files = (await readdir(this.directory))
      .filter((name) => /^[a-f0-9]{64}\.snapshot\.enc$/.test(name))
      .sort();
    const snapshots = await Promise.all(
      files.map(async (name) => {
        const projectHash = name.slice(0, 64);
        return this.decrypt(
          parseEnvelope(
            await readBoundedFile(join(this.directory, name), MAX_ENCRYPTED_FILE_BYTES),
          ),
          projectHash,
        );
      }),
    );
    await this.audit({ principal, action: "snapshot.list" });
    return snapshots
      .map(summary)
      .sort((left, right) =>
        `${left.namespace}/${left.name}`.localeCompare(`${right.namespace}/${right.name}`),
      );
  }

  private async readSnapshot(projectId: string): Promise<DwiProjectSnapshot | undefined> {
    let serialized: string;
    try {
      serialized = await readBoundedFile(this.snapshotPath(projectId), MAX_ENCRYPTED_FILE_BYTES);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
    return this.decrypt(parseEnvelope(serialized), hashProjectId(projectId));
  }

  private withProjectWriteLock<T>(projectHash: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.projectWriteQueues.get(projectHash) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.projectWriteQueues.set(projectHash, tail);
    return result.finally(() => {
      if (this.projectWriteQueues.get(projectHash) === tail) {
        this.projectWriteQueues.delete(projectHash);
      }
    });
  }

  private snapshotPath(projectId: string): string {
    return join(
      this.directory,
      `${hashProjectId(projectId)}.snapshot.enc`,
    );
  }

  private encrypt(plaintext: string, projectHash: string): EncryptedEnvelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(envelopeAad(projectHash));
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return {
      version: 1,
      algorithm: "aes-256-gcm",
      projectHash,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  }

  private decrypt(envelope: EncryptedEnvelope, expectedProjectHash: string): DwiProjectSnapshot {
    try {
      if (envelope.projectHash !== expectedProjectHash) {
        throw new CatalogStoreError(
          "corrupt_data",
          "Stored catalog envelope does not match its project key.",
        );
      }
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key,
        decodeBase64(envelope.iv, "initialization vector", 12),
      );
      decipher.setAAD(envelopeAad(envelope.projectHash));
      decipher.setAuthTag(decodeBase64(envelope.tag, "authentication tag", 16));
      const plaintext = Buffer.concat([
        decipher.update(decodeBase64(envelope.ciphertext, "ciphertext")),
        decipher.final(),
      ]);
      if (plaintext.byteLength > MAX_SNAPSHOT_BYTES) {
        throw new CatalogStoreError(
          "corrupt_data",
          "Stored DWI project snapshot exceeds the supported size.",
        );
      }
      const value = JSON.parse(plaintext.toString("utf8")) as unknown;
      const validation = validateProjectSnapshot(value);
      if (!validation.valid) {
        throw new CatalogStoreError(
          "corrupt_data",
          "Stored DWI project snapshot failed schema validation.",
        );
      }
      assertCatalogSnapshotPolicy(
        value as DwiProjectSnapshot,
        this.allowInlineEvidenceContent,
      );
      if (hashProjectId((value as DwiProjectSnapshot).metadata.id) !== expectedProjectHash) {
        throw new CatalogStoreError(
          "corrupt_data",
          "Stored DWI project snapshot does not match its project key.",
        );
      }
      return value as DwiProjectSnapshot;
    } catch (error) {
      if (error instanceof CatalogStoreError) throw error;
      throw new CatalogStoreError(
        "corrupt_data",
        "Stored DWI project snapshot could not be authenticated or decoded.",
      );
    }
  }

  private async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  private audit(event: Omit<CatalogAuditEvent, "timestamp">): Promise<void> {
    const append = async (): Promise<void> => {
      await this.ensureDirectory();
      const handle = await open(this.auditPath, "a", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify({ timestamp: this.now(), ...event })}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
    };

    const pending = this.auditQueue.then(append, append);
    this.auditQueue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
}

function parseEnvelope(serialized: string): EncryptedEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new CatalogStoreError("corrupt_data", "Stored catalog envelope is not valid JSON.");
  }
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.algorithm !== "aes-256-gcm" ||
    typeof value.projectHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.projectHash) ||
    typeof value.iv !== "string" ||
    typeof value.tag !== "string" ||
    typeof value.ciphertext !== "string"
  ) {
    throw new CatalogStoreError("corrupt_data", "Stored catalog envelope is not supported.");
  }
  return value as unknown as EncryptedEnvelope;
}

function decodeBase64(value: string, label: string, expectedBytes?: number): Buffer {
  if (
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new CatalogStoreError("corrupt_data", `Stored catalog ${label} is malformed.`);
  }
  const decoded = Buffer.from(value, "base64");
  if (
    decoded.toString("base64") !== value ||
    (expectedBytes !== undefined && decoded.byteLength !== expectedBytes)
  ) {
    throw new CatalogStoreError("corrupt_data", `Stored catalog ${label} is malformed.`);
  }
  return decoded;
}

async function readBoundedFile(path: string, maximumBytes: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    if (size > maximumBytes) {
      throw new CatalogStoreError("corrupt_data", "Stored catalog envelope exceeds the size limit.");
    }
    const contents = await handle.readFile();
    if (contents.byteLength > maximumBytes) {
      throw new CatalogStoreError("corrupt_data", "Stored catalog envelope exceeds the size limit.");
    }
    return contents.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function atomicWrite(path: string, contents: string, directory: string): Promise<void> {
  const temporaryPath = join(
    directory,
    `.snapshot-${process.pid}-${randomBytes(12).toString("hex")}.tmp`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, path);
    await syncDirectory(directory);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function syncDirectory(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(directory, "r");
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EPERM") throw error;
  } finally {
    await handle?.close();
  }
}

function assertPrincipal(principal: string): void {
  if (!isSafeIdentifier(principal, 200)) {
    throw new CatalogStoreError("invalid_input", "Catalog principal is invalid.");
  }
}

function assertProjectId(projectId: string): void {
  if (!isSafeIdentifier(projectId, 512)) {
    throw new CatalogStoreError("invalid_input", "Catalog project ID is invalid.");
  }
}

function assertCatalogSnapshotPolicy(
  snapshot: DwiProjectSnapshot,
  allowInlineEvidenceContent: boolean,
): void {
  if (snapshot.metadata.review.state !== "approved") {
    throw new CatalogStoreError(
      "snapshot_not_approved",
      "Only snapshots with metadata.review.state set to approved may be cataloged.",
    );
  }
  const reviewedSnapshotHash = snapshot.metadata.review.reviewedSnapshotHash;
  if (reviewedSnapshotHash === undefined) {
    throw new CatalogStoreError(
      "review_binding_required",
      "Approved snapshots must include metadata.review.reviewedSnapshotHash.",
    );
  }
  if (reviewedSnapshotHash !== projectSnapshotReviewHash(snapshot)) {
    throw new CatalogStoreError(
      "invalid_snapshot",
      "The approved snapshot no longer matches its reviewed snapshot hash.",
    );
  }
  if (!allowInlineEvidenceContent && snapshotContainsInlineEvidenceContent(snapshot)) {
    throw new CatalogStoreError(
      "inline_evidence_forbidden",
      "Inline evidence content is disabled; catalog evidence by digest and selector instead.",
    );
  }
}

export function snapshotContainsInlineEvidenceContent(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.evidence)) return false;
  return value.evidence.some(
    (evidence) => isRecord(evidence) && typeof evidence.content === "string",
  );
}

function enforceWritePrecondition(
  precondition: CatalogWritePrecondition,
  current: DwiProjectSnapshot | undefined,
): void {
  if (precondition.kind === "create") {
    if (current) {
      throw new CatalogStoreError(
        "precondition_failed",
        "The project already exists; use If-Match with its current ETag.",
        catalogSnapshotHash(current),
      );
    }
    return;
  }

  if (!current) {
    throw new CatalogStoreError(
      "precondition_failed",
      "The project does not exist; use If-None-Match: * to create it.",
    );
  }
  const currentSnapshotHash = catalogSnapshotHash(current);
  if (currentSnapshotHash !== precondition.snapshotHash) {
    throw new CatalogStoreError(
      "precondition_failed",
      "The project changed after it was read; retry with the current ETag.",
      currentSnapshotHash,
    );
  }
}

function isSnapshotHash(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function isSafeIdentifier(value: string, maximumLength: number): boolean {
  return value.length > 0 &&
    value.length <= maximumLength &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hashProjectId(projectId: string): string {
  return createHash("sha256").update(projectId).digest("hex");
}

function envelopeAad(projectHash: string): Buffer {
  return Buffer.concat([ENVELOPE_AAD, Buffer.from(":", "utf8"), Buffer.from(projectHash, "ascii")]);
}

/**
 * Integrity/version hash for the complete persisted record. Unlike
 * resolution.effectiveSnapshotHash, this changes when evidence, claims,
 * review, revision, proposals, or unknowns change.
 */
export function catalogSnapshotHash(snapshot: DwiProjectSnapshot): string {
  return `sha256:${sha256Hex(canonicalJsonStringify(snapshot))}`;
}

function summary(snapshot: DwiProjectSnapshot): CatalogProjectSummary {
  return {
    id: snapshot.metadata.id,
    name: snapshot.metadata.name,
    namespace: snapshot.metadata.namespace,
    status: snapshot.resolution.status,
    generatedAt: snapshot.metadata.revision.generatedAt,
    snapshotHash: catalogSnapshotHash(snapshot),
    effectiveSnapshotHash: snapshot.resolution.effectiveSnapshotHash,
    evidenceCount: snapshot.evidence.length,
    unresolvedCount:
      snapshot.resolution.conflicts.length +
      snapshot.resolution.unknowns.filter(({ required }) => required).length,
  };
}
