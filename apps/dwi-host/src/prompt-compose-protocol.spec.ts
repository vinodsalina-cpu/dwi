import { describe, expect, it } from "vitest";
import { PROMPT_TEXT_LIMIT_CHARS } from "@platform/domain-prompt-optimizer";
import { parsePromptCompileRequest } from "./prompt-compose-protocol.js";

const valid = {
  type: "dwi.candidate.compile",
  selectedModuleIds: ["orientation", "verification"],
  task: "  Repair checkout retries.  ",
  assignmentId: "bug-fix",
  promptType: "Bug fix",
  outputSize: "low",
} as const;

describe("prompt compose protocol", () => {
  it("accepts the exact prompt editor payload and normalizes its task", () => {
    expect(parsePromptCompileRequest(valid)).toEqual({ ...valid, task: "Repair checkout retries." });
  });

  it.each([
    ["extra fields", { ...valid, extra: true }],
    ["empty task", { ...valid, task: " \n " }],
    ["oversized task", { ...valid, task: "x".repeat(PROMPT_TEXT_LIMIT_CHARS + 1) }],
    ["control text", { ...valid, task: "repair\u0000checkout" }],
    ["unsafe assignment", { ...valid, assignmentId: "../bug-fix" }],
    ["unknown type", { ...valid, promptType: "Marketing" }],
    ["unknown output size", { ...valid, outputSize: "huge" }],
    ["empty modules", { ...valid, selectedModuleIds: [] }],
    ["unknown module", { ...valid, selectedModuleIds: ["orientation", "unknown"] }],
    ["duplicate modules", { ...valid, selectedModuleIds: ["orientation", "orientation"] }],
  ])("rejects %s", (_label, payload) => {
    expect(parsePromptCompileRequest(payload)).toBeUndefined();
  });
});
