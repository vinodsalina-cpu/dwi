import {
  PROMPT_OPTIMIZED_LIMIT_BYTES,
  PROMPT_CONTEXT_TOTAL_LIMIT_BYTES,
} from "../types.js";
import { canonicalHash } from "./canonical.js";
import { hashPromptSemanticBaseV2 } from "./document.js";
import {
  promptQuestionTargetSectionIdV2,
  promptSectionIds,
  type CompiledPromptDocumentV2,
  type PromptDocumentV2,
  type PromptOriginV2,
  type PromptSectionId,
} from "./types.js";

const SECTION_TITLES: Readonly<Record<PromptSectionId, string>> = {
  task: "Task",
  "desired-outcome": "Desired outcome",
  scope: "Scope",
  "relevant-context": "Relevant context",
  constraints: "Constraints",
  "rules-and-skills": "Rules and skills",
  "acceptance-criteria": "Acceptance criteria",
  "output-contract": "Output contract",
  verification: "Verification",
};

interface MutableCompiledPromptSectionV2 {
  id: PromptSectionId;
  title: string;
  text: string;
  origins: PromptOriginV2[];
  omitted: boolean;
}

function origin(
  id: string,
  kind: PromptOriginV2["kind"],
  label: string,
  sourceId?: string,
): PromptOriginV2 {
  return {
    id,
    kind,
    label,
    ...(sourceId ? { sourceId } : {}),
  };
}

function nonEmpty(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

function baseSections(
  document: PromptDocumentV2,
): MutableCompiledPromptSectionV2[] {
  const includedContexts = document.contexts.filter(
    (context) => context.included,
  );
  const guidance = [
    ...document.guidance.required,
    ...document.guidance.recommended,
    ...document.guidance.optional,
  ].filter(
    (item) =>
      !document.guidance.excluded.some((excluded) => excluded.id === item.id),
  );

  const user = (field: string) =>
    origin(`field:${field}`, "structured-user-field", field, field);
  const sections: MutableCompiledPromptSectionV2[] = [
    {
      id: "task",
      title: SECTION_TITLES.task,
      text: document.baseline.trim(),
      origins: [
        origin("baseline", "user-baseline", "Developer request", "baseline"),
      ],
      omitted: !document.baseline.trim(),
    },
    {
      id: "desired-outcome",
      title: SECTION_TITLES["desired-outcome"],
      text: document.fields.desiredOutcome.trim(),
      origins: [user("desiredOutcome")],
      omitted: !document.fields.desiredOutcome.trim(),
    },
    {
      id: "scope",
      title: SECTION_TITLES.scope,
      text: nonEmpty([
        document.fields.inScope ? `In scope: ${document.fields.inScope}` : "",
        document.fields.outOfScope
          ? `Out of scope: ${document.fields.outOfScope}`
          : "",
      ]),
      origins: [user("inScope"), user("outOfScope")],
      omitted:
        !document.fields.inScope.trim() && !document.fields.outOfScope.trim(),
    },
    {
      id: "relevant-context",
      title: SECTION_TITLES["relevant-context"],
      text: includedContexts
        .map((context) => `[${context.safeLabel}]\n${context.content}`)
        .join("\n\n"),
      origins: includedContexts.map((context) =>
        origin(
          `context:${context.id}`,
          context.source === "governed_project_metadata"
            ? "governed-repository-context"
            : "structured-user-field",
          context.safeLabel,
          context.id,
        ),
      ),
      omitted: includedContexts.length === 0,
    },
    {
      id: "constraints",
      title: SECTION_TITLES.constraints,
      text: document.fields.hardConstraints.trim(),
      origins: [user("hardConstraints")],
      omitted: !document.fields.hardConstraints.trim(),
    },
    {
      id: "rules-and-skills",
      title: SECTION_TITLES["rules-and-skills"],
      text: guidance.map((item) => `- ${item.text}`).join("\n"),
      origins: guidance.map((item) =>
        origin(
          `guidance:${item.id}`,
          item.tier === "required"
            ? "required-guidance"
            : "user-selected-guidance",
          item.provenance,
          item.id,
        ),
      ),
      omitted: guidance.length === 0,
    },
    {
      id: "acceptance-criteria",
      title: SECTION_TITLES["acceptance-criteria"],
      text: document.fields.acceptanceCriteria.trim(),
      origins: [user("acceptanceCriteria")],
      omitted: !document.fields.acceptanceCriteria.trim(),
    },
    {
      id: "output-contract",
      title: SECTION_TITLES["output-contract"],
      text: document.fields.outputFormat.trim(),
      origins: [user("outputFormat")],
      omitted: !document.fields.outputFormat.trim(),
    },
    {
      id: "verification",
      title: SECTION_TITLES.verification,
      text: document.fields.verification.trim(),
      origins: [user("verification")],
      omitted: !document.fields.verification.trim(),
    },
  ];

  for (const answer of document.answers) {
    if (answer.state !== "answered" || !answer.detail?.trim()) continue;
    const target = promptQuestionTargetSectionIdV2(answer.target);
    const section = target
      ? sections.find((candidate) => candidate.id === target)
      : undefined;
    if (!section) continue;
    section.text = nonEmpty([section.text, answer.detail]);
    section.omitted = false;
    section.origins = [
      ...section.origins,
      origin(
        `answer:${answer.questionId}`,
        "question-answer",
        `Answer to ${answer.questionId}`,
        answer.questionId,
      ),
    ];
  }
  return sections;
}

function applySemanticPatches(
  document: PromptDocumentV2,
  sections: MutableCompiledPromptSectionV2[],
  warnings: string[],
): void {
  const semanticBaseHash = hashPromptSemanticBaseV2(document);
  for (const patch of document.semanticPatches) {
    if (patch.status !== "applied") continue;
    if (patch.baseHash !== semanticBaseHash) {
      warnings.push(`Semantic patch ${patch.id} is stale and was excluded.`);
      continue;
    }
    for (const operation of patch.operations) {
      const section = sections.find(({ id }) => id === operation.sectionId);
      if (!section) continue;
      if (document.lockedSections.includes(operation.sectionId)) {
        warnings.push(
          `Semantic patch ${patch.id} cannot target locked section ${operation.sectionId}.`,
        );
        continue;
      }
      if (operation.operation === "remove-section") {
        section.text = "";
        section.omitted = true;
      } else if (operation.operation === "replace-section") {
        section.text = operation.text.trim();
        section.omitted = !section.text;
      } else {
        section.text = nonEmpty([section.text, operation.text]);
        section.omitted = !section.text;
      }
      section.origins = [
        ...section.origins,
        origin(
          `patch:${patch.id}`,
          "semantic-patch",
          `${patch.provider}/${patch.model}`,
          patch.id,
        ),
      ];
    }
  }
}

export function compilePromptDocumentV2(
  document: PromptDocumentV2,
): CompiledPromptDocumentV2 {
  if (!document.baseline.trim()) {
    throw new Error("A non-empty developer request is required.");
  }
  const includedContextBytes = document.contexts
    .filter((context) => context.included)
    .reduce((sum, context) => sum + context.byteCount, 0);
  if (includedContextBytes > PROMPT_CONTEXT_TOTAL_LIMIT_BYTES) {
    throw new Error("Included context exceeds the aggregate byte limit.");
  }

  const warnings: string[] = [];
  const sections = baseSections(document);
  applySemanticPatches(document, sections, warnings);
  const visibleSections = promptSectionIds
    .map((id) => sections.find((section) => section.id === id))
    .filter((section): section is MutableCompiledPromptSectionV2 =>
      Boolean(section),
    )
    .filter((section) => !section.omitted);

  let line = 1;
  const originMap = [];
  const rendered: string[] = [];
  for (const section of visibleSections) {
    const value = `## ${section.title}\n${section.text}`;
    const lines = value.split("\n").length;
    rendered.push(value);
    for (const sectionOrigin of section.origins) {
      originMap.push({
        lineStart: line,
        lineEnd: line + lines - 1,
        sectionId: section.id,
        origin: sectionOrigin,
      });
    }
    line += lines + 1;
  }
  const compiledText = rendered.join("\n\n");
  const byteCount = new TextEncoder().encode(compiledText).byteLength;
  if (byteCount > PROMPT_OPTIMIZED_LIMIT_BYTES) {
    throw new Error("Compiled prompt exceeds the 64 KiB output limit.");
  }

  const compiledHash = canonicalHash({
    documentHash: document.canonicalHash,
    recipeHash: document.definitionSnapshot.compilerRecipe.canonicalHash,
    text: compiledText,
  });
  return {
    schemaVersion: "compiled-prompt.v2",
    documentId: document.id,
    documentRevision: document.revision,
    documentHash: document.canonicalHash,
    compiledHash,
    text: document.manualOverride?.text ?? compiledText,
    sections,
    originMap,
    omittedSectionIds: sections
      .filter((section) => section.omitted)
      .map((section) => section.id),
    byteCount: new TextEncoder().encode(
      document.manualOverride?.text ?? compiledText,
    ).byteLength,
    warnings,
    ...(document.manualOverride
      ? { manualOverrideStatus: document.manualOverride.status }
      : {}),
  };
}
