import { describe, expect, it } from "vitest";

import { compilePromptDocumentV2 } from "./compiler.js";
import {
  createPromptDocumentV2,
  finalizePromptDocumentV2,
  hashPromptDocumentV2,
  hashPromptSemanticBaseV2,
} from "./document.js";
import {
  createPromptRecentRecordV2,
  migrateLegacyPromptRecordV2,
} from "./persistence.js";
import {
  answerPromptQuestionV2,
  selectPromptQuestionsV2,
} from "./questions.js";
import {
  createPromptSemanticRequestV2,
  validatePromptSemanticResultV2,
} from "./semantic.js";
import type { PromptDocumentV2, PromptPatchOperationV2 } from "./types.js";

function document(
  mutate: (source: Omit<PromptDocumentV2, "canonicalHash">) => Omit<
    PromptDocumentV2,
    "canonicalHash"
  >,
): PromptDocumentV2 {
  const base = createPromptDocumentV2({
    id: "phase-1-prompt",
    now: "2026-08-30T00:00:00.000Z",
  });
  const { canonicalHash: _canonicalHash, ...source } = base;
  return finalizePromptDocumentV2(
    mutate({ ...source, baseline: "Improve the retry boundary." }),
  );
}

describe("Phase 1 V2 safety regressions", () => {
  it("maps local question answers to a canonical compiled section", () => {
    const source = document((value) => value);
    const flow = selectPromptQuestionsV2(source, ["outcome-observable"]);
    const answered = answerPromptQuestionV2(
      flow,
      "outcome-observable",
      "behavior",
      undefined,
    );
    const compiled = compilePromptDocumentV2(
      document((value) => ({ ...value, answers: answered.answers })),
    );

    expect(answered.answers[0]?.target).toBe("desired-outcome");
    expect(compiled.sections.find((section) => section.id === "desired-outcome"))
      .toMatchObject({
        omitted: false,
        text: "Make the requested behavior work as described.",
      });
  });

  it("does not re-ask persisted camelCase answers after canonical target migration", () => {
    const source = document((value) => ({
      ...value,
      answers: [
        {
          questionId: "outcome-observable",
          target: "desiredOutcome",
          state: "answered",
          detail: "Preserve the existing behavior.",
        },
      ],
    }));

    expect(selectPromptQuestionsV2(source, ["outcome-observable"]).questionIds).toEqual([]);
  });

  it.each<readonly [PromptPatchOperationV2["operation"]]>([
    ["append-section"],
    ["replace-section"],
    ["remove-section"],
  ])("rejects %s on a locked section", (operation) => {
    const source = document((value) => ({
      ...value,
      lockedSections: ["constraints"],
    }));
    const request = createPromptSemanticRequestV2(source, {
      operation: "enhance",
      requestId: "locked-operation",
      cancellationId: "locked-cancellation",
      provider: "openai",
      model: "test",
      compiledPrompt: compilePromptDocumentV2(source).text,
    });
    const patch =
      operation === "remove-section"
        ? { operation, sectionId: "constraints" as const }
        : {
            operation,
            sectionId: "constraints" as const,
            text: "Do not weaken the boundary.",
          };

    expect(() =>
      validatePromptSemanticResultV2(request, {
        schemaVersion: "prompt-enhance-result.v2",
        operation: "enhance",
        baseHash: request.baseHash,
        operations: [patch],
      }),
    ).toThrow(/locked section/iu);
  });

  it.each<readonly [readonly PromptPatchOperationV2[]]>([
    [[
      {
        operation: "append-section",
        sectionId: "constraints",
        text: "Injected constraint.",
      },
    ]],
    [[
      {
        operation: "replace-section",
        sectionId: "constraints",
        text: "Injected replacement.",
      },
    ]],
    [[{ operation: "remove-section", sectionId: "constraints" }]],
  ])("does not apply persisted locked patches: %o", (operation) => {
    const base = document((value) => ({
      ...value,
      fields: { ...value.fields, hardConstraints: "Keep the retry boundary." },
      lockedSections: ["constraints"],
      semanticPatches: [],
    }));
    const { canonicalHash: _canonicalHash, ...baseSource } = base;
    const withCurrentBase = finalizePromptDocumentV2({
      ...baseSource,
      semanticPatches: [
        {
          id: "persisted-patch",
          operationId: "operation",
          provider: "openai",
          model: "test",
          baseHash: hashPromptSemanticBaseV2(base),
          createdAt: base.createdAt,
          operations: operation,
          status: "applied",
        },
      ],
    });
    const compiled = compilePromptDocumentV2(withCurrentBase);

    expect(compiled.sections.find((section) => section.id === "constraints"))
      .toMatchObject({ text: "Keep the retry boundary." });
    expect(compiled.warnings.join("\n")).toMatch(/cannot target locked section/iu);
  });

  it("rehashes a recent record after context content is stripped", () => {
    const source = document((value) => ({
      ...value,
      contexts: [
        {
          id: "context-1",
          source: "pasted",
          safeLabel: "Safe context",
          classification: "text",
          byteCount: 18,
          included: true,
          outbound: true,
          content: "private source text",
          capturedRevision: 0,
        },
      ],
    }));
    const compiled = compilePromptDocumentV2(source);
    const recent = createPromptRecentRecordV2({
      schemaVersion: "prompt-saved-record.v2",
      id: "record-1",
      revision: 1,
      document: source,
      localCandidate: {
        id: "record-1:local",
        choice: "local",
        sourceDocumentHash: source.canonicalHash,
        sourceRevision: source.revision,
        text: compiled.text,
        compiledHash: compiled.compiledHash,
        createdAt: source.createdAt,
        stale: false,
      },
      chosenCandidate: "local",
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    });
    const { canonicalHash: _canonicalHash, ...recentSource } = recent.document;

    expect(recent.document.contexts).toEqual([]);
    expect(recent.document.canonicalHash).toBe(hashPromptDocumentV2(recentSource));
    expect(recent.document.canonicalHash).not.toBe(source.canonicalHash);
    expect(recent.localCandidate.sourceDocumentHash).toBe(
      recent.document.canonicalHash,
    );
    expect(recent.localCandidate.compiledHash).toBe(
      compilePromptDocumentV2(recent.document).compiledHash,
    );
    expect(recent.optimizedCandidate).toBeUndefined();
    expect(recent.chosenCandidate).toBe("local");
  });

  it("identifies migrated optimized text with its own compiled hash", () => {
    const record = migrateLegacyPromptRecordV2(
      {
        id: "legacy-1",
        draft: {
          promptType: "General",
          prompt: "Improve retries.",
          fields: {
            title: "",
            desiredOutcome: "",
            inScope: "",
            outOfScope: "",
            hardConstraints: "",
            acceptanceCriteria: "",
            outputFormat: "",
            verification: "",
          },
          contexts: [],
          guidancePackIds: [],
        },
        optimizedPrompt: "A different optimized prompt.",
        chosenCandidate: "optimized",
      },
      { id: "legacy-1", now: "2026-08-30T00:00:00.000Z" },
    );

    expect(record.optimizedCandidate?.compiledHash).not.toBe(
      record.localCandidate.compiledHash,
    );
  });
});
