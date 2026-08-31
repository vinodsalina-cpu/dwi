import {
  PROMPT_TEXT_LIMIT_CHARS,
  isEntityId,
  promptTypes,
  type PromptType,
} from "@platform/domain-prompt-optimizer";
import { DWI_MODULES, type DwiOutputSize } from "@platform/dwi-core";

export interface PromptComposeInput {
  task: string;
  assignmentId: string;
  promptType: PromptType;
  outputSize: DwiOutputSize;
}

export interface PromptCompileRequest extends PromptComposeInput {
  type: "dwi.candidate.compile";
  selectedModuleIds: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function containsUnsafeControlText(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if ((codePoint < 32 && character !== "\n" && character !== "\r" && character !== "\t") || codePoint === 127) return true;
  }
  return false;
}

export function isPromptComposeInput(value: unknown): value is PromptComposeInput {
  if (!isRecord(value) || !hasExactKeys(value, ["task", "assignmentId", "promptType", "outputSize"])) return false;
  const task = value.task;
  return typeof task === "string" && task.trim().length > 0 && task.length <= PROMPT_TEXT_LIMIT_CHARS &&
    !containsUnsafeControlText(task) &&
    isEntityId(value.assignmentId) &&
    (promptTypes as readonly unknown[]).includes(value.promptType) &&
    (value.outputSize === "low" || value.outputSize === "medium" || value.outputSize === "high" || value.outputSize === "auto");
}

/** Strictly validates the prompt editor payload before it crosses from the
 * webview into the privileged extension host. */
export function parsePromptCompileRequest(value: unknown): PromptCompileRequest | undefined {
  if (!isRecord(value) || value.type !== "dwi.candidate.compile" || !hasExactKeys(value, [
    "type", "selectedModuleIds", "task", "assignmentId", "promptType", "outputSize",
  ])) return undefined;

  const compose = {
    task: value.task,
    assignmentId: value.assignmentId,
    promptType: value.promptType,
    outputSize: value.outputSize,
  };
  if (!isPromptComposeInput(compose) || !Array.isArray(value.selectedModuleIds) || value.selectedModuleIds.length === 0) return undefined;
  const knownIds = new Set(DWI_MODULES.map(({ id }) => id));
  if (value.selectedModuleIds.length > knownIds.size ||
      value.selectedModuleIds.some((id) => typeof id !== "string" || !knownIds.has(id)) ||
      new Set(value.selectedModuleIds).size !== value.selectedModuleIds.length) return undefined;

  return {
    type: value.type,
    selectedModuleIds: [...value.selectedModuleIds] as string[],
    task: compose.task.trim(),
    assignmentId: compose.assignmentId,
    promptType: compose.promptType,
    outputSize: compose.outputSize,
  };
}
