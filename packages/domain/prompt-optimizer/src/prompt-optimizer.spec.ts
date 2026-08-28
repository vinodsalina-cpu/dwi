import { describe, expect, it } from "vitest";

import {
  BUILT_IN_PROMPT_TEMPLATES,
  buildGeminiGenerateContentBody,
  compilePromptDraft,
  createEmptyPromptDraft,
  createPromptDraftFromTemplate,
  createPromptRecentRecord,
  createPromptTextDiff,
  evaluatePromptReadiness,
  GEMINI_DEFAULT_MODEL,
  normalizePromptFailure,
  parseGeminiGenerateContentResponse,
  PromptOptimizerError,
  upsertPromptRecentRecords,
  validatePromptContexts,
  validatePromptFollowUpResult,
  validatePromptRecentRecord,
  type PromptDraft,
} from "./index.js";

const readyFields: PromptDraft["fields"] = {
  title: "Live Prompt Optimizer",
  desiredOutcome: "Ship a complete local vertical slice.",
  inScope: "The Prompt Optimizer domain.",
  outOfScope: "Goal execution.",
  verification: "Run focused unit tests.",
  outputFormat: "Code and verification.",
  hardConstraints: "Never expose credentials.",
  acceptanceCriteria: "The bounded request succeeds.",
};

function readyDraft(): PromptDraft {
  return {
    ...createEmptyPromptDraft(),
    prompt: "Make Prompt Optimizer live.",
    fields: readyFields,
    guidancePackIds: ["outcome", "verification"],
  };
}

describe("Prompt Optimizer domain characterization", () => {
  it("publishes stable templates and creates independent drafts", () => {
    expect(BUILT_IN_PROMPT_TEMPLATES).toHaveLength(10);
    const draft = createPromptDraftFromTemplate(BUILT_IN_PROMPT_TEMPLATES[0]!);
    expect(draft.templateId).toBe("general");
    expect(draft.contexts).toEqual([]);
    expect(draft.fields).not.toBe(BUILT_IN_PROMPT_TEMPLATES[0]!.fields);
  });

  it("evaluates readiness and compiles deterministic bounded input", () => {
    const draft = readyDraft();
    expect(evaluatePromptReadiness(draft).ready).toBe(true);
    const first = compilePromptDraft(draft);
    const second = compilePromptDraft(draft);
    expect(first).toEqual(second);
    expect(first.compiledPrompt).toContain("Make Prompt Optimizer live.");
    expect(evaluatePromptReadiness(createEmptyPromptDraft()).ready).toBe(false);
  });

  it("validates explicit contexts without accepting unsafe paths", () => {
    const context = {
      id: "context-1",
      source: "picked_file" as const,
      label: "src/example.ts",
      content: "export const safe = true;",
      relativePath: "src/example.ts",
    };
    expect(validatePromptContexts([context])).toEqual([context]);
    expect(() => validatePromptContexts([{ ...context, relativePath: "../secret" }]))
      .toThrow(PromptOptimizerError);
    expect(() => validatePromptContexts([{ ...context, content: "x".repeat(65_537) }]))
      .toThrow(PromptOptimizerError);
  });

  it("builds and parses the exact Gemini structured request", () => {
    const draft = readyDraft();
    const request = {
      provider: "gemini" as const,
      model: GEMINI_DEFAULT_MODEL,
      compiledPrompt: compilePromptDraft(draft).compiledPrompt,
    };
    const body = buildGeminiGenerateContentBody(request);
    expect(body.generationConfig.temperature).toBeUndefined();
    expect(body.generationConfig.maxOutputTokens).toBe(8_192);
    const response = {
      candidates: [{
        content: { parts: [{ text: JSON.stringify({
          optimizedPrompt: "Ship the bounded Prompt Optimizer and verify it.",
          title: "Ship Prompt Optimizer",
          summary: "Clarified delivery.",
          improvements: ["Added verification"],
          remainingQuestions: [],
          warnings: [],
        }) }] },
        finishReason: "STOP",
      }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 12, totalTokenCount: 22 },
    };
    expect(parseGeminiGenerateContentResponse(JSON.stringify(response), {
      model: GEMINI_DEFAULT_MODEL,
      latencyMs: 42,
    })).toMatchObject({ provider: "gemini", finishReason: "STOP", latencyMs: 42 });
  });

  it("projects safe recents and keeps the newest five", () => {
    const draft = readyDraft();
    const localCandidate = compilePromptDraft(draft).compiledPrompt;
    let records = [createPromptRecentRecord(
      { draft, localCandidate },
      { id: "recent-0", now: Date.parse("2026-07-20T00:00:00.000Z") },
    )];
    for (let index = 1; index < 6; index += 1) {
      records = upsertPromptRecentRecords(records, createPromptRecentRecord(
        { draft, localCandidate },
        { id: `recent-${index}`, now: Date.parse("2026-07-20T00:00:00.000Z") + index },
      ));
    }
    expect(records).toHaveLength(5);
    expect(records.map(({ summary }) => summary.id)).toEqual([
      "recent-5", "recent-4", "recent-3", "recent-2", "recent-1",
    ]);
    expect(validatePromptRecentRecord(records[0])).toEqual(records[0]);
  });

  it("requires user evidence for follow-up proposals", () => {
    const draft = readyDraft();
    expect(() => validatePromptFollowUpResult({
      assistantMessage: "Ready for approval.",
      clarity: {
        resultOrFeedback: "clear",
        nextOutcome: "clear",
        scopeAndBoundaries: "clear",
        verification: "clear",
      },
      evidence: {
        resultOrFeedback: "invented",
        nextOutcome: "invented",
        scopeAndBoundaries: "invented",
        verification: "invented",
      },
      proposedDraft: draft,
    }, { userMessages: ["actual user evidence"] })).toThrow(PromptOptimizerError);
  });

  it("creates stable diffs and safe failures", () => {
    expect(createPromptTextDiff("one\ntwo", "one\nthree")).toEqual({
      segments: [
        { kind: "unchanged", lines: ["one"] },
        { kind: "removed", lines: ["two"] },
        { kind: "added", lines: ["three"] },
      ],
      addedLineCount: 1,
      removedLineCount: 1,
      unchangedLineCount: 1,
    });
    expect(normalizePromptFailure(new PromptOptimizerError("timeout"))).toMatchObject({
      kind: "timeout",
      retryable: true,
    });
    expect(normalizePromptFailure(new Error("secret raw body"))).toMatchObject({ kind: "host" });
  });
});
