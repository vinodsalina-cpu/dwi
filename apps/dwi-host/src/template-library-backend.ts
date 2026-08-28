import { randomUUID } from "node:crypto";
import {
  BUILT_IN_PROMPT_TEMPLATES,
  PROMPT_USER_TEMPLATE_LIMIT,
  isEntityId,
  validatePromptTemplate,
  type PromptTemplate,
} from "@platform/domain-prompt-optimizer";
import {
  TEMPLATE_FEEDBACK_NOTE_LIMIT_CHARS,
  containsBinaryLikeText,
  isTemplateLibraryFeedbackStars,
  templateLibraryRatingForStars,
  type TemplateLibraryFeedbackRating,
  type TemplateLibraryFeedbackStars,
  type TemplateLibraryKind,
} from "./template-library-protocol.js";

export const TEMPLATE_LIBRARY_BACKEND_SCHEMA = "dwi.template-library.backend.v1" as const;
export const TEMPLATE_LIBRARY_MANAGED_LIMIT = 100;
export const TEMPLATE_LIBRARY_MOCK_FEEDBACK_LIMIT = 200;

interface TemplateLibraryBackendMetadataBase {
  schema: typeof TEMPLATE_LIBRARY_BACKEND_SCHEMA;
  operationId: string;
  templateId: string;
  templateKind: TemplateLibraryKind;
  libraryRevision: number;
  occurredAt: string;
}

export interface TemplateLibrarySaveMetadata extends TemplateLibraryBackendMetadataBase {
  action: "save";
}

export interface TemplateLibraryDeleteMetadata extends TemplateLibraryBackendMetadataBase {
  action: "delete";
}

export interface TemplateLibraryFeedbackMetadata extends TemplateLibraryBackendMetadataBase {
  action: "feedback";
  rating: TemplateLibraryFeedbackRating;
  stars: TemplateLibraryFeedbackStars;
  notePresent: boolean;
  noteChars: number;
}

export interface TemplateLibraryManagedSnapshot {
  schema: typeof TEMPLATE_LIBRARY_BACKEND_SCHEMA;
  templates: PromptTemplate[];
}

export interface TemplateLibraryBackendAck {
  schema: typeof TEMPLATE_LIBRARY_BACKEND_SCHEMA;
  operationId: string;
  ackId: string;
  acknowledgedAt: string;
}

export interface TemplateLibraryBackend {
  loadManaged(): Promise<TemplateLibraryManagedSnapshot>;
  upsertPersonal(metadata: TemplateLibrarySaveMetadata, template: PromptTemplate): Promise<TemplateLibraryBackendAck>;
  publishDelete(metadata: TemplateLibraryDeleteMetadata): Promise<TemplateLibraryBackendAck>;
  publishFeedback(metadata: TemplateLibraryFeedbackMetadata, note?: string): Promise<TemplateLibraryBackendAck>;
}

export interface TemplateLibraryMetadataLogger {
  appendLine(value: string): void;
}

export interface MockTemplateLibraryFeedbackRecord {
  metadata: TemplateLibraryFeedbackMetadata;
  note?: string;
}

export interface MockTemplateLibrarySnapshot {
  managed: PromptTemplate[];
  personal: PromptTemplate[];
  feedback: MockTemplateLibraryFeedbackRecord[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function parseBase(
  value: Record<string, unknown>,
  action: "save" | "delete" | "feedback",
  kinds: readonly TemplateLibraryKind[],
): TemplateLibraryBackendMetadataBase | undefined {
  if (value.schema !== TEMPLATE_LIBRARY_BACKEND_SCHEMA || value.action !== action ||
      !isEntityId(value.operationId) || !isEntityId(value.templateId) ||
      !kinds.includes(value.templateKind as TemplateLibraryKind) ||
      !Number.isSafeInteger(value.libraryRevision) || (value.libraryRevision as number) <= 0 ||
      !isIsoTimestamp(value.occurredAt)) return undefined;
  return {
    schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
    operationId: value.operationId,
    templateId: value.templateId,
    templateKind: value.templateKind as TemplateLibraryKind,
    libraryRevision: value.libraryRevision as number,
    occurredAt: value.occurredAt,
  };
}

export function validateTemplateLibrarySaveMetadata(value: unknown): TemplateLibrarySaveMetadata {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schema", "action", "operationId", "templateId", "templateKind", "libraryRevision", "occurredAt",
  ])) throw new Error("Invalid template library save metadata.");
  const base = parseBase(value, "save", ["personal"]);
  if (!base) throw new Error("Invalid template library save metadata.");
  return { ...base, templateKind: "personal", action: "save" };
}

export function validateTemplateLibraryDeleteMetadata(value: unknown): TemplateLibraryDeleteMetadata {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schema", "action", "operationId", "templateId", "templateKind", "libraryRevision", "occurredAt",
  ])) throw new Error("Invalid template library delete metadata.");
  const base = parseBase(value, "delete", ["personal"]);
  if (!base) throw new Error("Invalid template library delete metadata.");
  return { ...base, templateKind: "personal", action: "delete" };
}

export function validateTemplateLibraryFeedbackMetadata(value: unknown): TemplateLibraryFeedbackMetadata {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schema", "action", "operationId", "templateId", "templateKind", "libraryRevision", "occurredAt",
    "rating", "stars", "notePresent", "noteChars",
  ])) throw new Error("Invalid template library feedback metadata.");
  const base = parseBase(value, "feedback", ["managed", "personal"]);
  if (!base || (value.rating !== "helpful" && value.rating !== "mixed" && value.rating !== "not-helpful") ||
      !isTemplateLibraryFeedbackStars(value.stars) || templateLibraryRatingForStars(value.stars) !== value.rating ||
      typeof value.notePresent !== "boolean" || !Number.isSafeInteger(value.noteChars) ||
      (value.noteChars as number) < 0 || (value.noteChars as number) > TEMPLATE_FEEDBACK_NOTE_LIMIT_CHARS ||
      value.notePresent !== ((value.noteChars as number) > 0)) {
    throw new Error("Invalid template library feedback metadata.");
  }
  return {
    ...base,
    action: "feedback",
    rating: value.rating,
    stars: value.stars,
    notePresent: value.notePresent,
    noteChars: value.noteChars as number,
  };
}

function cloneTemplate(value: unknown, builtIn: boolean): PromptTemplate {
  const template = validatePromptTemplate(value);
  if (template.builtIn !== builtIn) throw new Error(`Invalid ${builtIn ? "managed" : "personal"} template document.`);
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

function clonePersonalDocument(value: unknown): PromptTemplate {
  const template = cloneTemplate(value, false);
  if (!template.createdAt || !template.updatedAt || Date.parse(template.createdAt) > Date.parse(template.updatedAt)) {
    throw new Error("Invalid personal template document timestamps.");
  }
  return template;
}

export function validateTemplateLibraryManagedSnapshot(value: unknown): TemplateLibraryManagedSnapshot {
  if (!isRecord(value) || !hasExactKeys(value, ["schema", "templates"]) ||
      value.schema !== TEMPLATE_LIBRARY_BACKEND_SCHEMA || !Array.isArray(value.templates) ||
      value.templates.length > TEMPLATE_LIBRARY_MANAGED_LIMIT) {
    throw new Error("Invalid managed template document response.");
  }
  let documents: PromptTemplate[];
  try {
    documents = value.templates.map((document) => cloneTemplate(document, true));
  } catch {
    throw new Error("Invalid managed template document response.");
  }
  if (new Set(documents.map(({ id }) => id)).size !== documents.length) {
    throw new Error("Invalid managed template document response.");
  }
  return { schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA, templates: documents };
}

function validateFeedbackNote(metadata: TemplateLibraryFeedbackMetadata, note: unknown): string | undefined {
  if (note !== undefined && (typeof note !== "string" || note.length > TEMPLATE_FEEDBACK_NOTE_LIMIT_CHARS || containsBinaryLikeText(note))) {
    throw new Error("Invalid template library feedback note.");
  }
  const safe = note as string | undefined;
  if (metadata.notePresent !== Boolean(safe?.length) || metadata.noteChars !== (safe?.length ?? 0)) {
    throw new Error("Template library feedback note metadata does not match its document.");
  }
  return safe;
}

/**
 * No-network document backend used by the local vertical slice.
 *
 * A future remote implementation must authenticate its document channel and
 * runtime-validate these exact request and response schemas at both ingress
 * and egress. Every operationId is an idempotency key: an identical retry must
 * return its original acknowledgement and a changed payload must be rejected.
 * Managed documents must remain immutable; personal documents and
 * feedback notes are confidential payloads and must never be copied into
 * metadata logs, telemetry, paths, credentials, or diagnostic dumps.
 */
export class MockTemplateLibraryBackend implements TemplateLibraryBackend {
  private readonly managedDocuments: PromptTemplate[];
  private readonly personalDocuments = new Map<string, PromptTemplate>();
  private readonly personalRevisions = new Map<string, number>();
  private readonly feedbackRecords: MockTemplateLibraryFeedbackRecord[] = [];
  private readonly feedbackAcknowledgements = new Map<string, TemplateLibraryBackendAck>();

  constructor(
    private readonly logger?: TemplateLibraryMetadataLogger,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createId: () => string = () => `ack:${randomUUID()}`,
    managedDocuments: readonly PromptTemplate[] = BUILT_IN_PROMPT_TEMPLATES,
  ) {
    this.managedDocuments = validateTemplateLibraryManagedSnapshot({
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      templates: managedDocuments,
    }).templates;
  }

  async loadManaged(): Promise<TemplateLibraryManagedSnapshot> {
    const result = validateTemplateLibraryManagedSnapshot({
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      templates: this.managedDocuments,
    });
    this.log({ action: "load-managed", documentCount: result.templates.length });
    return result;
  }

  async upsertPersonal(metadata: TemplateLibrarySaveMetadata, document: PromptTemplate): Promise<TemplateLibraryBackendAck> {
    const safeMetadata = validateTemplateLibrarySaveMetadata(metadata);
    const safeDocument = clonePersonalDocument(document);
    if (safeDocument.id !== safeMetadata.templateId || safeDocument.updatedAt !== safeMetadata.occurredAt ||
        this.managedDocuments.some(({ id }) => id === safeDocument.id)) {
      throw new Error("Personal template metadata does not match its document.");
    }
    const previous = this.personalDocuments.get(safeDocument.id);
    const previousRevision = this.personalRevisions.get(safeDocument.id) ?? 0;
    if (previous && previous.createdAt !== safeDocument.createdAt) throw new Error("Personal template creation metadata is immutable.");
    if (safeMetadata.libraryRevision <= previousRevision) throw new Error("Personal template backup revision is stale.");
    if (!previous && this.personalDocuments.size >= PROMPT_USER_TEMPLATE_LIMIT) throw new Error("Personal template backup limit reached.");

    this.personalDocuments.set(safeDocument.id, clonePersonalDocument(safeDocument));
    this.personalRevisions.set(safeDocument.id, safeMetadata.libraryRevision);
    this.log(safeMetadata);
    return this.ack(safeMetadata.operationId);
  }

  async publishDelete(metadata: TemplateLibraryDeleteMetadata): Promise<TemplateLibraryBackendAck> {
    const safeMetadata = validateTemplateLibraryDeleteMetadata(metadata);
    if (this.managedDocuments.some(({ id }) => id === safeMetadata.templateId)) {
      throw new Error("Managed template documents are immutable.");
    }
    this.personalDocuments.delete(safeMetadata.templateId);
    this.personalRevisions.delete(safeMetadata.templateId);
    this.log(safeMetadata);
    return this.ack(safeMetadata.operationId);
  }

  async publishFeedback(
    metadata: TemplateLibraryFeedbackMetadata,
    note?: string,
  ): Promise<TemplateLibraryBackendAck> {
    const safeMetadata = validateTemplateLibraryFeedbackMetadata(metadata);
    const safeNote = validateFeedbackNote(safeMetadata, note);
    const exists = safeMetadata.templateKind === "managed"
      ? this.managedDocuments.some(({ id }) => id === safeMetadata.templateId)
      : this.personalDocuments.has(safeMetadata.templateId);
    if (!exists) throw new Error("Feedback references an unavailable template document.");

    const prior = this.feedbackRecords.find(({ metadata: priorMetadata }) =>
      priorMetadata.operationId === safeMetadata.operationId,
    );
    if (prior) {
      const samePayload = JSON.stringify(prior.metadata) === JSON.stringify(safeMetadata) &&
        prior.note === safeNote;
      const acknowledgement = this.feedbackAcknowledgements.get(safeMetadata.operationId);
      if (!samePayload || !acknowledgement) {
        throw new Error("Feedback operation payload does not match its original delivery.");
      }
      return { ...acknowledgement };
    }

    const acknowledgement = this.ack(safeMetadata.operationId);
    this.feedbackRecords.unshift({ metadata: safeMetadata, ...(safeNote !== undefined ? { note: safeNote } : {}) });
    this.feedbackRecords.splice(TEMPLATE_LIBRARY_MOCK_FEEDBACK_LIMIT);
    this.feedbackAcknowledgements.set(safeMetadata.operationId, acknowledgement);
    const retainedOperationIds = new Set(
      this.feedbackRecords.map(({ metadata: retained }) => retained.operationId),
    );
    for (const operationId of this.feedbackAcknowledgements.keys()) {
      if (!retainedOperationIds.has(operationId)) {
        this.feedbackAcknowledgements.delete(operationId);
      }
    }
    this.log(safeMetadata);
    return { ...acknowledgement };
  }

  snapshot(): MockTemplateLibrarySnapshot {
    return {
      managed: validateTemplateLibraryManagedSnapshot({
        schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
        templates: this.managedDocuments,
      }).templates,
      personal: [...this.personalDocuments.values()].map(clonePersonalDocument),
      feedback: this.feedbackRecords.map(({ metadata, note }) => {
        const safeMetadata = validateTemplateLibraryFeedbackMetadata(metadata);
        const safeNote = validateFeedbackNote(safeMetadata, note);
        return { metadata: safeMetadata, ...(safeNote !== undefined ? { note: safeNote } : {}) };
      }),
    };
  }

  private log(metadata: unknown): void {
    try {
      this.logger?.appendLine(JSON.stringify({ type: "dwi.library.backend.mock", metadata }));
    } catch {
      // Auxiliary metadata logging must not change document acknowledgement.
    }
  }

  private ack(operationId: string): TemplateLibraryBackendAck {
    const ackId = this.createId();
    const acknowledgedAt = this.now();
    return validateTemplateLibraryBackendAck({
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      operationId,
      ackId,
      acknowledgedAt,
    }, operationId);
  }
}

export function validateTemplateLibraryBackendAck(value: unknown, operationId: string): TemplateLibraryBackendAck {
  if (!isRecord(value) || !hasExactKeys(value, ["schema", "operationId", "ackId", "acknowledgedAt"]) ||
      value.schema !== TEMPLATE_LIBRARY_BACKEND_SCHEMA || value.operationId !== operationId ||
      !isEntityId(value.ackId) || !isIsoTimestamp(value.acknowledgedAt)) {
    throw new Error("Invalid template library backend acknowledgement.");
  }
  return {
    schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
    operationId,
    ackId: value.ackId,
    acknowledgedAt: value.acknowledgedAt,
  };
}
