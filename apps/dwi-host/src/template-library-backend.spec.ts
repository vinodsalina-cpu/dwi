import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PROMPT_TEMPLATES,
  type PromptTemplate,
} from "@platform/domain-prompt-optimizer";
import {
  MockTemplateLibraryBackend,
  TEMPLATE_LIBRARY_BACKEND_SCHEMA,
  TEMPLATE_LIBRARY_MANAGED_LIMIT,
  validateTemplateLibraryBackendAck,
  validateTemplateLibraryManagedSnapshot,
  type TemplateLibraryDeleteMetadata,
  type TemplateLibraryFeedbackMetadata,
  type TemplateLibrarySaveMetadata,
} from "./template-library-backend.js";

const occurredAt = "2026-08-27T12:00:00.000Z";
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

function personal(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: "template:1",
    builtIn: false,
    name: "PRIVATE NAME TOKEN",
    description: "A personal template.",
    promptType: "General",
    prompt: "PRIVATE BODY TOKEN",
    fields: { ...fields },
    recommendedGuidancePackIds: ["outcome", "verification"],
    createdAt: occurredAt,
    updatedAt: occurredAt,
    ...overrides,
  };
}

function saveMetadata(overrides: Partial<TemplateLibrarySaveMetadata> = {}): TemplateLibrarySaveMetadata {
  return {
    schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
    action: "save",
    operationId: "op:save",
    templateId: "template:1",
    templateKind: "personal",
    libraryRevision: 1,
    occurredAt,
    ...overrides,
  };
}

function deleteMetadata(overrides: Partial<TemplateLibraryDeleteMetadata> = {}): TemplateLibraryDeleteMetadata {
  return {
    ...saveMetadata(),
    action: "delete",
    operationId: "op:delete",
    libraryRevision: 3,
    ...overrides,
  };
}

function feedbackMetadata(overrides: Partial<TemplateLibraryFeedbackMetadata> = {}): TemplateLibraryFeedbackMetadata {
  return {
    ...saveMetadata(),
    action: "feedback",
    operationId: "op:feedback",
    libraryRevision: 2,
    rating: "helpful",
    stars: 5,
    notePresent: true,
    noteChars: 23,
    ...overrides,
  };
}

describe("mock template library document backend", () => {
  it("deep-clones managed, personal, and feedback documents while logging metadata only", async () => {
    const lines: string[] = [];
    let next = 0;
    const backend = new MockTemplateLibraryBackend(
      { appendLine: (value) => lines.push(value) },
      () => occurredAt,
      () => `ack:${++next}`,
    );

    const managed = await backend.loadManaged();
    expect(managed.templates).toHaveLength(BUILT_IN_PROMPT_TEMPLATES.length);
    managed.templates[0]!.fields.title = "Caller mutation";
    expect((await backend.loadManaged()).templates[0]!.fields.title).not.toBe("Caller mutation");

    const document = personal();
    expect(await backend.upsertPersonal(saveMetadata(), document)).toMatchObject({ operationId: "op:save", ackId: "ack:1" });
    document.prompt = "Caller mutation";
    let snapshot = backend.snapshot();
    expect(snapshot.personal[0]?.prompt).toBe("PRIVATE BODY TOKEN");
    snapshot.personal[0]!.prompt = "Snapshot mutation";
    expect(backend.snapshot().personal[0]?.prompt).toBe("PRIVATE BODY TOKEN");

    const note = "TOP SECRET note content";
    expect(await backend.publishFeedback(feedbackMetadata(), note)).toMatchObject({ operationId: "op:feedback", ackId: "ack:2" });
    snapshot = backend.snapshot();
    expect(snapshot.feedback[0]).toMatchObject({ metadata: { rating: "helpful", stars: 5, noteChars: 23 }, note });

    expect(await backend.publishDelete(deleteMetadata())).toMatchObject({ operationId: "op:delete", ackId: "ack:3" });
    expect(backend.snapshot().personal).toEqual([]);

    const output = lines.join("\n");
    expect(output).not.toContain("PRIVATE NAME TOKEN");
    expect(output).not.toContain("PRIVATE BODY TOKEN");
    expect(output).not.toContain("TOP SECRET note content");
    expect(output).toContain('"noteChars":23');
    expect(output).toContain('"action":"delete"');
  });

  it("validates exact managed document response schemas and immutable document kinds", () => {
    expect(() => validateTemplateLibraryManagedSnapshot({
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      templates: BUILT_IN_PROMPT_TEMPLATES,
      extra: true,
    })).toThrow(/managed template/);
    expect(() => validateTemplateLibraryManagedSnapshot({
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      templates: [personal()],
    })).toThrow(/managed template/);
    expect(() => validateTemplateLibraryManagedSnapshot({
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      templates: [BUILT_IN_PROMPT_TEMPLATES[0], BUILT_IN_PROMPT_TEMPLATES[0]],
    })).toThrow(/managed template/);
    expect(() => validateTemplateLibraryManagedSnapshot({
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      templates: Array.from({ length: TEMPLATE_LIBRARY_MANAGED_LIMIT + 1 }, () => BUILT_IN_PROMPT_TEMPLATES[0]),
    })).toThrow(/managed template/);
  });

  it("rejects mismatched, stale, mutable, oversized, and extra-field ingress", async () => {
    const backend = new MockTemplateLibraryBackend(undefined, () => occurredAt, () => "ack:1");
    await expect(backend.upsertPersonal({ ...saveMetadata(), extra: true } as TemplateLibrarySaveMetadata, personal()))
      .rejects.toThrow(/save metadata/);
    await expect(backend.upsertPersonal(saveMetadata(), personal({ id: "template:other" })))
      .rejects.toThrow(/does not match/);
    await expect(backend.upsertPersonal(saveMetadata(), { ...personal(), builtIn: true }))
      .rejects.toThrow(/personal template/);

    await backend.upsertPersonal(saveMetadata(), personal());
    await expect(backend.upsertPersonal(saveMetadata({ operationId: "op:stale" }), personal()))
      .rejects.toThrow(/stale/);
    await expect(backend.upsertPersonal(
      saveMetadata({ operationId: "op:created", libraryRevision: 2 }),
      personal({ createdAt: "2026-08-27T11:00:00.000Z" }),
    )).rejects.toThrow(/immutable/);

    await expect(backend.publishFeedback(feedbackMetadata({ noteChars: 2 }), "one"))
      .rejects.toThrow(/does not match/);
    await expect(backend.publishFeedback(feedbackMetadata({ stars: 3 }), "TOP SECRET note content"))
      .rejects.toThrow(/feedback metadata/);
    await expect(backend.publishFeedback(feedbackMetadata({ notePresent: false, noteChars: 0 }), "bad\u0000note"))
      .rejects.toThrow(/feedback note/);
    await expect(backend.publishFeedback(feedbackMetadata({ notePresent: true, noteChars: 1_001 }), "x".repeat(1_001)))
      .rejects.toThrow(/feedback metadata/);
    await expect(backend.publishDelete(deleteMetadata({ templateId: BUILT_IN_PROMPT_TEMPLATES[0]!.id })))
      .rejects.toThrow(/immutable/);
  });

  it("returns the original acknowledgement for an identical feedback retry", async () => {
    let ackId = 0;
    const backend = new MockTemplateLibraryBackend(
      undefined,
      () => occurredAt,
      () => `ack:${++ackId}`,
    );
    await backend.upsertPersonal(saveMetadata(), personal());
    const metadata = feedbackMetadata();
    const note = "TOP SECRET note content";

    const first = await backend.publishFeedback(metadata, note);
    const retried = await backend.publishFeedback(metadata, note);

    expect(retried).toEqual(first);
    expect(backend.snapshot().feedback).toHaveLength(1);
    await expect(backend.publishFeedback(
      metadata,
      "TOP SECRET note contenx",
    )).rejects.toThrow(/does not match its original delivery/);
  });

  it("bounds the in-memory personal backup while allowing replacement at the cap", async () => {
    let ackId = 0;
    const backend = new MockTemplateLibraryBackend(undefined, () => occurredAt, () => `ack:${++ackId}`);
    for (let index = 0; index < 25; index += 1) {
      const templateId = `template:${index}`;
      await backend.upsertPersonal(
        saveMetadata({ operationId: `op:${index}`, templateId, libraryRevision: index + 1 }),
        personal({ id: templateId }),
      );
    }
    expect(backend.snapshot().personal).toHaveLength(25);
    await expect(backend.upsertPersonal(
      saveMetadata({ operationId: "op:overflow", templateId: "template:overflow", libraryRevision: 26 }),
      personal({ id: "template:overflow" }),
    )).rejects.toThrow(/limit/);
    await expect(backend.upsertPersonal(
      saveMetadata({ operationId: "op:update", templateId: "template:0", libraryRevision: 26 }),
      personal({ id: "template:0", name: "Updated at cap" }),
    )).resolves.toMatchObject({ operationId: "op:update" });
    expect(backend.snapshot().personal).toHaveLength(25);
  });

  it("reports invalid acknowledgements without losing the applied backup operation", async () => {
    expect(() => validateTemplateLibraryBackendAck({
      schema: TEMPLATE_LIBRARY_BACKEND_SCHEMA,
      operationId: "op:1",
      ackId: "ack:1",
      acknowledgedAt: "August 27, 2026",
    }, "op:1")).toThrow(/acknowledgement/);

    const backend = new MockTemplateLibraryBackend(undefined, () => occurredAt, () => "invalid ack id");
    await expect(backend.upsertPersonal(saveMetadata(), personal())).rejects.toThrow(/acknowledgement/);
    expect(backend.snapshot().personal).toMatchObject([{ id: "template:1", prompt: "PRIVATE BODY TOKEN" }]);
  });
});
