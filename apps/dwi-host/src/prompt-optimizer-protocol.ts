import {
  PROMPT_TEXT_LIMIT_CHARS,
  isEntityId,
  promptTypes,
  type PromptType,
} from "@platform/domain-prompt-optimizer";
import type { DwiOutputSize } from "@platform/dwi-core";

export const PROMPT_COMMAND_SCHEMA = "prompt-command.v2" as const;

/**
 * Resolve is an ephemeral protocol-visible transition. Persisted view state
 * remains limited to recoverable input/review checkpoints.
 */
export type PromptOptimizerView = "input" | "resolve" | "review";

interface PromptCommandIdentity {
  schemaVersion: typeof PROMPT_COMMAND_SCHEMA;
  requestId: string;
  correlationId: string;
  cancellationId: string;
  documentId: string;
  revision: number;
  baseHash: string;
}

export interface PromptOptimizerInput {
  task: string;
  assignmentId: string;
  promptType: PromptType;
  outputSize: DwiOutputSize;
}

export type PromptOptimizerCommand =
  | (PromptCommandIdentity & { type: "prompt.v2.compile"; input: PromptOptimizerInput })
  | (PromptCommandIdentity & { type: "prompt.v2.semantic"; operation: "enhance"; input: PromptOptimizerInput })
  | Pick<PromptCommandIdentity, "schemaVersion" | "requestId" | "correlationId" | "cancellationId"> & { type: "prompt.v2.cancel" }
  | Pick<PromptCommandIdentity, "schemaVersion" | "requestId" | "correlationId" | "documentId"> & { type: "prompt.v2.record.save" }
  | { type: "prompt.v2.draft.save"; schemaVersion: typeof PROMPT_COMMAND_SCHEMA; input: PromptOptimizerInput }
  | { type: "prompt.v2.review.open"; schemaVersion: typeof PROMPT_COMMAND_SCHEMA }
  | { type: "prompt.v2.view.set"; schemaVersion: typeof PROMPT_COMMAND_SCHEMA; view: PromptOptimizerView };

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const HASH = /^[a-f0-9]{64}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function identity(value: Record<string, unknown>): value is Record<string, unknown> & PromptCommandIdentity {
  return value.schemaVersion === PROMPT_COMMAND_SCHEMA &&
    typeof value.requestId === "string" && ID.test(value.requestId) &&
    typeof value.correlationId === "string" && ID.test(value.correlationId) &&
    typeof value.cancellationId === "string" && ID.test(value.cancellationId) &&
    typeof value.documentId === "string" && ID.test(value.documentId) &&
    Number.isSafeInteger(value.revision) && Number(value.revision) >= 0 &&
    typeof value.baseHash === "string" && HASH.test(value.baseHash);
}

function optimizerInput(value: unknown, allowEmptyTask = false): value is PromptOptimizerInput {
  if (!record(value) || !exact(value, ["task", "assignmentId", "promptType", "outputSize"])) return false;
  return typeof value.task === "string" && (allowEmptyTask || value.task.trim().length > 0) && value.task.length <= PROMPT_TEXT_LIMIT_CHARS &&
    isEntityId(value.assignmentId) && (promptTypes as readonly unknown[]).includes(value.promptType) &&
    (value.outputSize === "low" || value.outputSize === "medium" || value.outputSize === "high" || value.outputSize === "auto");
}

export function parsePromptOptimizerCommand(value: unknown): PromptOptimizerCommand | undefined {
  if (!record(value) || typeof value.type !== "string") return undefined;
  if (value.type === "prompt.v2.review.open") {
    if (!exact(value, ["type", "schemaVersion"]) || value.schemaVersion !== PROMPT_COMMAND_SCHEMA) return undefined;
    return value as PromptOptimizerCommand;
  }
  if (value.type === "prompt.v2.view.set") {
    if (!exact(value, ["type", "schemaVersion", "view"]) || value.schemaVersion !== PROMPT_COMMAND_SCHEMA || (value.view !== "input" && value.view !== "resolve" && value.view !== "review")) return undefined;
    return value as PromptOptimizerCommand;
  }
  if (value.type === "prompt.v2.draft.save") {
    if (!exact(value, ["type", "schemaVersion", "input"]) || value.schemaVersion !== PROMPT_COMMAND_SCHEMA || !optimizerInput(value.input, true)) return undefined;
    return { ...value, input: { ...value.input } } as PromptOptimizerCommand;
  }
  if (value.type === "prompt.v2.cancel") {
    if (!exact(value, ["type", "schemaVersion", "requestId", "correlationId", "cancellationId"]) || value.schemaVersion !== PROMPT_COMMAND_SCHEMA) return undefined;
    if (![value.requestId, value.correlationId, value.cancellationId].every((id) => typeof id === "string" && ID.test(id))) return undefined;
    return value as PromptOptimizerCommand;
  }
  if (value.type === "prompt.v2.record.save") {
    if (!exact(value, ["type", "schemaVersion", "requestId", "correlationId", "documentId"]) || value.schemaVersion !== PROMPT_COMMAND_SCHEMA) return undefined;
    if (![value.requestId, value.correlationId, value.documentId].every((id) => typeof id === "string" && ID.test(id))) return undefined;
    return value as PromptOptimizerCommand;
  }
  const semantic = value.type === "prompt.v2.semantic";
  const keys = semantic
    ? ["type", "schemaVersion", "requestId", "correlationId", "cancellationId", "documentId", "revision", "baseHash", "operation", "input"]
    : ["type", "schemaVersion", "requestId", "correlationId", "cancellationId", "documentId", "revision", "baseHash", "input"];
  if ((value.type !== "prompt.v2.compile" && !semantic) || !exact(value, keys) || !identity(value) || !optimizerInput(value.input)) return undefined;
  if (semantic && value.operation !== "enhance") return undefined;
  return { ...value, input: { ...value.input, task: value.input.task.trim() } } as PromptOptimizerCommand;
}
