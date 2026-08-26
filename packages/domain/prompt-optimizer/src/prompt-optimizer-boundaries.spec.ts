import { describe, expect, it } from "vitest";

import {
  approvePromptFollowUp,
  buildGeminiFollowUpGenerateContentBody,
  buildPromptFollowUpProviderInput,
  buildPromptProviderInput,
  compilePromptDraft,
  containsPromptAbsolutePath,
  containsPromptCredential,
  createEmptyPromptDraft,
  createPromptRecentRecord,
  GEMINI_DEFAULT_MODEL,
  parseGeminiFollowUpGenerateContentResponse,
  parseGeminiGenerateContentResponse,
  parsePromptDraft,
  parsePromptProviderFollowUpText,
  parsePromptProviderResultText,
  parsePromptRecentUpsertInput,
  parsePromptRecordSaveInput,
  parsePromptTemplateInput,
  PromptOptimizerError,
  reducePromptFollowUpClarity,
  isSafePromptRelativePath,
  validatePromptActivity,
  validatePromptDraft,
  validatePromptFollowUpResult,
  validatePromptOptimizeResult,
  validatePromptRecentRecord,
  validatePromptRecentSummary,
  validatePromptRecentUpsertInput,
  validatePromptSavedRecord,
  validatePromptSavedSummary,
  validatePromptTemplate,
  validatePromptTemplateInput,
  type PromptDraft,
  type PromptFollowUpClarity,
  type PromptOptimizeResult,
  type PromptRecentRecord,
} from "./index.js";

const iso = "2026-07-20T00:00:00.000Z";
const fields: PromptDraft["fields"] = {
  title: "Bounded task",
  desiredOutcome: "Ship the characterized behavior.",
  inScope: "Prompt domain.",
  outOfScope: "Goal execution.",
  verification: "Run focused tests.",
  outputFormat: "Code.",
  hardConstraints: "No secrets.",
  acceptanceCriteria: "Tests pass.",
};

function draft(overrides: Partial<PromptDraft> = {}): PromptDraft {
  return {
    ...createEmptyPromptDraft(),
    prompt: "Implement the bounded task.",
    fields: { ...fields },
    guidancePackIds: ["outcome", "verification"],
    ...overrides,
  };
}

function recent(): PromptRecentRecord {
  const source = draft();
  return createPromptRecentRecord({
    draft: source,
    localCandidate: compilePromptDraft(source).compiledPrompt,
    chosenCandidate: "local",
  }, { id: "recent:coverage", now: Date.parse(iso) });
}

const optimizedPayload = {
  optimizedPrompt: "Implement and verify the bounded task.",
  title: "Bounded task",
  summary: "Added explicit verification.",
  improvements: ["Added verification"],
  remainingQuestions: [],
  warnings: [],
};

function providerResult(overrides: Partial<PromptOptimizeResult> = {}): PromptOptimizeResult {
  return {
    ...optimizedPayload,
    provider: "gemini",
    model: GEMINI_DEFAULT_MODEL,
    finishReason: "STOP",
    latencyMs: 1,
    ...overrides,
  };
}

function geminiEnvelope(payload: unknown = optimizedPayload, candidatePatch: Record<string, unknown> = {}): string {
  return JSON.stringify({
    candidates: [{
      finishReason: "STOP",
      content: { parts: [{ text: JSON.stringify(payload) }] },
      ...candidatePatch,
    }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 },
  });
}

describe("Prompt Optimizer validation boundaries", () => {
  it("rejects every malformed draft and template boundary", () => {
    const validDraft = draft();
    for (const candidate of [
      null,
      { ...validDraft, extra: true },
      { ...validDraft, promptType: "Unknown" },
      { ...validDraft, prompt: 1 },
      { ...validDraft, fields: null },
      { ...validDraft, contexts: "none" },
      { ...validDraft, guidancePackIds: ["unknown"] },
      { ...validDraft, templateId: "../bad" },
    ]) expect(() => validatePromptDraft(candidate)).toThrow(PromptOptimizerError);

    const input = {
      name: "Template",
      description: "Description",
      promptType: "General" as const,
      prompt: "Do work.",
      fields,
      recommendedGuidancePackIds: ["outcome" as const],
    };
    expect(validatePromptTemplateInput(input)).toEqual(input);
    for (const candidate of [
      null,
      { ...input, name: "" },
      { ...input, description: 1 },
      { ...input, promptType: "Unknown" },
      { ...input, recommendedGuidancePackIds: ["unknown"] },
      { ...input, templateId: "../bad" },
    ]) expect(() => validatePromptTemplateInput(candidate)).toThrow(PromptOptimizerError);

    const template = { id: "template:1", builtIn: false, ...input, createdAt: iso, updatedAt: iso };
    expect(validatePromptTemplate(template)).toEqual(template);
    for (const candidate of [
      { ...template, id: "" },
      { ...template, builtIn: "false" },
      { ...template, createdAt: "today" },
      { ...template, updatedAt: "today" },
      { ...template, extra: true },
    ]) expect(() => validatePromptTemplate(candidate)).toThrow(PromptOptimizerError);
  });

  it("covers domain parser branches independently of transport envelopes", () => {
    const valid = draft();
    const context = {
      id: "context:1", source: "picked_file" as const, label: "src/file.ts",
      content: "export const value = 1;", languageId: "typescript", relativePath: "src/file.ts",
    };
    expect(parsePromptDraft({ ...valid, contexts: [context], templateId: "template:1" }))
      .toMatchObject({ templateId: "template:1", contexts: [context] });
    for (const candidate of [
      { ...valid, fields: { ...fields, title: 1 } },
      { ...valid, fields: { ...fields, title: "x".repeat(32_769) } },
      { ...valid, contexts: [{ ...context, id: "" }] },
      { ...valid, contexts: [{ ...context, source: "unknown" }] },
      { ...valid, contexts: [{ ...context, label: "" }] },
      { ...valid, contexts: [{ ...context, label: "x".repeat(501) }] },
      { ...valid, contexts: [{ ...context, content: 1 }] },
      { ...valid, contexts: [{ ...context, content: "x".repeat(65_537) }] },
      { ...valid, contexts: [{ ...context, languageId: 1 }] },
      { ...valid, contexts: [{ ...context, languageId: "x".repeat(101) }] },
      { ...valid, contexts: [{ ...context, relativePath: "../bad" }] },
      { ...valid, contexts: [context, { ...context }] },
      { ...valid, guidancePackIds: ["outcome", "outcome"] },
    ]) expect(parsePromptDraft(candidate)).toBeUndefined();
    expect(isSafePromptRelativePath("src/\u0000file.ts")).toBe(false);
    expect(isSafePromptRelativePath("src//file.ts")).toBe(false);

    const template = {
      templateId: "template:1", name: "Template", description: "Description",
      promptType: "General", prompt: "Do work.", fields,
      recommendedGuidancePackIds: ["outcome"],
    };
    expect(parsePromptTemplateInput(template)).toEqual(template);
    for (const candidate of [
      { ...template, name: 1 },
      { ...template, name: "x".repeat(201) },
      { ...template, description: "x".repeat(2_001) },
      { ...template, prompt: 1 },
      { ...template, fields: null },
      { ...template, recommendedGuidancePackIds: null },
    ]) expect(parsePromptTemplateInput(candidate)).toBeUndefined();

    const optimizedSave = {
      recordId: "record:1", draft: valid, chosenCandidate: "optimized",
      optimizedPrompt: "Improved prompt.",
    };
    expect(parsePromptRecordSaveInput(optimizedSave)).toEqual(optimizedSave);
    for (const candidate of [
      { ...optimizedSave, optimizedPrompt: 1 },
      { ...optimizedSave, optimizedPrompt: "" },
      { ...optimizedSave, optimizedPrompt: "x".repeat(65_537) },
      { ...optimizedSave, chosenCandidate: "local" },
    ]) expect(parsePromptRecordSaveInput(candidate)).toBeUndefined();

    const localCandidate = compilePromptDraft(valid).compiledPrompt;
    const recentInput = {
      recentId: "recent:1", draft: valid, localCandidate,
      optimizedCandidate: "Improved.", chosenCandidate: "optimized",
      savedRecordId: "record:1", provider: "gemini", model: GEMINI_DEFAULT_MODEL,
    };
    expect(parsePromptRecentUpsertInput(recentInput)).toEqual(recentInput);
    for (const candidate of [
      { ...recentInput, localCandidate: 1 },
      { ...recentInput, localCandidate: "" },
      { ...recentInput, optimizedCandidate: 1 },
      { ...recentInput, optimizedCandidate: "" },
      { ...recentInput, optimizedCandidate: "x".repeat(65_537) },
      { ...recentInput, chosenCandidate: "other" },
      { ...recentInput, savedRecordId: "../bad" },
      { ...recentInput, provider: "unknown" },
      { ...recentInput, model: "../bad" },
    ]) expect(parsePromptRecentUpsertInput(candidate)).toBeUndefined();
  });

  it("rejects malformed saved summaries and records at each invariant", () => {
    const summary = {
      id: "record:1", title: "Bounded task", promptType: "General" as const,
      createdAt: iso, updatedAt: iso, optimized: false,
    };
    expect(validatePromptSavedSummary(summary)).toEqual(summary);
    for (const candidate of [
      null,
      { ...summary, id: "" },
      { ...summary, title: "" },
      { ...summary, promptType: "Unknown" },
      { ...summary, createdAt: "invalid" },
      { ...summary, updatedAt: "invalid" },
      { ...summary, optimized: "false" },
      { ...summary, provider: "gemini" },
      { ...summary, model: GEMINI_DEFAULT_MODEL },
      { ...summary, optimized: true },
      { ...summary, provider: "unknown", model: "model", optimized: true },
      { ...summary, provider: "gemini", model: "../bad", optimized: true },
    ]) expect(() => validatePromptSavedSummary(candidate)).toThrow(PromptOptimizerError);

    const record = {
      schemaVersion: "1.2.0" as const,
      summary,
      draft: draft(),
      chosenCandidate: "local" as const,
    };
    expect(validatePromptSavedRecord(record)).toEqual(record);
    for (const candidate of [
      null,
      { ...record, schemaVersion: "1.1.0" },
      { ...record, chosenCandidate: "other" },
      { ...record, draft: null },
      { ...record, optimizedPrompt: "unexpected" },
      { ...record, summary: { ...summary, optimized: true, provider: "gemini", model: GEMINI_DEFAULT_MODEL } },
      { ...record, extra: true },
    ]) expect(() => validatePromptSavedRecord(candidate)).toThrow(PromptOptimizerError);
  });

  it("rejects malformed recents and upserts at each invariant", () => {
    const valid = recent();
    expect(validatePromptRecentRecord(valid)).toEqual(valid);
    const summary = valid.summary;
    for (const candidate of [
      null,
      { ...summary, id: "" },
      { ...summary, title: "" },
      { ...summary, promptType: "Unknown" },
      { ...summary, updatedAt: "invalid" },
      { ...summary, candidate: "other" },
      { ...summary, contextState: "other" },
      { ...summary, preview: "" },
      { ...summary, savedRecordId: "../bad" },
      { ...summary, provider: "gemini" },
      { ...summary, model: GEMINI_DEFAULT_MODEL },
      { ...summary, provider: "gemini", model: GEMINI_DEFAULT_MODEL },
    ]) expect(() => validatePromptRecentSummary(candidate)).toThrow(PromptOptimizerError);

    for (const candidate of [
      null,
      { ...valid, schemaVersion: "1.2.0" },
      { ...valid, localCandidate: "" },
      { ...valid, optimizedCandidate: "" },
      { ...valid, chosenCandidate: "other" },
      { ...valid, chosenCandidate: "optimized" },
      { ...valid, provider: "gemini" },
      { ...valid, model: GEMINI_DEFAULT_MODEL },
      { ...valid, contextSummaries: "none" },
      { ...valid, summary: { ...summary, promptType: "Bug fix" } },
      { ...valid, summary: { ...summary, contextState: "needs_recapture" } },
      { ...valid, extra: true },
    ]) expect(() => validatePromptRecentRecord(candidate)).toThrow(PromptOptimizerError);

    const source = draft();
    const upsert = { draft: source, localCandidate: compilePromptDraft(source).compiledPrompt };
    expect(validatePromptRecentUpsertInput(upsert)).toEqual(upsert);
    for (const candidate of [
      null,
      { ...upsert, localCandidate: "different" },
      { ...upsert, recentId: "../bad" },
      { ...upsert, chosenCandidate: "optimized" },
      { ...upsert, provider: "gemini" },
      { ...upsert, model: GEMINI_DEFAULT_MODEL },
    ]) expect(() => validatePromptRecentUpsertInput(candidate)).toThrow(PromptOptimizerError);
  });

  it("detects credentials and absolute paths without false positives", () => {
    expect(containsPromptCredential("apiKey=super-secret-value")).toBe(true);
    expect(containsPromptCredential("authorization: bearer abcdefgh")).toBe(true);
    expect(containsPromptCredential("ordinary prompt text")).toBe(false);
    expect(containsPromptAbsolutePath("read /Users/alice/private.ts")).toBe(true);
    expect(containsPromptAbsolutePath("read C:\\Users\\alice\\private.ts")).toBe(true);
    expect(containsPromptAbsolutePath("read src/private.ts")).toBe(false);
  });

  it("validates provider inputs and normalized optimize results", () => {
    expect(buildPromptProviderInput({
      provider: "openai", model: "gpt-5.4-nano", compiledPrompt: "Do work.",
    }).prompt).toContain("Do work.");
    for (const request of [
      { provider: "unknown", model: "model", compiledPrompt: "x" },
      { provider: "openai", model: "../bad", compiledPrompt: "x" },
      { provider: "openai", model: "model", compiledPrompt: " " },
    ]) expect(() => buildPromptProviderInput(request as never)).toThrow(PromptOptimizerError);

    expect(validatePromptOptimizeResult(providerResult(), GEMINI_DEFAULT_MODEL, "gemini"))
      .toEqual(providerResult());
    for (const candidate of [
      null,
      providerResult({ provider: "unknown" as never }),
      providerResult({ model: "../bad" }),
      providerResult({ optimizedPrompt: "" }),
      providerResult({ title: "" }),
      providerResult({ summary: "" }),
      { ...providerResult(), improvements: "none" },
      { ...providerResult(), remainingQuestions: "none" },
      { ...providerResult(), warnings: "none" },
      providerResult({ finishReason: "" }),
      providerResult({ latencyMs: -1 }),
      { ...providerResult(), usage: { inputTokens: -1 } },
    ]) expect(() => validatePromptOptimizeResult(candidate, GEMINI_DEFAULT_MODEL, "gemini"))
      .toThrow(PromptOptimizerError);
  });

  it("parses provider output and rejects malformed, oversized, and refused output", () => {
    expect(parsePromptProviderResultText(JSON.stringify(optimizedPayload), {
      provider: "openai", model: "gpt-5.4-nano", latencyMs: 2, finishReason: "stop",
    })).toMatchObject({ provider: "openai", model: "gpt-5.4-nano" });
    expect(parsePromptProviderResultText(`\`\`\`json\n${JSON.stringify(optimizedPayload)}\n\`\`\``, {
      provider: "anthropic", model: "claude-haiku", latencyMs: 2, finishReason: "end_turn",
    })).toMatchObject({ provider: "anthropic" });
    for (const [text, options] of [
      ["{", { provider: "openai", model: "model", latencyMs: 1, finishReason: "stop" }],
      [JSON.stringify({ ...optimizedPayload, extra: true }), { provider: "openai", model: "model", latencyMs: 1, finishReason: "stop" }],
      [JSON.stringify({ ...optimizedPayload, title: "" }), { provider: "openai", model: "model", latencyMs: 1, finishReason: "stop" }],
      [JSON.stringify(optimizedPayload), { provider: "unknown", model: "model", latencyMs: 1, finishReason: "stop" }],
      [JSON.stringify(optimizedPayload), { provider: "openai", model: "../bad", latencyMs: 1, finishReason: "stop" }],
      [JSON.stringify(optimizedPayload), { provider: "openai", model: "model", latencyMs: -1, finishReason: "stop" }],
      [JSON.stringify(optimizedPayload), { provider: "openai", model: "model", latencyMs: 1, finishReason: "" }],
      [JSON.stringify(optimizedPayload), { provider: "openai", model: "model", latencyMs: 1, finishReason: "content-filter" }],
    ] as const) expect(() => parsePromptProviderResultText(text, options as never)).toThrow(PromptOptimizerError);
  });

  it("rejects every malformed Gemini envelope and safety refusal", () => {
    expect(parseGeminiGenerateContentResponse(geminiEnvelope(), {
      model: GEMINI_DEFAULT_MODEL, latencyMs: 1,
    })).toMatchObject({ usage: { totalTokens: 3 } });
    const envelopes = [
      "not-json",
      JSON.stringify(null),
      JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }),
      JSON.stringify({ candidates: [] }),
      JSON.stringify({ candidates: [{}] }),
      JSON.stringify({ candidates: [{ finishReason: "SAFETY" }] }),
      JSON.stringify({ candidates: [{ finishReason: "STOP", safetyRatings: [{ blocked: true }] }] }),
      JSON.stringify({ candidates: [{ finishReason: "STOP", content: null }] }),
      JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{}] } }] }),
      JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{" }] } }] }),
      geminiEnvelope({ ...optimizedPayload, extra: true }),
    ];
    for (const envelope of envelopes) {
      expect(() => parseGeminiGenerateContentResponse(envelope, {
        model: GEMINI_DEFAULT_MODEL, latencyMs: 1,
      })).toThrow(PromptOptimizerError);
    }
    expect(() => parseGeminiGenerateContentResponse(geminiEnvelope(), {
      model: "../bad", latencyMs: 1,
    })).toThrow(PromptOptimizerError);
    expect(() => parseGeminiGenerateContentResponse(geminiEnvelope(), {
      model: GEMINI_DEFAULT_MODEL, latencyMs: -1,
    })).toThrow(PromptOptimizerError);
  });

  it("covers follow-up state, provider input, approval, and refusal boundaries", () => {
    const source = recent();
    const missing: PromptFollowUpClarity = {
      resultOrFeedback: "missing", nextOutcome: "missing",
      scopeAndBoundaries: "missing", verification: "missing",
    };
    const clear: PromptFollowUpClarity = {
      resultOrFeedback: "clear", nextOutcome: "clear",
      scopeAndBoundaries: "clear", verification: "clear",
    };
    expect(reducePromptFollowUpClarity(clear, missing)).toEqual(clear);
    expect(reducePromptFollowUpClarity(missing, clear)).toEqual(clear);

    const message = "Tests failed; next ship the fix within src and run unit tests.";
    const evidence = {
      resultOrFeedback: "Tests failed",
      nextOutcome: "ship the fix",
      scopeAndBoundaries: "within src",
      verification: "run unit tests",
    };
    const result = validatePromptFollowUpResult({
      assistantMessage: "The proposal is ready.",
      clarity: clear,
      evidence,
      proposedDraft: draft(),
    }, { userMessages: [message], sourceRecent: source });
    expect(approvePromptFollowUp(result, source).sourceRecentId).toBe(source.summary.id);

    const turn = {
      provider: "openai" as const,
      model: "gpt-5.4-nano",
      recent: source,
      userMessages: [message],
      clarity: missing,
      turn: 1,
    };
    expect(buildPromptFollowUpProviderInput(turn).prompt).toContain(message);
    expect(buildGeminiFollowUpGenerateContentBody({
      ...turn, model: GEMINI_DEFAULT_MODEL,
    }).contents).toHaveLength(1);
    for (const bad of [
      { ...turn, provider: "unknown" },
      { ...turn, model: "../bad" },
      { ...turn, turn: 0 },
      { ...turn, turn: 2 },
      { ...turn, userMessages: [""] },
      { ...turn, clarity: { ...missing, verification: "unknown" } },
    ]) expect(() => buildPromptFollowUpProviderInput(bad as never)).toThrow(PromptOptimizerError);

    const payload = {
      assistantMessage: "What verification should be used?",
      clarity: missing,
      evidence: {},
      unresolvedQuestion: "What verification should be used?",
    };
    expect(parsePromptProviderFollowUpText(JSON.stringify(payload), {
      provider: "openai", model: "gpt-5.4-nano", latencyMs: 1, finishReason: "stop",
      userMessages: [message], sourceRecent: source,
    })).toEqual(payload);
    expect(parseGeminiFollowUpGenerateContentResponse(geminiEnvelope(payload), {
      model: GEMINI_DEFAULT_MODEL, latencyMs: 1, userMessages: [message], sourceRecent: source,
    })).toEqual(payload);
    for (const finishReason of ["safety", "content-filter"]) {
      expect(() => parsePromptProviderFollowUpText(JSON.stringify(payload), {
        provider: "openai", model: "model", latencyMs: 1, finishReason,
        userMessages: [message], sourceRecent: source,
      })).toThrow(PromptOptimizerError);
    }
    expect(() => approvePromptFollowUp({ ...result, proposedDraft: undefined }, source))
      .toThrow(PromptOptimizerError);
  });

  it("validates bounded activity metadata", () => {
    const activity = {
      id: "activity:1", kind: "optimized" as const, status: "success" as const,
      timestamp: iso, provider: "gemini" as const, model: GEMINI_DEFAULT_MODEL,
      latencyMs: 1,
    };
    expect(validatePromptActivity(activity)).toEqual(activity);
    const completeActivity = {
      ...activity,
      recordId: "record:1",
      templateId: "template:1",
      templateKind: "user" as const,
      contextCount: 1,
      contextBytes: 10,
      recentId: "recent:1",
      turnCount: 1,
      followUpOutcome: "approved" as const,
    };
    expect(validatePromptActivity(completeActivity)).toEqual(completeActivity);
    for (const candidate of [
      null,
      { ...activity, id: "" },
      { ...activity, kind: "unknown" },
      { ...activity, status: "unknown" },
      { ...activity, timestamp: "invalid" },
      { ...activity, provider: "unknown" },
      { ...activity, model: "../bad" },
      { ...activity, recordId: "../bad" },
      { ...activity, templateId: "../bad" },
      { ...activity, templateKind: "unknown" },
      { ...activity, contextCount: -1 },
      { ...activity, contextCount: 11 },
      { ...activity, contextBytes: -1 },
      { ...activity, contextBytes: 131_073 },
      { ...activity, recentId: "../bad" },
      { ...activity, turnCount: -1 },
      { ...activity, turnCount: 7 },
      { ...activity, followUpOutcome: "unknown" },
      { ...activity, latencyMs: -1 },
      { ...activity, extra: true },
    ]) expect(() => validatePromptActivity(candidate)).toThrow(PromptOptimizerError);
  });
});
