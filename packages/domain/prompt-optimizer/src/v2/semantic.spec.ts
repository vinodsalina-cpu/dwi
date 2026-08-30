import { describe, expect, it } from "vitest";

import { createPromptDocumentV2 } from "./document.js";
import {
  buildPromptSemanticProviderInputV2,
  createPromptSemanticRequestV2,
  parsePromptGeneratedQuestionV2,
  parsePromptSemanticProviderTextV2,
  PROMPT_GENERATED_QUESTION_LIMITS_V2,
  PROMPT_SEMANTIC_PROVIDER_RESPONSE_LIMIT_BYTES,
  promptGeneratedQuestionTargetsV2,
  validatePromptSemanticResultV2,
  type PromptGeneratedQuestionV2,
} from "./semantic.js";

function analyzeRequest() {
  return createPromptSemanticRequestV2(
    createPromptDocumentV2({
      id: "prompt-1",
      now: "2026-08-04T00:00:00.000Z",
      promptType: "Architecture",
    }),
    {
      operation: "analyze",
      requestId: "request-1",
      cancellationId: "cancel-1",
      provider: "openai",
      model: "gpt-test",
      compiledPrompt:
        "Design the retry boundary. Verification ownership is not specified.",
      allowlistedQuestionIds: ["verification-depth", "acceptance-evidence"],
    },
  );
}

function question(
  overrides: Partial<PromptGeneratedQuestionV2> = {},
): PromptGeneratedQuestionV2 {
  return {
    id: "retry-verification-owner",
    target: "verification",
    question: "Which layer owns retry verification?",
    gap: "The draft requests retries but does not assign verification ownership.",
    options: [
      {
        id: "gateway",
        label: "Gateway",
        value: "The gateway owns retry verification.",
      },
      {
        id: "worker",
        label: "Worker",
        value: "The worker owns retry verification.",
      },
    ],
    ...overrides,
  };
}

function providerText(questions: readonly unknown[]): string {
  return JSON.stringify({
    schemaVersion: "prompt-analyze-result.v3",
    operation: "analyze",
    baseHash: analyzeRequest().baseHash,
    questions,
  });
}

describe("bounded provider-generated clarification questions", () => {
  it("builds a draft-grounded v3 contract with a fixed target allowlist", () => {
    const request = analyzeRequest();
    expect(request.allowlistedQuestionTargets).toEqual(
      promptGeneratedQuestionTargetsV2,
    );
    expect(request.allowlistedQuestionTargets).not.toContain("title");
    expect(request.allowlistedQuestionTargets).toContain("desired-outcome");
    expect(request.allowlistedQuestionTargets).not.toContain("desiredOutcome");

    const input = buildPromptSemanticProviderInputV2(request);
    const prompt = JSON.parse(input.prompt) as Record<string, unknown>;
    expect(input.system).toMatch(/concrete missing or ambiguous detail/iu);
    expect(input.system).toMatch(/return no questions/iu);
    expect(input.system).toMatch(/stable semantic IDs/iu);
    expect(prompt.compiledPrompt).toBe(request.compiledPrompt);
    expect(prompt).not.toHaveProperty("allowlistedQuestionIds");
    expect(prompt).toMatchObject({
      operation: "analyze",
      baseHash: request.baseHash,
      analyzeRequirements: {
        deriveFrom: "compiledPrompt",
        askOnlyForActualMissingOrAmbiguousDetails: true,
        doNotAskForAlreadySuppliedInformation: true,
        gapMustDescribeDraftSpecificEvidence: true,
        allowlistedQuestionTargets: promptGeneratedQuestionTargetsV2,
        plainTextOnly: true,
      },
      responseContract: {
        schemaVersion: "prompt-analyze-result.v3",
        operation: "analyze",
        baseHash: request.baseHash,
      },
    });
    expect(input.maxOutputTokens).toBe(4_096);
  });

  it("parses valid generated questions and injects trusted provenance", () => {
    const request = analyzeRequest();
    const result = parsePromptSemanticProviderTextV2(
      providerText([question()]),
      request,
    );
    expect(result).toEqual({
      schemaVersion: "prompt-analyze-result.v3",
      operation: "analyze",
      baseHash: request.baseHash,
      questions: [question()],
      provenance: {
        source: "semantic-provider",
        provider: "openai",
        model: "gpt-test",
        requestId: "request-1",
      },
    });
    expect(result).not.toHaveProperty("questionIds");
  });

  it("accepts an empty generated set when the provider finds no lapse", () => {
    const result = parsePromptSemanticProviderTextV2(
      providerText([]),
      analyzeRequest(),
    );
    expect(result).toMatchObject({
      schemaVersion: "prompt-analyze-result.v3",
      questions: [],
    });
  });

  it("retains the exact allowlisted-ID v2 fallback", () => {
    const request = analyzeRequest();
    const result = parsePromptSemanticProviderTextV2(
      JSON.stringify({
        operation: "analyze",
        baseHash: request.baseHash,
        questionIds: ["verification-depth"],
      }),
      request,
    );
    expect(result).toEqual({
      schemaVersion: "prompt-analyze-result.v2",
      operation: "analyze",
      baseHash: request.baseHash,
      questionIds: ["verification-depth"],
    });
  });

  it("treats direct adapter output as unknown and returns a fresh projection", () => {
    const request = analyzeRequest();
    const candidate = {
      schemaVersion: "prompt-analyze-result.v3",
      operation: "analyze",
      baseHash: request.baseHash,
      questions: [question()],
      provenance: {
        source: "semantic-provider",
        provider: request.provider,
        model: request.model,
        requestId: request.requestId,
      },
    };
    const result = validatePromptSemanticResultV2(request, candidate);
    expect(result).toEqual(candidate);
    expect(result).not.toBe(candidate);
    if (result.schemaVersion === "prompt-analyze-result.v3") {
      expect(result.questions).not.toBe(candidate.questions);
      expect(result.questions[0]).not.toBe(candidate.questions[0]);
      expect(result.questions[0]?.options).not.toBe(
        candidate.questions[0]?.options,
      );
      expect(result.provenance).not.toBe(candidate.provenance);
    }
  });

  it.each([
    ["question action", { ...question(), action: "run-command" }],
    ["question path", { ...question(), path: "/etc/passwd" }],
    [
      "option action",
      question({
        options: [
          { ...question().options[0]!, action: "open-url" },
          question().options[1]!,
        ],
      }),
    ],
  ])("rejects unknown %s keys", (_label, candidate) => {
    expect(() =>
      parsePromptSemanticProviderTextV2(
        providerText([candidate]),
        analyzeRequest(),
      ),
    ).toThrow(/exact/iu);
  });

  it("rejects provider-supplied or spoofed provenance", () => {
    const request = analyzeRequest();
    expect(() =>
      parsePromptSemanticProviderTextV2(
        JSON.stringify({
          schemaVersion: "prompt-analyze-result.v3",
          operation: "analyze",
          baseHash: request.baseHash,
          questions: [question()],
          provenance: {
            source: "semantic-provider",
            provider: "anthropic",
            model: "spoofed",
            requestId: request.requestId,
          },
        }),
        request,
      ),
    ).toThrow(/requested operation/iu);

    expect(() =>
      validatePromptSemanticResultV2(request, {
        schemaVersion: "prompt-analyze-result.v3",
        operation: "analyze",
        baseHash: request.baseHash,
        questions: [question()],
        provenance: {
          source: "semantic-provider",
          provider: "anthropic",
          model: request.model,
          requestId: request.requestId,
        },
      }),
    ).toThrow(/provenance/iu);
  });

  it.each(["title", "repository.path", "__proto__", "verification.detail"])(
    "rejects non-allowlisted target %s",
    (target) => {
      expect(() =>
        parsePromptGeneratedQuestionV2({ ...question(), target }),
      ).toThrow(/unknown draft field/iu);
    },
  );

  it("honors a request that narrows the fixed target allowlist", () => {
    const request = {
      ...analyzeRequest(),
      allowlistedQuestionTargets: ["desiredOutcome" as const],
    };
    expect(() =>
      parsePromptSemanticProviderTextV2(providerText([question()]), request),
    ).toThrow(/not allowlisted/iu);
  });

  it.each([
    [
      "question IDs",
      [question(), question({ question: "What verifies retry ownership?" })],
    ],
    [
      "question text",
      [
        question(),
        question({
          id: "retry-scope-owner",
          target: "scope",
          question: "  Which layer owns retry verification?  ".trim(),
        }),
      ],
    ],
    [
      "question targets",
      [
        question(),
        question({
          id: "retry-verification-depth",
          question: "How deep should retry verification go?",
        }),
      ],
    ],
  ])("rejects duplicate %s", (_label, questions) => {
    expect(() =>
      parsePromptSemanticProviderTextV2(
        providerText(questions),
        analyzeRequest(),
      ),
    ).toThrow(/duplicates/iu);
  });

  it.each([
    [
      "option IDs",
      question({
        options: [
          question().options[0]!,
          { ...question().options[1]!, id: "gateway" },
        ],
      }),
    ],
    [
      "option labels",
      question({
        options: [
          question().options[0]!,
          { ...question().options[1]!, label: "gateway" },
        ],
      }),
    ],
    [
      "option values",
      question({
        options: [
          question().options[0]!,
          {
            ...question().options[1]!,
            value: "the gateway owns retry verification.",
          },
        ],
      }),
    ],
  ])("rejects duplicate %s", (_label, candidate) => {
    expect(() => parsePromptGeneratedQuestionV2(candidate)).toThrow(
      /duplicates/iu,
    );
  });

  it("rejects excess questions and invalid option counts", () => {
    const questions = Array.from(
      { length: PROMPT_GENERATED_QUESTION_LIMITS_V2.maxQuestions + 1 },
      (_, index) =>
        question({
          id: `question-${index}`,
          target:
            promptGeneratedQuestionTargetsV2[
              index % promptGeneratedQuestionTargetsV2.length
            ],
          question: `Question number ${index}?`,
        }),
    );
    expect(() =>
      parsePromptSemanticProviderTextV2(
        providerText(questions),
        analyzeRequest(),
      ),
    ).toThrow(/too many/iu);
    expect(() =>
      parsePromptGeneratedQuestionV2({
        ...question(),
        options: [question().options[0]],
      }),
    ).toThrow(/two to four/iu);
    expect(() =>
      parsePromptGeneratedQuestionV2({
        ...question(),
        options: Array.from({ length: 5 }, (_, index) => ({
          id: `option-${index}`,
          label: `Option ${index}`,
          value: `Value ${index}`,
        })),
      }),
    ).toThrow(/two to four/iu);
  });

  it.each([
    ["ID", { ...question(), id: "" }],
    ["question", question({ question: " " })],
    ["gap", question({ gap: "" })],
    [
      "option ID",
      question({
        options: [
          { ...question().options[0]!, id: "" },
          question().options[1]!,
        ],
      }),
    ],
    [
      "option label",
      question({
        options: [
          { ...question().options[0]!, label: "" },
          question().options[1]!,
        ],
      }),
    ],
    [
      "option value",
      question({
        options: [
          { ...question().options[0]!, value: "  " },
          question().options[1]!,
        ],
      }),
    ],
  ])("rejects an empty %s", (_label, candidate) => {
    expect(() => parsePromptGeneratedQuestionV2(candidate)).toThrow();
  });

  it("rejects an ID over its ASCII character and byte budget", () => {
    expect(() =>
      parsePromptGeneratedQuestionV2(
        question({
          id: `question-${"a".repeat(
            PROMPT_GENERATED_QUESTION_LIMITS_V2.id.maxChars,
          )}`,
        }),
      ),
    ).toThrow(/bounded stable kebab-case ID/iu);
  });

  it.each([
    [
      "question characters",
      question({
        question: "a".repeat(
          PROMPT_GENERATED_QUESTION_LIMITS_V2.question.maxChars + 1,
        ),
      }),
    ],
    ["question UTF-8 bytes", question({ question: "界".repeat(129) })],
    [
      "gap characters",
      question({
        gap: "a".repeat(PROMPT_GENERATED_QUESTION_LIMITS_V2.gap.maxChars + 1),
      }),
    ],
    ["gap UTF-8 bytes", question({ gap: "界".repeat(171) })],
    [
      "option label characters",
      question({
        options: [
          {
            ...question().options[0]!,
            label: "a".repeat(
              PROMPT_GENERATED_QUESTION_LIMITS_V2.optionLabel.maxChars + 1,
            ),
          },
          question().options[1]!,
        ],
      }),
    ],
    [
      "option label UTF-8 bytes",
      question({
        options: [
          { ...question().options[0]!, label: "界".repeat(54) },
          question().options[1]!,
        ],
      }),
    ],
    [
      "option value characters",
      question({
        options: [
          {
            ...question().options[0]!,
            value: "a".repeat(
              PROMPT_GENERATED_QUESTION_LIMITS_V2.optionValue.maxChars + 1,
            ),
          },
          question().options[1]!,
        ],
      }),
    ],
    [
      "option value UTF-8 bytes",
      question({
        options: [
          { ...question().options[0]!, value: "界".repeat(171) },
          question().options[1]!,
        ],
      }),
    ],
  ])("rejects oversized %s", (_label, candidate) => {
    expect(() => parsePromptGeneratedQuestionV2(candidate)).toThrow(
      /character or UTF-8 byte limit/iu,
    );
  });

  it.each([
    ["control", question({ question: "Who owns\nverification?" })],
    ["NUL", question({ gap: "Missing\0ownership." })],
    ["markup", question({ question: "Choose <strong>owner</strong>?" })],
    ["link", question({ question: "Choose https://example.com/owner?" })],
    [
      "secret",
      question({
        options: [
          {
            ...question().options[0]!,
            value: "api_key=abcdefghijklmnop",
          },
          question().options[1]!,
        ],
      }),
    ],
  ])("rejects %s material", (_label, candidate) => {
    expect(() => parsePromptGeneratedQuestionV2(candidate)).toThrow(
      /non-plain-text/iu,
    );
  });

  it("rejects stale base hashes and extra direct-result keys", () => {
    const request = analyzeRequest();
    expect(() =>
      parsePromptSemanticProviderTextV2(
        providerText([question()]).replace(request.baseHash, "0".repeat(64)),
        request,
      ),
    ).toThrow(/requested operation/iu);
    expect(() =>
      validatePromptSemanticResultV2(request, {
        schemaVersion: "prompt-analyze-result.v3",
        operation: "analyze",
        baseHash: request.baseHash,
        questions: [question()],
        provenance: {
          source: "semantic-provider",
          provider: request.provider,
          model: request.model,
          requestId: request.requestId,
        },
        rawProviderBody: "must-not-cross",
      }),
    ).toThrow(/provenance/iu);
  });

  it("rejects an oversized provider envelope before JSON parsing", () => {
    expect(() =>
      parsePromptSemanticProviderTextV2(
        `{${" ".repeat(PROMPT_SEMANTIC_PROVIDER_RESPONSE_LIMIT_BYTES)}}`,
        analyzeRequest(),
      ),
    ).toThrow(/wire byte limit/iu);
  });
});
