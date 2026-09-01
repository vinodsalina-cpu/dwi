import {
  buildPromptSemanticProviderInputV2,
  parsePromptSemanticProviderTextV2,
  type PromptSemanticRequestV2,
  type PromptSemanticResultV2,
} from "../v2/semantic.js";
import {
  type ProviderWireScenarioV1,
  validateProviderWireScenarioV1,
} from "./contracts.js";

export interface OpenAiCompatibleSemanticWireRequestV1 {
  readonly method: "POST";
  readonly path: "/v1/chat/completions";
  readonly body: {
    readonly model: string;
    readonly messages: readonly {
      readonly role: "system" | "user";
      readonly content: string;
    }[];
    readonly response_format: { readonly type: "json_object" };
  };
}

export function createOpenAiCompatibleSemanticWireRequestV1(
  request: PromptSemanticRequestV2,
): OpenAiCompatibleSemanticWireRequestV1 {
  const input = buildPromptSemanticProviderInputV2(request);
  return {
    method: "POST",
    path: "/v1/chat/completions",
    body: {
      model: request.model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
      response_format: { type: "json_object" },
    },
  };
}

function parseOpenAiCompatibleSemanticEnvelopeV1(
  envelope: unknown,
  request: PromptSemanticRequestV2,
): PromptSemanticResultV2 {
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !Array.isArray((envelope as { choices?: unknown }).choices) ||
    (envelope as { choices: unknown[] }).choices.length !== 1
  ) {
    throw new Error("OpenAI-compatible response envelope is invalid.");
  }
  const choice = (envelope as { choices: unknown[] }).choices[0];
  const content =
    choice && typeof choice === "object"
      ? (choice as { message?: { content?: unknown } }).message?.content
      : undefined;
  if (typeof content !== "string") {
    throw new Error("OpenAI-compatible response has no JSON message content.");
  }
  return parsePromptSemanticProviderTextV2(content, request);
}

/**
 * Deterministic same-path semantic contract simulator. It is not networking,
 * real inference, or a claim that a configured provider is compatible.
 */
export function simulateOpenAiCompatibleSemanticV1(
  request: PromptSemanticRequestV2,
  scenario: ProviderWireScenarioV1,
): PromptSemanticResultV2 {
  validateProviderWireScenarioV1(scenario);
  if (scenario.kind !== "success") {
    throw new Error(scenario.expectedFailureCode ?? scenario.kind);
  }
  const body =
    request.operation === "analyze"
      ? {
          schemaVersion: "prompt-analyze-result.v3",
          operation: "analyze",
          baseHash: request.baseHash,
          questions: [],
        }
      : request.operation === "enhance"
        ? {
            schemaVersion: "prompt-enhance-result.v2",
            operation: "enhance",
            baseHash: request.baseHash,
            operations: [],
          }
        : {
            schemaVersion: "prompt-validate-result.v2",
            operation: "validate",
            baseHash: request.baseHash,
            violations: [],
          };
  return parseOpenAiCompatibleSemanticEnvelopeV1(
    { choices: [{ message: { content: JSON.stringify(body) } }] },
    request,
  );
}
