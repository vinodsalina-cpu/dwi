import { EMPTY_PROMPT_DRAFT_FIELDS } from "./catalog.js";
import {
  PROMPT_CONTEXT_ITEM_LIMIT_BYTES,
  PROMPT_CONTEXT_MAX_ITEMS,
  PROMPT_CONTEXT_TOTAL_LIMIT_BYTES,
  PROMPT_TEXT_LIMIT_CHARS,
  type PromptDraft,
  type PromptDraftFields,
  type PromptReadiness,
  type PromptTemplate,
  type PromptType,
} from "./types.js";
import {
  parsePromptDraft,
  parsePromptTemplate,
} from "./validation.js";
import { compilePromptDocumentV2 } from "./v2/compiler.js";
import { promptDocumentFromDraftV1 } from "./v2/document.js";

/**
 * Catalog-independent prompt compilation for unprivileged consumers such as
 * webviews. This module intentionally has no dependency on managed template
 * definitions or provider integrations.
 */

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function validateStandaloneTemplate(candidate: unknown): PromptTemplate {
  const template = parsePromptTemplate(candidate);
  if (!template) throw new Error("Invalid prompt template.");
  return template;
}

function promptChars(draft: PromptDraft): number {
  return (
    draft.prompt.length +
    Object.values(draft.fields).reduce(
      (total, value) => total + value.length,
      0,
    )
  );
}

export function evaluateStandalonePromptReadiness(
  draft: PromptDraft,
  referenceFields?: Readonly<PromptDraftFields>,
): PromptReadiness {
  const issues: PromptReadiness["issues"] = [];
  const totalPromptChars = promptChars(draft);
  const contextBytes = draft.contexts.reduce(
    (total, context) => total + utf8Bytes(context.content),
    0,
  );

  if (!draft.prompt.trim()) {
    issues.push({
      code: "prompt_required",
      message: "Enter a prompt before optimizing.",
    });
  }
  if (totalPromptChars > PROMPT_TEXT_LIMIT_CHARS) {
    issues.push({
      code: "prompt_too_long",
      message: `Prompt text must be ${PROMPT_TEXT_LIMIT_CHARS} characters or fewer.`,
    });
  }
  if (draft.contexts.length > PROMPT_CONTEXT_MAX_ITEMS) {
    issues.push({
      code: "too_many_contexts",
      message: `Attach no more than ${PROMPT_CONTEXT_MAX_ITEMS} context items.`,
    });
  }
  for (const context of draft.contexts) {
    if (utf8Bytes(context.content) > PROMPT_CONTEXT_ITEM_LIMIT_BYTES) {
      issues.push({
        code: "context_too_large",
        message: "An attached context item is too large.",
        contextId: context.id,
      });
    }
  }
  if (contextBytes > PROMPT_CONTEXT_TOTAL_LIMIT_BYTES) {
    issues.push({
      code: "context_total_too_large",
      message: "Attached context is too large in total.",
    });
  }

  const fieldIsExplicit = (key: keyof PromptDraftFields) => {
    const value = draft.fields[key].trim();
    return value.length > 0 && value !== referenceFields?.[key].trim();
  };
  const dimensions: PromptReadiness["dimensions"] = [
    {
      id: "outcome",
      ready: fieldIsExplicit("desiredOutcome"),
      message: fieldIsExplicit("desiredOutcome")
        ? "Desired outcome is explicit."
        : "Add the observable outcome this work should produce.",
    },
    {
      id: "scope",
      ready: fieldIsExplicit("inScope") || fieldIsExplicit("outOfScope"),
      message:
        fieldIsExplicit("inScope") || fieldIsExplicit("outOfScope")
          ? "Scope boundaries are present."
          : "Name what is in scope or must remain out of scope.",
    },
    {
      id: "constraints",
      ready: fieldIsExplicit("hardConstraints"),
      message: fieldIsExplicit("hardConstraints")
        ? "Hard constraints are explicit."
        : "Add any non-negotiable limits or state that none are known.",
    },
    {
      id: "verification",
      ready: fieldIsExplicit("verification"),
      message: fieldIsExplicit("verification")
        ? "Verification is defined."
        : "Describe the checks that should verify the work.",
    },
    {
      id: "output_shape",
      ready: fieldIsExplicit("outputFormat"),
      message: fieldIsExplicit("outputFormat")
        ? "Output shape is defined."
        : "Describe the response or deliverable format.",
    },
    {
      id: "acceptance_criteria",
      ready: fieldIsExplicit("acceptanceCriteria"),
      message: fieldIsExplicit("acceptanceCriteria")
        ? "Acceptance criteria are present."
        : "Add observable criteria that prove the task is complete.",
    },
  ];

  return {
    ready: issues.length === 0,
    issues,
    dimensions,
    promptChars: totalPromptChars,
    contextCount: draft.contexts.length,
    contextBytes,
  };
}

export interface StandaloneCompiledPromptDraft {
  compiledPrompt: string;
  readiness: PromptReadiness;
}

export function compileStandalonePromptDraft(
  candidate: unknown,
): StandaloneCompiledPromptDraft {
  const draft = parsePromptDraft(candidate);
  if (!draft) throw new Error("Invalid prompt draft.");
  const readiness = evaluateStandalonePromptReadiness(draft);
  if (!readiness.ready) throw new Error("Invalid prompt draft.");
  const document = promptDocumentFromDraftV1(draft, {
    id: "current-prompt",
    now: "1970-01-01T00:00:00.000Z",
  });
  return {
    compiledPrompt: compilePromptDocumentV2(document).text,
    readiness,
  };
}

export function createStandaloneEmptyPromptDraft(
  promptType: PromptType = "General",
): PromptDraft {
  return {
    promptType,
    prompt: "",
    fields: { ...EMPTY_PROMPT_DRAFT_FIELDS },
    contexts: [],
    guidancePackIds: [],
  };
}

export function createStandalonePromptDraftFromTemplate(
  candidate: unknown,
): PromptDraft {
  const template = validateStandaloneTemplate(candidate);
  return {
    promptType: template.promptType,
    prompt: template.prompt,
    fields: { ...template.fields },
    contexts: [],
    guidancePackIds: [...template.recommendedGuidancePackIds],
    templateId: template.id,
  };
}
