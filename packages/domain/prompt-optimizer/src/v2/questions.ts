import type { PromptDraftFields, PromptType } from "../types.js";
import { PROMPT_QUESTION_POLICY_V2 } from "./question-policy.js";
import {
  promptDraftFieldSectionIdsV2,
  promptQuestionTargetSectionIdV2,
  type PromptAnswerV2,
  type PromptDocumentV2,
  type PromptSectionId,
} from "./types.js";

export interface PromptQuestionOptionV2 {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly value: string;
  readonly nextQuestionId?: string;
}

export interface PromptQuestionDefinitionV2 {
  readonly id: string;
  readonly version: "2.0.0";
  readonly field: keyof PromptDraftFields;
  readonly target: PromptSectionId;
  readonly question: string;
  readonly options: readonly PromptQuestionOptionV2[];
  readonly defaultOptionId?: string;
  readonly requiredForTypes: readonly PromptType[];
  readonly priority: number;
}

function options(
  values: readonly [id: string, label: string, detail: string, value: string][],
): readonly PromptQuestionOptionV2[] {
  return values.map(([id, label, detail, value]) => ({
    id,
    label,
    detail,
    value,
  }));
}

export const PROMPT_QUESTION_BANK_V2: readonly PromptQuestionDefinitionV2[] = [
  {
    id: "outcome-observable",
    version: "2.0.0",
    field: "desiredOutcome",
    target: promptDraftFieldSectionIdsV2.desiredOutcome,
    question: "Which outcome should be observable when this task is complete?",
    options: options([
      [
        "behavior",
        "Behavior works",
        "Name the behavior that must succeed.",
        "Make the requested behavior work as described.",
      ],
      [
        "defect",
        "Failure removed",
        "Eliminate a reproducible failure.",
        "Eliminate the reported failure without changing unrelated behavior.",
      ],
      [
        "decision",
        "Decision recorded",
        "Produce an actionable decision.",
        "Produce an evidence-backed decision with explicit tradeoffs.",
      ],
    ]),
    requiredForTypes: ["General", "Bug fix", "Architecture"],
    priority: 100,
  },
  {
    id: "scope-boundary",
    version: "2.0.0",
    field: "inScope",
    target: promptDraftFieldSectionIdsV2.inScope,
    question: "What is the narrowest boundary this task may change?",
    options: options([
      [
        "path",
        "Named area only",
        "Limit work to the named module or path.",
        "Change only the named module, path, and directly required consumers.",
      ],
      [
        "behavior",
        "Failure path only",
        "Limit work to one observable path.",
        "Change only the affected behavior and its regression coverage.",
      ],
      [
        "decision",
        "Analysis only",
        "Do not mutate implementation.",
        "Analyze and report; do not change product code.",
      ],
    ]),
    requiredForTypes: ["Bug fix", "Refactor", "Security review", "Migration"],
    priority: 95,
  },
  {
    id: "constraint-priority",
    version: "2.0.0",
    field: "hardConstraints",
    target: promptDraftFieldSectionIdsV2.hardConstraints,
    question: "Which constraint must win if implementation tradeoffs appear?",
    options: options([
      [
        "compatibility",
        "Compatibility",
        "Preserve current contracts.",
        "Preserve current public contracts and compatibility.",
      ],
      [
        "security",
        "Security",
        "Fail closed at trust boundaries.",
        "Do not weaken authentication, authorization, or secret boundaries.",
      ],
      [
        "behavior",
        "Behavior parity",
        "Keep observable behavior stable.",
        "Preserve current observable behavior unless explicitly approved.",
      ],
    ]),
    requiredForTypes: ["Refactor", "Security review", "Migration"],
    priority: 90,
  },
  {
    id: "verification-depth",
    version: "2.0.0",
    field: "verification",
    target: promptDraftFieldSectionIdsV2.verification,
    question: "What evidence should prove the result?",
    options: options([
      [
        "focused",
        "Focused checks",
        "Run the owning focused checks.",
        "Run focused checks for the changed behavior and report outcomes.",
      ],
      [
        "affected",
        "Affected graph",
        "Verify affected consumers too.",
        "Run focused checks and the affected reverse-dependency graph.",
      ],
      [
        "manual",
        "Manual observation",
        "Record a direct operator check.",
        "Record the required automated checks and direct manual observation separately.",
      ],
    ]),
    requiredForTypes: ["Test creation", "Bug fix", "Migration"],
    priority: 85,
  },
  {
    id: "output-shape",
    version: "2.0.0",
    field: "outputFormat",
    target: promptDraftFieldSectionIdsV2.outputFormat,
    question: "Which response shape is most useful after the work?",
    options: options([
      [
        "patch-report",
        "Patch report",
        "Outcome, changes, checks, risks.",
        "Return outcome, changed areas, checks run, and remaining risks.",
      ],
      [
        "concise",
        "Concise answer",
        "Short result and next action.",
        "Return a concise result and the next safe action.",
      ],
      [
        "json",
        "JSON shape",
        "Machine-readable bounded fields.",
        "Return valid JSON with outcome, changes, verification, and risks.",
      ],
    ]),
    requiredForTypes: ["Documentation", "Code explanation"],
    priority: 75,
  },
  {
    id: "acceptance-proof",
    version: "2.0.0",
    field: "acceptanceCriteria",
    target: promptDraftFieldSectionIdsV2.acceptanceCriteria,
    question: "What must be true before the work can be called complete?",
    options: options([
      [
        "observable",
        "Observable result",
        "The requested behavior is directly visible.",
        "The requested result is observable and the named checks pass.",
      ],
      [
        "parity",
        "Parity retained",
        "Old and new behavior match.",
        "Characterization remains green before and after the change.",
      ],
      [
        "safe-migration",
        "Safe migration",
        "Forward and rollback paths work.",
        "Migrate, roll back where supported, and re-migrate without data loss.",
      ],
    ]),
    requiredForTypes: ["Refactor", "Migration", "Bug fix"],
    priority: 80,
  },
] as const;

export interface PromptQuestionFlowV2 {
  readonly questionIds: readonly string[];
  readonly currentIndex: number;
  readonly answers: readonly PromptAnswerV2[];
  readonly status: "idle" | "active" | "complete" | "retained-draft";
}

export function lintPromptQuestionDefinitionV2(
  definition: PromptQuestionDefinitionV2,
): readonly string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(definition.id)) {
    errors.push("Question ID must be kebab-case.");
  }
  if (definition.question.length === 0 || definition.question.length > 120) {
    errors.push("Question text must contain 1 to 120 characters.");
  }
  if (definition.options.length < 2 || definition.options.length > 5) {
    errors.push("Question definitions require two to five options.");
  }
  if (
    new Set(definition.options.map(({ id }) => id)).size !==
    definition.options.length
  ) {
    errors.push("Question option IDs must be unique.");
  }
  if (definition.options.some(({ detail }) => detail.length > 72)) {
    errors.push("Question option detail must not exceed 72 characters.");
  }
  return errors;
}

export function selectPromptQuestionsV2(
  document: Pick<PromptDocumentV2, "promptType" | "fields" | "answers">,
  allowlistedQuestionIds?: readonly string[],
): PromptQuestionFlowV2 {
  const answeredTargets = new Set(
    document.answers
      .filter(({ state }) => state === "answered")
      .map(({ target }) => promptQuestionTargetSectionIdV2(target))
      .filter((target): target is PromptSectionId => Boolean(target)),
  );
  const allowlist = allowlistedQuestionIds
    ? new Set(allowlistedQuestionIds)
    : undefined;
  const candidates = PROMPT_QUESTION_BANK_V2.filter(
    (definition) =>
      (!allowlist || allowlist.has(definition.id)) &&
      !document.fields[definition.field].trim() &&
      !answeredTargets.has(definition.target),
  ).sort((left, right) => {
    const leftType = left.requiredForTypes.includes(document.promptType)
      ? 1
      : 0;
    const rightType = right.requiredForTypes.includes(document.promptType)
      ? 1
      : 0;
    return (
      rightType - leftType ||
      right.priority - left.priority ||
      left.id.localeCompare(right.id)
    );
  });
  const seenTargets = new Set<PromptSectionId>();
  const questionIds = candidates
    .filter((definition) => {
      if (seenTargets.has(definition.target)) return false;
      seenTargets.add(definition.target);
      return true;
    })
    .slice(0, PROMPT_QUESTION_POLICY_V2.maxQuestions)
    .map(({ id }) => id);
  return {
    questionIds,
    currentIndex: 0,
    answers: [...document.answers],
    status: questionIds.length ? "active" : "complete",
  };
}

export function answerPromptQuestionV2(
  flow: PromptQuestionFlowV2,
  questionId: string,
  optionId: string | undefined,
  detail: string | undefined,
): PromptQuestionFlowV2 {
  const definition = PROMPT_QUESTION_BANK_V2.find(
    ({ id }) => id === questionId,
  );
  if (!definition || !flow.questionIds.includes(questionId)) {
    throw new Error("Question is not part of the active local flow.");
  }
  const option = optionId
    ? definition.options.find(({ id }) => id === optionId)
    : undefined;
  if (optionId && !option)
    throw new Error("Question option is not allowlisted.");
  const answer: PromptAnswerV2 = {
    questionId,
    target: definition.target,
    state: option ? "answered" : "ignored",
    ...(option ? { optionId: option.id } : {}),
    ...(option
      ? {
          detail: detail?.trim() ? `${option.value}\n${detail}` : option.value,
        }
      : detail?.trim()
        ? { detail }
        : {}),
    ...(option ? { originId: `answer:${questionId}` } : {}),
  };
  const answers = [
    ...flow.answers.filter((candidate) => candidate.questionId !== questionId),
    answer,
  ];
  const currentIndex = Math.min(flow.currentIndex + 1, flow.questionIds.length);
  return {
    ...flow,
    answers,
    currentIndex,
    status: currentIndex >= flow.questionIds.length ? "complete" : "active",
  };
}

export function retainPromptQuestionDraftV2(
  flow: PromptQuestionFlowV2,
): PromptQuestionFlowV2 {
  return { ...flow, status: "retained-draft" };
}
