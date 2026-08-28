import { randomUUID } from "node:crypto";
import {
  PROMPT_USER_TEMPLATE_LIMIT,
  isEntityId,
  validatePromptTemplate,
  validatePromptTemplateInput,
  type PromptTemplate,
  type PromptTemplateInput,
} from "@platform/domain-prompt-optimizer";
import {
  TEMPLATE_LIBRARY_BACKEND_SCHEMA,
  validateTemplateLibraryBackendAck,
  validateTemplateLibraryManagedSnapshot,
  type TemplateLibraryBackend,
  type TemplateLibraryDeleteMetadata,
  type TemplateLibraryFeedbackMetadata,
  type TemplateLibrarySaveMetadata,
} from "./template-library-backend.js";
import type {
  TemplateLibraryDetail,
  TemplateLibraryFeedbackRating,
  TemplateLibraryFeedbackStars,
  TemplateLibraryKind,
  TemplateLibraryState,
  TemplateLibrarySummary,
  TemplateLibraryVersionSummary,
} from "./template-library-protocol.js";
import {
  TEMPLATE_FEEDBACK_NOTE_LIMIT_CHARS,
  containsBinaryLikeText,
  isTemplateLibraryFeedbackStars,
  templateLibraryRatingForStars,
} from "./template-library-protocol.js";

export const TEMPLATE_LIBRARY_STORAGE_KEY = "dwi.templateLibrary.v1";
export const TEMPLATE_LIBRARY_SCHEMA = "dwi.template-library.v1" as const;
export const TEMPLATE_LIBRARY_REVISION_HISTORY_LIMIT = 5;
const TEMPLATE_LIBRARY_REVISION_HISTORY_TOTAL_LIMIT = PROMPT_USER_TEMPLATE_LIMIT * TEMPLATE_LIBRARY_REVISION_HISTORY_LIMIT;
const TEMPLATE_LIBRARY_RECENT_LIMIT = 5;
const TEMPLATE_LIBRARY_REVIEWED_LIMIT = 100;
const TEMPLATE_LIBRARY_DELETION_LIMIT = 50;
const TEMPLATE_LIBRARY_OPERATION_LIMIT = 200;

export type TemplateLibraryRevisionAction = "save" | "delete" | "feedback";

export interface TemplateLibraryRevisionMetadata {
  revision: number;
  operationId: string;
  action: TemplateLibraryRevisionAction;
  templateId: string;
  timestamp: string;
}

export interface TemplateLibraryRecentMetadata {
  templateId: string;
  openedAt: string;
}

export interface TemplateLibraryReviewedMetadata {
  templateId: string;
  reviewedAt: string;
}

export interface TemplateLibraryOperationMetadata {
  operationId: string;
  action: TemplateLibraryRevisionAction;
  templateId: string;
  revision: number;
  appliedAt: string;
}

export interface TemplateLibraryDeletionTombstone {
  tombstoneId: string;
  operationId: string;
  templateId: string;
  deletedAt: string;
  revision: number;
}

export interface TemplateLibraryAcknowledgedTombstone extends TemplateLibraryDeletionTombstone {
  ackId: string;
  acknowledgedAt: string;
}

export interface TemplateLibraryEnvelope {
  schema: typeof TEMPLATE_LIBRARY_SCHEMA;
  revision: number;
  personal: PromptTemplate[];
  revisionHistory: TemplateLibraryRevisionMetadata[];
  appliedOperations: TemplateLibraryOperationMetadata[];
  recents: TemplateLibraryRecentMetadata[];
  reviewed: TemplateLibraryReviewedMetadata[];
  deletionOutbox: TemplateLibraryDeletionTombstone[];
  tombstones: TemplateLibraryAcknowledgedTombstone[];
}

export interface TemplateLibraryStateStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export type TemplateLibraryStoreErrorCode = "conflict" | "not-found" | "immutable" | "limit" | "storage";

export class TemplateLibraryStoreError extends Error {
  constructor(
    readonly code: TemplateLibraryStoreErrorCode,
    message: string,
    readonly currentRevision?: number,
  ) {
    super(message);
    this.name = "TemplateLibraryStoreError";
  }
}

export interface TemplateLibrarySaveResult {
  state: TemplateLibraryState;
  detail: TemplateLibraryDetail;
  published: boolean;
}

export interface TemplateLibraryDeleteResult {
  state: TemplateLibraryState;
  templateId: string;
  published: boolean;
}

export interface TemplateLibraryFeedbackResult {
  state: TemplateLibraryState;
  templateId: string;
  rating: TemplateLibraryFeedbackRating;
  stars: TemplateLibraryFeedbackStars;
  reviewedAt: string;
  published: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === required.length && required.every((key) => keys.includes(key));
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function cloneTemplate(template: PromptTemplate): PromptTemplate {
  return {
    id: template.id,
    builtIn: template.builtIn,
    name: template.name,
    description: template.description,
    promptType: template.promptType,
    prompt: template.prompt,
    fields: { ...template.fields },
    recommendedGuidancePackIds: [...template.recommendedGuidancePackIds],
    ...(template.createdAt ? { createdAt: template.createdAt } : {}),
    ...(template.updatedAt ? { updatedAt: template.updatedAt } : {}),
  };
}

function defaultEnvelope(): TemplateLibraryEnvelope {
  return {
    schema: TEMPLATE_LIBRARY_SCHEMA,
    revision: 0,
    personal: [],
    revisionHistory: [],
    appliedOperations: [],
    recents: [],
    reviewed: [],
    deletionOutbox: [],
    tombstones: [],
  };
}

function parseRevisionMetadata(value: unknown): TemplateLibraryRevisionMetadata | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["revision", "operationId", "action", "templateId", "timestamp"]) ||
      !isRevision(value.revision) || !isEntityId(value.operationId) || !isEntityId(value.templateId) ||
      (value.action !== "save" && value.action !== "delete" && value.action !== "feedback") || !isIsoTimestamp(value.timestamp)) return undefined;
  return {
    revision: value.revision,
    operationId: value.operationId,
    action: value.action,
    templateId: value.templateId,
    timestamp: value.timestamp,
  };
}

function parseRecent(value: unknown): TemplateLibraryRecentMetadata | undefined {
  return isRecord(value) && hasExactKeys(value, ["templateId", "openedAt"]) && isEntityId(value.templateId) && isIsoTimestamp(value.openedAt)
    ? { templateId: value.templateId, openedAt: value.openedAt }
    : undefined;
}

function parseOperationMetadata(value: unknown): TemplateLibraryOperationMetadata | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["operationId", "action", "templateId", "revision", "appliedAt"]) ||
      !isEntityId(value.operationId) || !isEntityId(value.templateId) || !isRevision(value.revision) ||
      (value.action !== "save" && value.action !== "delete" && value.action !== "feedback") || !isIsoTimestamp(value.appliedAt)) return undefined;
  return {
    operationId: value.operationId,
    action: value.action,
    templateId: value.templateId,
    revision: value.revision,
    appliedAt: value.appliedAt,
  };
}

function parseReviewed(value: unknown): TemplateLibraryReviewedMetadata | undefined {
  return isRecord(value) && hasExactKeys(value, ["templateId", "reviewedAt"]) && isEntityId(value.templateId) && isIsoTimestamp(value.reviewedAt)
    ? { templateId: value.templateId, reviewedAt: value.reviewedAt }
    : undefined;
}

function parseTombstone(value: unknown): TemplateLibraryDeletionTombstone | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["tombstoneId", "operationId", "templateId", "deletedAt", "revision"]) ||
      !isEntityId(value.tombstoneId) || !isEntityId(value.operationId) || !isEntityId(value.templateId) ||
      !isIsoTimestamp(value.deletedAt) || !isRevision(value.revision)) return undefined;
  return {
    tombstoneId: value.tombstoneId,
    operationId: value.operationId,
    templateId: value.templateId,
    deletedAt: value.deletedAt,
    revision: value.revision,
  };
}

function parseAcknowledgedTombstone(value: unknown): TemplateLibraryAcknowledgedTombstone | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["tombstoneId", "operationId", "templateId", "deletedAt", "revision", "ackId", "acknowledgedAt"])) return undefined;
  const tombstone = parseTombstone({
    tombstoneId: value.tombstoneId,
    operationId: value.operationId,
    templateId: value.templateId,
    deletedAt: value.deletedAt,
    revision: value.revision,
  });
  return tombstone && isEntityId(value.ackId) && isIsoTimestamp(value.acknowledgedAt)
    ? { ...tombstone, ackId: value.ackId, acknowledgedAt: value.acknowledgedAt }
    : undefined;
}

export function parseTemplateLibraryEnvelope(value: unknown): TemplateLibraryEnvelope | undefined {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schema", "revision", "personal", "revisionHistory", "appliedOperations", "recents", "reviewed", "deletionOutbox", "tombstones",
  ]) || value.schema !== TEMPLATE_LIBRARY_SCHEMA || !isRevision(value.revision) ||
      !Array.isArray(value.personal) || value.personal.length > PROMPT_USER_TEMPLATE_LIMIT ||
      !Array.isArray(value.revisionHistory) || value.revisionHistory.length > TEMPLATE_LIBRARY_REVISION_HISTORY_TOTAL_LIMIT ||
      !Array.isArray(value.appliedOperations) || value.appliedOperations.length > TEMPLATE_LIBRARY_OPERATION_LIMIT ||
      !Array.isArray(value.recents) || value.recents.length > TEMPLATE_LIBRARY_RECENT_LIMIT ||
      !Array.isArray(value.reviewed) || value.reviewed.length > TEMPLATE_LIBRARY_REVIEWED_LIMIT ||
      !Array.isArray(value.deletionOutbox) || value.deletionOutbox.length > TEMPLATE_LIBRARY_DELETION_LIMIT ||
      !Array.isArray(value.tombstones) || value.tombstones.length > TEMPLATE_LIBRARY_DELETION_LIMIT) return undefined;
  const envelopeRevision = value.revision as number;

  let personal: PromptTemplate[];
  try {
    personal = value.personal.map((item) => validatePromptTemplate(item)).map(cloneTemplate);
  } catch {
    return undefined;
  }
  if (personal.some(({ builtIn }) => builtIn) || new Set(personal.map(({ id }) => id)).size !== personal.length) return undefined;

  const revisionHistory = value.revisionHistory.map(parseRevisionMetadata);
  const appliedOperations = value.appliedOperations.map(parseOperationMetadata);
  const recents = value.recents.map(parseRecent);
  const reviewed = value.reviewed.map(parseReviewed);
  const deletionOutbox = value.deletionOutbox.map(parseTombstone);
  const tombstones = value.tombstones.map(parseAcknowledgedTombstone);
  if ([...revisionHistory, ...appliedOperations, ...recents, ...reviewed, ...deletionOutbox, ...tombstones].some((item) => item === undefined)) return undefined;
  const safeRevisionHistory = revisionHistory as TemplateLibraryRevisionMetadata[];
  const safeAppliedOperations = appliedOperations as TemplateLibraryOperationMetadata[];
  const safeRecents = recents as TemplateLibraryRecentMetadata[];
  const safeReviewed = reviewed as TemplateLibraryReviewedMetadata[];
  const safeDeletionOutbox = deletionOutbox as TemplateLibraryDeletionTombstone[];
  const safeTombstones = tombstones as TemplateLibraryAcknowledgedTombstone[];
  const historyCounts = new Map<string, number>();
  for (const row of safeRevisionHistory) {
    const count = (historyCounts.get(row.templateId) ?? 0) + 1;
    if (count > TEMPLATE_LIBRARY_REVISION_HISTORY_LIMIT) return undefined;
    historyCounts.set(row.templateId, count);
  }
  const allRevisioned = [...safeRevisionHistory, ...safeAppliedOperations, ...safeDeletionOutbox, ...safeTombstones];
  const pendingIds = new Set(safeDeletionOutbox.map(({ tombstoneId }) => tombstoneId));
  const acknowledgedIds = new Set(safeTombstones.map(({ tombstoneId }) => tombstoneId));
  if (allRevisioned.some(({ revision }) => revision === 0 || revision > envelopeRevision) ||
      new Set(safeRevisionHistory.map(({ operationId }) => operationId)).size !== safeRevisionHistory.length ||
      new Set(safeRevisionHistory.map(({ revision }) => revision)).size !== safeRevisionHistory.length ||
      new Set(safeAppliedOperations.map(({ operationId }) => operationId)).size !== safeAppliedOperations.length ||
      new Set(safeAppliedOperations.map(({ revision }) => revision)).size !== safeAppliedOperations.length ||
      new Set(safeRecents.map(({ templateId }) => templateId)).size !== safeRecents.length ||
      new Set(safeReviewed.map(({ templateId }) => templateId)).size !== safeReviewed.length ||
      pendingIds.size !== safeDeletionOutbox.length || acknowledgedIds.size !== safeTombstones.length ||
      safeDeletionOutbox.some(({ tombstoneId }) => acknowledgedIds.has(tombstoneId)) ||
      new Set([...safeDeletionOutbox, ...safeTombstones].map(({ operationId }) => operationId)).size !== safeDeletionOutbox.length + safeTombstones.length ||
      new Set(safeTombstones.map(({ ackId }) => ackId)).size !== safeTombstones.length ||
      (envelopeRevision === 0 ? safeAppliedOperations.length !== 0 : !safeAppliedOperations.some(({ revision }) => revision === envelopeRevision))) return undefined;

  return {
    schema: TEMPLATE_LIBRARY_SCHEMA,
    revision: envelopeRevision,
    personal,
    revisionHistory: safeRevisionHistory,
    appliedOperations: safeAppliedOperations,
    recents: safeRecents,
    reviewed: safeReviewed,
    deletionOutbox: safeDeletionOutbox,
    tombstones: safeTombstones,
  };
}

function withoutTemplateId(input: PromptTemplateInput): Omit<PromptTemplateInput, "templateId"> {
  return {
    name: input.name,
    description: input.description,
    promptType: input.promptType,
    prompt: input.prompt,
    fields: { ...input.fields },
    recommendedGuidancePackIds: [...input.recommendedGuidancePackIds],
  };
}

export class TemplateLibraryStore {
  private managed: PromptTemplate[] = [];
  private managedLoaded = false;
  private managedLoading: Promise<void> | undefined;
  private readonly feedbackRetries = new Map<string, {
    templateId: string;
    rating: TemplateLibraryFeedbackRating;
    stars: TemplateLibraryFeedbackStars;
    note?: string;
  }>();

  constructor(
    private readonly storage: TemplateLibraryStateStorage,
    private readonly backend: TemplateLibraryBackend,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => randomUUID(),
  ) {}

  async open(): Promise<TemplateLibraryState> {
    await this.ensureManaged();
    const envelope = await this.flushDeletionOutbox(this.load());
    return this.toState(envelope);
  }

  async get(templateId: string): Promise<TemplateLibraryDetail> {
    await this.ensureManaged();
    let envelope = this.load();
    if (!isEntityId(templateId)) throw new TemplateLibraryStoreError("not-found", "The selected template is no longer available.", envelope.revision);
    const template = this.findTemplate(envelope, templateId);
    if (!template) throw new TemplateLibraryStoreError("not-found", "The selected template is no longer available.", envelope.revision);
    const openedAt = this.timestamp();
    envelope = {
      ...envelope,
      recents: [{ templateId, openedAt }, ...envelope.recents.filter((item) => item.templateId !== templateId)].slice(0, TEMPLATE_LIBRARY_RECENT_LIMIT),
    };
    await this.persist(envelope);
    return this.detail(envelope, template);
  }

  /** Resolves a fresh copy after managed hydration without changing Recents
   * or any other Library metadata. */
  async resolve(templateId: string): Promise<PromptTemplate | undefined> {
    await this.ensureManaged();
    if (!isEntityId(templateId)) return undefined;
    const template = this.findTemplate(this.load(), templateId);
    return template ? cloneTemplate(template) : undefined;
  }

  async save(operationId: string, expectedRevision: number, candidate: PromptTemplateInput): Promise<TemplateLibrarySaveResult> {
    await this.ensureManaged();
    const envelope = this.load();
    this.assertMutation(envelope, operationId, expectedRevision);
    const input = validatePromptTemplateInput(candidate);
    const requestedId = input.templateId;
    if (requestedId && this.managed.some(({ id }) => id === requestedId)) {
      throw new TemplateLibraryStoreError("immutable", "Managed templates cannot be changed.", envelope.revision);
    }
    const current = requestedId ? envelope.personal.find(({ id }) => id === requestedId) : undefined;
    if (requestedId && !current) throw new TemplateLibraryStoreError("not-found", "The personal template is no longer available.", envelope.revision);
    if (!current && envelope.personal.length >= PROMPT_USER_TEMPLATE_LIMIT) {
      throw new TemplateLibraryStoreError("limit", `You can keep up to ${PROMPT_USER_TEMPLATE_LIMIT} personal templates.`, envelope.revision);
    }

    const timestamp = this.timestamp();
    const id = current?.id ?? this.newEntityId("template", new Set([
      ...this.managed.map(({ id: managedId }) => managedId),
      ...envelope.personal.map(({ id: personalId }) => personalId),
    ]));
    const template = validatePromptTemplate({
      id,
      builtIn: false,
      ...withoutTemplateId(input),
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    const revision = envelope.revision + 1;
    const updated: TemplateLibraryEnvelope = {
      ...envelope,
      revision,
      personal: current
        ? envelope.personal.map((item) => item.id === id ? cloneTemplate(template) : item)
        : [cloneTemplate(template), ...envelope.personal],
      revisionHistory: this.withRevision(envelope, { revision, operationId, action: "save", templateId: id, timestamp }),
      appliedOperations: this.withAppliedOperation(envelope, {
        operationId,
        action: "save",
        templateId: id,
        revision,
        appliedAt: timestamp,
      }),
      recents: [{ templateId: id, openedAt: timestamp }, ...envelope.recents.filter((item) => item.templateId !== id)]
        .slice(0, TEMPLATE_LIBRARY_RECENT_LIMIT),
    };
    await this.persist(updated);
    const metadata: TemplateLibrarySaveMetadata = {
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      action: "save",
      operationId,
      templateId: id,
      templateKind: "personal",
      libraryRevision: revision,
      occurredAt: timestamp,
    };
    const published = await this.publish(() => this.backend.upsertPersonal(metadata, cloneTemplate(template)), operationId);
    return { state: this.toState(updated), detail: this.detail(updated, template), published };
  }

  async delete(operationId: string, expectedRevision: number, templateId: string): Promise<TemplateLibraryDeleteResult> {
    await this.ensureManaged();
    const envelope = this.load();
    this.assertMutation(envelope, operationId, expectedRevision);
    if (!isEntityId(templateId)) throw new TemplateLibraryStoreError("conflict", "The template deletion is invalid.", envelope.revision);
    if (this.managed.some(({ id }) => id === templateId)) {
      throw new TemplateLibraryStoreError("immutable", "Managed templates cannot be deleted.", envelope.revision);
    }
    if (!envelope.personal.some(({ id }) => id === templateId)) {
      throw new TemplateLibraryStoreError("not-found", "The personal template is no longer available.", envelope.revision);
    }
    if (envelope.deletionOutbox.length >= TEMPLATE_LIBRARY_DELETION_LIMIT) {
      throw new TemplateLibraryStoreError(
        "storage",
        "Pending template deletions must be published before another template can be deleted.",
        envelope.revision,
      );
    }
    const deletedAt = this.timestamp();
    const revision = envelope.revision + 1;
    const tombstone: TemplateLibraryDeletionTombstone = {
      tombstoneId: this.newEntityId("tombstone", new Set([
        ...envelope.deletionOutbox.map(({ tombstoneId }) => tombstoneId),
        ...envelope.tombstones.map(({ tombstoneId }) => tombstoneId),
      ])),
      operationId,
      templateId,
      deletedAt,
      revision,
    };
    const locallyDeleted: TemplateLibraryEnvelope = {
      ...envelope,
      revision,
      personal: envelope.personal.filter(({ id }) => id !== templateId),
      recents: envelope.recents.filter((item) => item.templateId !== templateId),
      reviewed: envelope.reviewed.filter((item) => item.templateId !== templateId),
      appliedOperations: this.withAppliedOperation(envelope, {
        operationId,
        action: "delete",
        templateId,
        revision,
        appliedAt: deletedAt,
      }),
      deletionOutbox: [tombstone, ...envelope.deletionOutbox],
    };

    // Persist first: template content is cleared locally before any future
    // backend publication sees the metadata-only tombstone.
    await this.persist(locallyDeleted);
    const published = await this.publishDeletion(tombstone);
    const finalEnvelope = this.load();
    return { state: this.toState(finalEnvelope), templateId, published };
  }

  async submitFeedback(
    operationId: string,
    expectedRevision: number,
    templateId: string,
    rating: TemplateLibraryFeedbackRating,
    stars: TemplateLibraryFeedbackStars,
    note?: string,
  ): Promise<TemplateLibraryFeedbackResult> {
    await this.ensureManaged();
    const envelope = this.load();
    if ((rating !== "helpful" && rating !== "mixed" && rating !== "not-helpful") ||
        !isTemplateLibraryFeedbackStars(stars) || templateLibraryRatingForStars(stars) !== rating ||
        !isEntityId(templateId) ||
        (note !== undefined && (typeof note !== "string" || note.length > TEMPLATE_FEEDBACK_NOTE_LIMIT_CHARS || containsBinaryLikeText(note)))) {
      throw new TemplateLibraryStoreError("conflict", "The template feedback is invalid.", envelope.revision);
    }
    const template = this.findTemplate(envelope, templateId);
    if (!template) throw new TemplateLibraryStoreError("not-found", "The selected template is no longer available.", envelope.revision);
    const deliveredNote = note?.length ? note : undefined;
    const replay = envelope.appliedOperations.find(({ operationId: appliedId }) => appliedId === operationId);
    if (replay) {
      const retry = this.feedbackRetries.get(operationId);
      if (replay.action !== "feedback" || replay.templateId !== templateId || expectedRevision !== envelope.revision ||
          !retry || retry.templateId !== templateId || retry.rating !== rating || retry.stars !== stars ||
          retry.note !== deliveredNote) {
        throw new TemplateLibraryStoreError("conflict", "This template library operation was already applied.", envelope.revision);
      }
      const replayMetadata: TemplateLibraryFeedbackMetadata = {
        schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
        action: "feedback",
        operationId,
        templateId,
        templateKind: template.builtIn ? "managed" : "personal",
        libraryRevision: replay.revision,
        occurredAt: replay.appliedAt,
        rating,
        stars,
        notePresent: Boolean(deliveredNote),
        noteChars: deliveredNote?.length ?? 0,
      };
      const published = await this.publish(
        () => this.backend.publishFeedback(replayMetadata, deliveredNote),
        operationId,
      );
      if (published) this.feedbackRetries.delete(operationId);
      return {
        state: this.toState(envelope),
        templateId,
        rating,
        stars,
        reviewedAt: replay.appliedAt,
        published,
      };
    }
    this.assertMutation(envelope, operationId, expectedRevision);
    const reviewedAt = this.timestamp();
    const revision = envelope.revision + 1;
    const updated: TemplateLibraryEnvelope = {
      ...envelope,
      revision,
      reviewed: [{ templateId, reviewedAt }, ...envelope.reviewed.filter((item) => item.templateId !== templateId)].slice(0, TEMPLATE_LIBRARY_REVIEWED_LIMIT),
      appliedOperations: this.withAppliedOperation(envelope, {
        operationId,
        action: "feedback",
        templateId,
        revision,
        appliedAt: reviewedAt,
      }),
    };
    await this.persist(updated);
    const metadata: TemplateLibraryFeedbackMetadata = {
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      action: "feedback",
      operationId,
      templateId,
      templateKind: template.builtIn ? "managed" : "personal",
      libraryRevision: revision,
      occurredAt: reviewedAt,
      rating,
      stars,
      notePresent: Boolean(deliveredNote),
      noteChars: deliveredNote?.length ?? 0,
    };
    this.feedbackRetries.set(operationId, {
      templateId,
      rating,
      stars,
      ...(deliveredNote !== undefined ? { note: deliveredNote } : {}),
    });
    while (this.feedbackRetries.size > TEMPLATE_LIBRARY_OPERATION_LIMIT) {
      const oldest = this.feedbackRetries.keys().next().value;
      if (oldest === undefined) break;
      this.feedbackRetries.delete(oldest);
    }
    const published = await this.publish(() => this.backend.publishFeedback(metadata, deliveredNote), operationId);
    if (published) this.feedbackRetries.delete(operationId);
    return { state: this.toState(updated), templateId, rating, stars, reviewedAt, published };
  }

  private load(): TemplateLibraryEnvelope {
    let stored: unknown;
    try {
      stored = this.storage.get<unknown>(TEMPLATE_LIBRARY_STORAGE_KEY);
    } catch {
      throw new TemplateLibraryStoreError("storage", "DWI could not read the local template library state.");
    }
    if (stored === undefined) return defaultEnvelope();
    const envelope = parseTemplateLibraryEnvelope(stored);
    if (!envelope) throw new TemplateLibraryStoreError("storage", "The local template library state is invalid and was left unchanged.");
    return envelope;
  }

  private async persist(envelope: TemplateLibraryEnvelope): Promise<void> {
    const safe = parseTemplateLibraryEnvelope(envelope);
    if (!safe) throw new TemplateLibraryStoreError("storage", "DWI refused to persist invalid template library state.");
    try {
      await this.storage.update(TEMPLATE_LIBRARY_STORAGE_KEY, safe);
    } catch {
      throw new TemplateLibraryStoreError("storage", "DWI could not persist the local template library state.");
    }
  }

  private async ensureManaged(): Promise<void> {
    if (this.managedLoaded) return;
    const loading = this.managedLoading ?? (async () => {
      try {
        const response = validateTemplateLibraryManagedSnapshot(await this.backend.loadManaged());
        const personalIds = new Set(this.load().personal.map(({ id }) => id));
        if (response.templates.some(({ id }) => personalIds.has(id))) {
          throw new Error("Managed and personal template identifiers overlap.");
        }
        this.managed = response.templates.map(cloneTemplate);
        this.managedLoaded = true;
      } catch (error) {
        if (error instanceof TemplateLibraryStoreError) throw error;
        throw new TemplateLibraryStoreError("storage", "DWI could not validate the managed template library.");
      }
    })();
    this.managedLoading = loading;
    try {
      await loading;
    } finally {
      if (this.managedLoading === loading) this.managedLoading = undefined;
    }
  }

  private assertMutation(envelope: TemplateLibraryEnvelope, operationId: string, expectedRevision: number): void {
    if (!isEntityId(operationId) || !isRevision(expectedRevision)) {
      throw new TemplateLibraryStoreError("conflict", "The template library operation is invalid.", envelope.revision);
    }
    if (envelope.appliedOperations.some((row) => row.operationId === operationId) ||
        envelope.revisionHistory.some((row) => row.operationId === operationId) ||
        envelope.deletionOutbox.some((row) => row.operationId === operationId) ||
        envelope.tombstones.some((row) => row.operationId === operationId)) {
      throw new TemplateLibraryStoreError("conflict", "This template library operation was already applied.", envelope.revision);
    }
    if (expectedRevision !== envelope.revision) {
      throw new TemplateLibraryStoreError("conflict", "The template library changed. Reload it before trying again.", envelope.revision);
    }
  }

  private findTemplate(envelope: TemplateLibraryEnvelope, templateId: string): PromptTemplate | undefined {
    return this.managed.find(({ id }) => id === templateId) ?? envelope.personal.find(({ id }) => id === templateId);
  }

  private summary(envelope: TemplateLibraryEnvelope, template: PromptTemplate): TemplateLibrarySummary {
    const kind: TemplateLibraryKind = template.builtIn ? "managed" : "personal";
    return {
      id: template.id,
      kind,
      immutable: template.builtIn,
      name: template.name,
      description: template.description,
      promptType: template.promptType,
      ...(template.createdAt ? { createdAt: template.createdAt } : {}),
      ...(template.updatedAt ? { updatedAt: template.updatedAt } : {}),
      ...(envelope.recents.find(({ templateId }) => templateId === template.id)?.openedAt
        ? { lastOpenedAt: envelope.recents.find(({ templateId }) => templateId === template.id)!.openedAt }
        : {}),
      ...(envelope.reviewed.find(({ templateId }) => templateId === template.id)?.reviewedAt
        ? { reviewedAt: envelope.reviewed.find(({ templateId }) => templateId === template.id)!.reviewedAt }
        : {}),
    };
  }

  private detail(envelope: TemplateLibraryEnvelope, template: PromptTemplate): TemplateLibraryDetail {
    const versions: TemplateLibraryVersionSummary[] = template.builtIn
      ? [{ revision: 1, managed: true }]
      : envelope.revisionHistory
        .filter((row) => row.templateId === template.id && row.action === "save")
        .sort((left, right) => right.revision - left.revision)
        .slice(0, TEMPLATE_LIBRARY_REVISION_HISTORY_LIMIT)
        .map((row) => ({ revision: row.revision, managed: false, savedAt: row.timestamp }));
    return { revision: envelope.revision, summary: this.summary(envelope, template), template: cloneTemplate(template), versions };
  }

  private toState(envelope: TemplateLibraryEnvelope): TemplateLibraryState {
    const managed = this.managed.map((template) => this.summary(envelope, template));
    const personal = [...envelope.personal]
      .sort((left, right) => Date.parse(right.updatedAt ?? right.createdAt ?? "") - Date.parse(left.updatedAt ?? left.createdAt ?? ""))
      .map((template) => this.summary(envelope, template));
    const byId = new Map([...managed, ...personal].map((summary) => [summary.id, summary]));
    return {
      revision: envelope.revision,
      managed,
      personal,
      recent: envelope.recents.flatMap(({ templateId }) => {
        const summary = byId.get(templateId);
        return summary ? [summary] : [];
      }),
      personalLimit: PROMPT_USER_TEMPLATE_LIMIT,
      personalRemaining: Math.max(0, PROMPT_USER_TEMPLATE_LIMIT - personal.length),
    };
  }

  private withRevision(envelope: TemplateLibraryEnvelope, row: TemplateLibraryRevisionMetadata): TemplateLibraryRevisionMetadata[] {
    const sameTemplate = [row, ...envelope.revisionHistory.filter((item) => item.templateId === row.templateId)]
      .slice(0, TEMPLATE_LIBRARY_REVISION_HISTORY_LIMIT);
    return [...sameTemplate, ...envelope.revisionHistory.filter((item) => item.templateId !== row.templateId)]
      .sort((left, right) => right.revision - left.revision)
      .slice(0, TEMPLATE_LIBRARY_REVISION_HISTORY_TOTAL_LIMIT);
  }

  private withAppliedOperation(envelope: TemplateLibraryEnvelope, row: TemplateLibraryOperationMetadata): TemplateLibraryOperationMetadata[] {
    return [row, ...envelope.appliedOperations]
      .sort((left, right) => right.revision - left.revision)
      .slice(0, TEMPLATE_LIBRARY_OPERATION_LIMIT);
  }

  private timestamp(): string {
    const value = this.now();
    if (!isIsoTimestamp(value)) throw new TemplateLibraryStoreError("storage", "The template library clock returned an invalid timestamp.");
    return value;
  }

  private newEntityId(prefix: string, existing: ReadonlySet<string>): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const id = `${prefix}:${this.createId()}`;
      if (isEntityId(id) && !existing.has(id)) return id;
    }
    throw new TemplateLibraryStoreError("storage", "DWI could not create a unique local template identifier.");
  }

  private async publish(action: () => Promise<unknown>, operationId: string): Promise<boolean> {
    try {
      validateTemplateLibraryBackendAck(await action(), operationId);
      return true;
    } catch {
      return false;
    }
  }

  private async publishDeletion(tombstone: TemplateLibraryDeletionTombstone): Promise<boolean> {
    const metadata: TemplateLibraryDeleteMetadata = {
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      action: "delete",
      operationId: tombstone.operationId,
      templateId: tombstone.templateId,
      templateKind: "personal",
      libraryRevision: tombstone.revision,
      occurredAt: tombstone.deletedAt,
    };
    try {
      const ack = validateTemplateLibraryBackendAck(await this.backend.publishDelete(metadata), tombstone.operationId);
      const latest = this.load();
      if (!latest.deletionOutbox.some(({ tombstoneId }) => tombstoneId === tombstone.tombstoneId)) return true;
      await this.persist({
        ...latest,
        deletionOutbox: latest.deletionOutbox.filter(({ tombstoneId }) => tombstoneId !== tombstone.tombstoneId),
        tombstones: [{ ...tombstone, ackId: ack.ackId, acknowledgedAt: ack.acknowledgedAt }, ...latest.tombstones]
          .slice(0, TEMPLATE_LIBRARY_DELETION_LIMIT),
      });
      return true;
    } catch {
      return false;
    }
  }

  private async flushDeletionOutbox(envelope: TemplateLibraryEnvelope): Promise<TemplateLibraryEnvelope> {
    for (const tombstone of [...envelope.deletionOutbox].reverse()) await this.publishDeletion(tombstone);
    return this.load();
  }
}
