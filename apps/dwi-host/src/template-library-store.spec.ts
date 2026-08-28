import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PROMPT_TEMPLATES,
  PROMPT_USER_TEMPLATE_LIMIT,
  type PromptTemplate,
  type PromptTemplateInput,
} from "@platform/domain-prompt-optimizer";
import {
  MockTemplateLibraryBackend,
  TEMPLATE_LIBRARY_BACKEND_SCHEMA,
  type TemplateLibraryBackend,
  type TemplateLibraryBackendAck,
  type TemplateLibraryDeleteMetadata,
} from "./template-library-backend.js";
import {
  TEMPLATE_LIBRARY_SCHEMA,
  TEMPLATE_LIBRARY_STORAGE_KEY,
  TemplateLibraryStore,
  parseTemplateLibraryEnvelope,
  type TemplateLibraryEnvelope,
  type TemplateLibraryStateStorage,
} from "./template-library-store.js";

const now = "2026-08-27T12:00:00.000Z";
const fields = {
  title: "Bounded task",
  desiredOutcome: "Ship the requested behavior.",
  inScope: "The Library slice.",
  outOfScope: "Unrelated work.",
  verification: "Run focused tests.",
  outputFormat: "Code and summary.",
  hardConstraints: "Keep data local.",
  acceptanceCriteria: "Tests pass.",
};

function input(overrides: Partial<PromptTemplateInput> = {}): PromptTemplateInput {
  return {
    name: "My template",
    description: "A personal template.",
    promptType: "General",
    prompt: "Implement the requested change.",
    fields: { ...fields },
    recommendedGuidancePackIds: ["outcome", "verification"],
    ...overrides,
  };
}

class MemoryStorage implements TemplateLibraryStateStorage {
  value: unknown;
  updates: unknown[] = [];
  constructor(value?: unknown) { this.value = value; }
  get<T>(key: string): T | undefined {
    expect(key).toBe(TEMPLATE_LIBRARY_STORAGE_KEY);
    return this.value === undefined ? undefined : structuredClone(this.value) as T;
  }
  async update(key: string, value: unknown): Promise<void> {
    expect(key).toBe(TEMPLATE_LIBRARY_STORAGE_KEY);
    this.value = structuredClone(value);
    this.updates.push(structuredClone(value));
  }
}

function deterministicStore(storage = new MemoryStorage(), backend?: TemplateLibraryBackend) {
  let id = 0;
  return {
    storage,
    store: new TemplateLibraryStore(
      storage,
      backend ?? new MockTemplateLibraryBackend(undefined, () => now, () => `ack:${++id}`),
      () => now,
      () => `id${++id}`,
    ),
  };
}

function ack(operationId: string): TemplateLibraryBackendAck {
  return { schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA, operationId, ackId: `ack:${operationId}`, acknowledgedAt: now };
}

describe("template library store", () => {
  it("resolves cloned managed and personal templates without changing Recents", async () => {
    const { store, storage } = deterministicStore();
    await store.open();
    const managedId = BUILT_IN_PROMPT_TEMPLATES[0]!.id;
    const managed = await store.resolve(managedId);
    expect(managed).toEqual(BUILT_IN_PROMPT_TEMPLATES[0]);
    expect(storage.updates).toEqual([]);
    managed!.fields.title = "Caller mutation";
    expect((await store.resolve(managedId))?.fields.title).not.toBe("Caller mutation");

    const saved = await store.save("op:create", 0, input());
    const beforeResolve = structuredClone(storage.value);
    const personal = await store.resolve(saved.detail.template.id);
    expect(personal).toEqual(saved.detail.template);
    personal!.prompt = "Caller mutation";
    expect(storage.value).toEqual(beforeResolve);
    expect((await store.resolve(saved.detail.template.id))?.prompt).toBe("Implement the requested change.");
  });

  it("returns managed summaries on open and bodies only on item detail", async () => {
    const { store } = deterministicStore();
    const state = await store.open();
    expect(state.revision).toBe(0);
    expect(state.managed).toHaveLength(BUILT_IN_PROMPT_TEMPLATES.length);
    expect(state.personal).toEqual([]);
    expect(state.managed[0]).not.toHaveProperty("prompt");
    expect(state.managed.every(({ immutable }) => immutable)).toBe(true);

    const detail = await store.get(BUILT_IN_PROMPT_TEMPLATES[0]!.id);
    expect(detail.template.prompt).toBe(BUILT_IN_PROMPT_TEMPLATES[0]!.prompt);
    expect(detail.versions).toEqual([{ revision: 1, managed: true }]);
    expect((await store.open()).recent[0]?.id).toBe(detail.template.id);
  });

  it("hydrates managed templates from a validated backend snapshot", async () => {
    const fixture: PromptTemplate = {
      ...BUILT_IN_PROMPT_TEMPLATES[0]!,
      id: "managed:remote",
      name: "Managed from backend",
      fields: { ...BUILT_IN_PROMPT_TEMPLATES[0]!.fields },
      recommendedGuidancePackIds: [...BUILT_IN_PROMPT_TEMPLATES[0]!.recommendedGuidancePackIds],
    };
    const backend = new MockTemplateLibraryBackend(undefined, () => now, () => "ack:1", [fixture]);
    fixture.name = "Caller mutation";
    const { store } = deterministicStore(new MemoryStorage(), backend);

    expect((await store.resolve("managed:remote"))?.name).toBe("Managed from backend");
    const state = await store.open();
    expect(state.managed).toMatchObject([{ id: "managed:remote", name: "Managed from backend", immutable: true }]);
    expect((await store.resolve("managed:remote"))?.name).toBe("Managed from backend");
    expect(await store.resolve(BUILT_IN_PROMPT_TEMPLATES[0]!.id)).toBeUndefined();
  });

  it("fails closed without touching local state when managed output is malformed", async () => {
    const storage = new MemoryStorage();
    const backend: TemplateLibraryBackend = {
      loadManaged: async () => ({ schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA, templates: [], extra: true }),
      upsertPersonal: async (metadata) => ack(metadata.operationId),
      publishDelete: async (metadata) => ack(metadata.operationId),
      publishFeedback: async (metadata) => ack(metadata.operationId),
    };
    const { store } = deterministicStore(storage, backend);
    await expect(store.open()).rejects.toMatchObject({ code: "storage" });
    expect(storage.updates).toEqual([]);
  });

  it("uses host IDs, canonical inputs, optimistic revisions, and five body-free version rows", async () => {
    const { store, storage } = deterministicStore();
    let result = await store.save("op:create", 0, input());
    const id = result.detail.template.id;
    expect(id).toMatch(/^template:id/);
    expect(result.detail.template.builtIn).toBe(false);
    expect(result.state.revision).toBe(1);
    expect(result.detail.versions).toEqual([{ revision: 1, managed: false, savedAt: now }]);

    await expect(store.save("op:stale", 0, input({ templateId: id })))
      .rejects.toMatchObject({ code: "conflict", currentRevision: 1 });
    await expect(store.save("op:caller-id", 1, input({ templateId: "template:caller" })))
      .rejects.toMatchObject({ code: "not-found" });

    for (let revision = 2; revision <= 7; revision += 1) {
      result = await store.save(`op:update:${revision}`, revision - 1, input({ templateId: id, name: `Version ${revision}` }));
    }
    expect(result.detail.versions.map(({ revision }) => revision)).toEqual([7, 6, 5, 4, 3]);
    const envelope = storage.value as TemplateLibraryEnvelope;
    expect(envelope.revisionHistory).toHaveLength(5);
    expect(JSON.stringify(envelope.revisionHistory)).not.toContain("Implement the requested change");
  });

  it("backs up the canonical saved document without exposing local state to backend mutation", async () => {
    const storage = new MemoryStorage();
    let delivered: PromptTemplate | undefined;
    const backend: TemplateLibraryBackend = {
      loadManaged: async () => ({ schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA, templates: BUILT_IN_PROMPT_TEMPLATES }),
      upsertPersonal: async (metadata, template) => {
        delivered = structuredClone(template);
        template.prompt = "Backend mutation";
        template.fields.title = "Backend mutation";
        return ack(metadata.operationId);
      },
      publishDelete: async (metadata) => ack(metadata.operationId),
      publishFeedback: async (metadata) => ack(metadata.operationId),
    };
    const { store } = deterministicStore(storage, backend);
    const result = await store.save("op:create", 0, input());

    expect(result.published).toBe(true);
    expect(delivered).toEqual(result.detail.template);
    expect(result.detail.template.prompt).toBe("Implement the requested change.");
    expect((storage.value as TemplateLibraryEnvelope).personal[0]?.prompt).toBe("Implement the requested change.");
  });

  it("reports an unacknowledged backup while retaining the local save", async () => {
    const backend = new MockTemplateLibraryBackend(undefined, () => now, () => "invalid ack id");
    const { store, storage } = deterministicStore(new MemoryStorage(), backend);
    const result = await store.save("op:create", 0, input());

    expect(result.published).toBe(false);
    expect((storage.value as TemplateLibraryEnvelope).personal).toHaveLength(1);
    expect(backend.snapshot().personal).toMatchObject([{ id: result.detail.template.id }]);
  });

  it("enforces the 25 personal-template cap while allowing updates at the cap", async () => {
    const { store } = deterministicStore();
    let revision = 0;
    let firstId = "";
    for (let index = 0; index < PROMPT_USER_TEMPLATE_LIMIT; index += 1) {
      const result = await store.save(`op:create:${index}`, revision, input({ name: `Template ${index}` }));
      revision = result.state.revision;
      firstId ||= result.detail.template.id;
    }
    expect((await store.open()).personal).toHaveLength(PROMPT_USER_TEMPLATE_LIMIT);
    await expect(store.save("op:over-limit", revision, input({ name: "One too many" })))
      .rejects.toMatchObject({ code: "limit" });
    const updated = await store.save("op:update-at-limit", revision, input({ templateId: firstId, name: "Updated at limit" }));
    expect(updated.state.personal).toHaveLength(PROMPT_USER_TEMPLATE_LIMIT);
  });

  it("keeps managed templates immutable", async () => {
    const { store } = deterministicStore();
    const managedId = BUILT_IN_PROMPT_TEMPLATES[0]!.id;
    await expect(store.save("op:managed-save", 0, input({ templateId: managedId })))
      .rejects.toMatchObject({ code: "immutable" });
    await expect(store.delete("op:managed-delete", 0, managedId))
      .rejects.toMatchObject({ code: "immutable" });
  });

  it("clears the local body before publishing a metadata-only deletion tombstone", async () => {
    const storage = new MemoryStorage();
    let observedAtPublish: TemplateLibraryEnvelope | undefined;
    let publishedMetadata: TemplateLibraryDeleteMetadata | undefined;
    const backend: TemplateLibraryBackend = {
      loadManaged: async () => ({ schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA, templates: BUILT_IN_PROMPT_TEMPLATES }),
      upsertPersonal: async (metadata) => ack(metadata.operationId),
      publishFeedback: async (metadata) => ack(metadata.operationId),
      publishDelete: async (metadata) => {
        publishedMetadata = metadata;
        observedAtPublish = storage.get<TemplateLibraryEnvelope>(TEMPLATE_LIBRARY_STORAGE_KEY);
        return ack(metadata.operationId);
      },
    };
    const { store } = deterministicStore(storage, backend);
    const saved = await store.save("op:create", 0, input());
    const templateId = saved.detail.template.id;
    const deleted = await store.delete("op:delete", 1, templateId);

    expect(deleted.published).toBe(true);
    expect(observedAtPublish?.personal).toEqual([]);
    expect(observedAtPublish?.deletionOutbox).toMatchObject([{ operationId: "op:delete", templateId }]);
    expect(publishedMetadata).toEqual({
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      action: "delete",
      operationId: "op:delete",
      templateId,
      templateKind: "personal",
      libraryRevision: 2,
      occurredAt: now,
    });
    const finalEnvelope = storage.value as TemplateLibraryEnvelope;
    expect(finalEnvelope.deletionOutbox).toEqual([]);
    expect(finalEnvelope.tombstones).toMatchObject([{ operationId: "op:delete", templateId, revision: 2 }]);
    expect(JSON.stringify(finalEnvelope)).not.toContain("Implement the requested change");
  });

  it("removes the backup before a delete ack and retries an unacknowledged tombstone", async () => {
    let acknowledgements = 0;
    const backend = new MockTemplateLibraryBackend(
      undefined,
      () => now,
      () => {
        acknowledgements += 1;
        return acknowledgements === 2 ? "invalid ack id" : `ack:${acknowledgements}`;
      },
    );
    const { store, storage } = deterministicStore(new MemoryStorage(), backend);
    const saved = await store.save("op:create", 0, input());
    expect(backend.snapshot().personal).toHaveLength(1);

    const deleted = await store.delete("op:delete", 1, saved.detail.template.id);
    expect(deleted.published).toBe(false);
    expect(backend.snapshot().personal).toEqual([]);
    expect((storage.value as TemplateLibraryEnvelope).deletionOutbox).toHaveLength(1);

    await store.open();
    expect((storage.value as TemplateLibraryEnvelope).deletionOutbox).toEqual([]);
    expect((storage.value as TemplateLibraryEnvelope).tombstones).toMatchObject([{ operationId: "op:delete" }]);
  });

  it("never drops an unacknowledged deletion tombstone when the bounded outbox is full", async () => {
    const storage = new MemoryStorage();
    const backend: TemplateLibraryBackend = {
      loadManaged: async () => ({ schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA, templates: BUILT_IN_PROMPT_TEMPLATES }),
      upsertPersonal: async (metadata) => ack(metadata.operationId),
      publishFeedback: async (metadata) => ack(metadata.operationId),
      publishDelete: async () => { throw new Error("offline"); },
    };
    const { store } = deterministicStore(storage, backend);
    let revision = 0;
    for (let index = 0; index < 50; index += 1) {
      const saved = await store.save(`op:create:${index}`, revision, input({ name: `Template ${index}` }));
      revision = saved.state.revision;
      const deleted = await store.delete(`op:delete:${index}`, revision, saved.detail.template.id);
      revision = deleted.state.revision;
      expect(deleted.published).toBe(false);
    }
    const finalTemplate = await store.save("op:create:final", revision, input({ name: "Keep me" }));
    revision = finalTemplate.state.revision;

    await expect(store.delete("op:delete:blocked", revision, finalTemplate.detail.template.id))
      .rejects.toMatchObject({ code: "storage", currentRevision: revision });
    const envelope = storage.value as TemplateLibraryEnvelope;
    expect(envelope.deletionOutbox).toHaveLength(50);
    expect(envelope.personal.map(({ id }) => id)).toContain(finalTemplate.detail.template.id);
  });

  it("stores only reviewed timestamps while delivering the feedback note outside metadata logs", async () => {
    const storage = new MemoryStorage();
    const lines: string[] = [];
    let id = 0;
    const backend = new MockTemplateLibraryBackend({ appendLine: (line) => lines.push(line) }, () => now, () => `ack:${++id}`);
    const store = new TemplateLibraryStore(storage, backend, () => now, () => `id${++id}`);
    const saved = await store.save("op:create", 0, input());
    const templateId = saved.detail.template.id;
    const feedback = await store.submitFeedback("op:feedback", 1, templateId, "helpful", 5, "private feedback note");

    expect(feedback).toMatchObject({ templateId, rating: "helpful", stars: 5, reviewedAt: now, published: true });
    expect(feedback.state.personal[0]).toMatchObject({ id: templateId, reviewedAt: now });
    expect(JSON.stringify(storage.value)).not.toContain("private feedback note");
    expect(lines.join("\n")).not.toContain("private feedback note");
    expect(lines.at(-1)).toContain('"noteChars":21');
    expect(backend.snapshot().feedback[0]).toMatchObject({
      metadata: { templateId, rating: "helpful", stars: 5, notePresent: true, noteChars: 21 },
      note: "private feedback note",
    });
  });

  it("retries an unacknowledged feedback delivery idempotently without advancing revision twice", async () => {
    let attempts = 0;
    let id = 0;
    const delegate = new MockTemplateLibraryBackend(undefined, () => now, () => `ack:${++id}`);
    const backend: TemplateLibraryBackend = {
      loadManaged: () => delegate.loadManaged(),
      upsertPersonal: (metadata, template) => delegate.upsertPersonal(metadata, template),
      publishDelete: (metadata) => delegate.publishDelete(metadata),
      publishFeedback: async (metadata, note) => {
        const result = await delegate.publishFeedback(metadata, note);
        attempts += 1;
        if (attempts === 1) throw new Error("Acknowledgement was lost.");
        return result;
      },
    };
    const { store } = deterministicStore(new MemoryStorage(), backend);
    const saved = await store.save("op:create", 0, input());
    const templateId = saved.detail.template.id;

    const first = await store.submitFeedback(
      "op:feedback:retry",
      saved.state.revision,
      templateId,
      "helpful",
      4,
      "Keep this note.",
    );
    expect(first).toMatchObject({ published: false, state: { revision: 2 } });

    const retried = await store.submitFeedback(
      "op:feedback:retry",
      first.state.revision,
      templateId,
      "helpful",
      4,
      "Keep this note.",
    );
    expect(retried).toMatchObject({ published: true, state: { revision: 2 } });
    expect(delegate.snapshot().feedback).toHaveLength(1);
  });

  it("validates feedback at the store boundary as well as the message boundary", async () => {
    const { store } = deterministicStore();
    const saved = await store.save("op:create", 0, input());
    await expect(store.submitFeedback("op:bad-rating", 1, saved.detail.template.id, "excellent" as "helpful", 5))
      .rejects.toMatchObject({ code: "conflict", currentRevision: 1 });
    await expect(store.submitFeedback("op:bad-stars", 1, saved.detail.template.id, "helpful", 3))
      .rejects.toMatchObject({ code: "conflict", currentRevision: 1 });
    await expect(store.submitFeedback("op:bad-note", 1, saved.detail.template.id, "mixed", 3, "x".repeat(1_001)))
      .rejects.toMatchObject({ code: "conflict", currentRevision: 1 });
    await expect(store.submitFeedback("op:bad-note-type", 1, saved.detail.template.id, "mixed", 3, 123 as unknown as string))
      .rejects.toMatchObject({ code: "conflict", currentRevision: 1 });
    await expect(store.submitFeedback("op:bad-template", 1, "bad template id", "mixed", 3))
      .rejects.toMatchObject({ code: "conflict", currentRevision: 1 });
  });

  it("rejects replayed save, delete, and feedback operation IDs at the current revision", async () => {
    const { store } = deterministicStore();
    const first = await store.save("op:create", 0, input());
    const feedback = await store.submitFeedback("op:feedback", 1, first.detail.template.id, "helpful", 5);
    await expect(store.submitFeedback("op:feedback", feedback.state.revision, first.detail.template.id, "mixed", 3))
      .rejects.toMatchObject({ code: "conflict", currentRevision: 2 });
    await expect(store.save("op:create", feedback.state.revision, input({ name: "Replay" })))
      .rejects.toMatchObject({ code: "conflict", currentRevision: 2 });

    const deleted = await store.delete("op:delete", feedback.state.revision, first.detail.template.id);
    await expect(store.save("op:delete", deleted.state.revision, input({ name: "Reused delete ID" })))
      .rejects.toMatchObject({ code: "conflict", currentRevision: 3 });
  });

  it("rejects inconsistent metadata envelopes and classifies persistence failures", async () => {
    const { store, storage } = deterministicStore();
    await store.save("op:create", 0, input());
    const inconsistent = structuredClone(storage.value) as TemplateLibraryEnvelope;
    inconsistent.appliedOperations = [inconsistent.appliedOperations[0]!, inconsistent.appliedOperations[0]!];
    expect(parseTemplateLibraryEnvelope(inconsistent)).toBeUndefined();
    inconsistent.appliedOperations = [{ ...inconsistent.appliedOperations[0]!, revision: inconsistent.revision + 1 }];
    expect(parseTemplateLibraryEnvelope(inconsistent)).toBeUndefined();

    const failingStorage: TemplateLibraryStateStorage = {
      get: () => undefined,
      update: async () => { throw new Error("disk unavailable"); },
    };
    const failing = new TemplateLibraryStore(failingStorage, new MockTemplateLibraryBackend(), () => now, () => "id1");
    await expect(failing.save("op:create", 0, input())).rejects.toMatchObject({ code: "storage" });
  });

  it("does not overwrite malformed versioned state", async () => {
    const storage = new MemoryStorage({ ...({ schema: TEMPLATE_LIBRARY_SCHEMA } as object), revision: "bad" });
    const { store } = deterministicStore(storage);
    await expect(store.open()).rejects.toMatchObject({ code: "storage" });
    expect(storage.updates).toEqual([]);
  });
});
