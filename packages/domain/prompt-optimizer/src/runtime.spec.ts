import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PROMPT_TEMPLATES,
  compilePromptDraft,
  createEmptyPromptDraft,
  createPromptDraftFromTemplate,
} from "./index.js";
import {
  compileStandalonePromptDraft,
  createStandaloneEmptyPromptDraft,
  createStandalonePromptDraftFromTemplate,
} from "./runtime.js";
import type { PromptTemplate } from "./types.js";

describe("catalog-independent prompt runtime", () => {
  it("creates the same empty draft as the canonical API", () => {
    expect(createStandaloneEmptyPromptDraft("Architecture")).toEqual(
      createEmptyPromptDraft("Architecture"),
    );
  });

  it("creates the same draft from validated managed and personal templates", () => {
    const managed = BUILT_IN_PROMPT_TEMPLATES[0]!;
    const personal: PromptTemplate = {
      ...managed,
      id: "personal:delivery",
      builtIn: false,
      fields: { ...managed.fields },
      recommendedGuidancePackIds: [...managed.recommendedGuidancePackIds],
      createdAt: "2026-08-27T12:00:00.000Z",
      updatedAt: "2026-08-27T13:00:00.000Z",
    };

    for (const template of [managed, personal]) {
      expect(createStandalonePromptDraftFromTemplate(template)).toEqual(
        createPromptDraftFromTemplate(template),
      );
    }
  });

  it("compiles the same document and readiness for a catalog-independent draft", () => {
    const template: PromptTemplate = {
      ...BUILT_IN_PROMPT_TEMPLATES[1]!,
      id: "personal:architecture",
      builtIn: false,
      fields: { ...BUILT_IN_PROMPT_TEMPLATES[1]!.fields },
      recommendedGuidancePackIds: [
        ...BUILT_IN_PROMPT_TEMPLATES[1]!.recommendedGuidancePackIds,
      ],
    };
    const draft = createPromptDraftFromTemplate(template);
    draft.prompt = `${draft.prompt}\n\nUser request:\nPlan the boundary.`;

    expect(compileStandalonePromptDraft(draft)).toEqual(
      compilePromptDraft(draft),
    );
  });

  it("matches canonical compilation text for managed templates without importing their catalog", () => {
    const draft = createPromptDraftFromTemplate(
      BUILT_IN_PROMPT_TEMPLATES[0]!,
    );
    draft.prompt = `${draft.prompt}\n\nUser request:\nDeliver the change.`;

    expect(compileStandalonePromptDraft(draft).compiledPrompt).toBe(
      compilePromptDraft(draft).compiledPrompt,
    );
  });

  it("rejects invalid drafts and template envelopes", () => {
    expect(() => compileStandalonePromptDraft({})).toThrow(
      "Invalid prompt draft.",
    );
    expect(() =>
      createStandalonePromptDraftFromTemplate({
        ...BUILT_IN_PROMPT_TEMPLATES[0],
        unexpected: true,
      }),
    ).toThrow("Invalid prompt template.");
  });
});
