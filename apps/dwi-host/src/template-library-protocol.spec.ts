import { describe, expect, it } from "vitest";
import type { PromptTemplateInput } from "@platform/domain-prompt-optimizer";
import {
  TEMPLATE_CLONE_EXTENSIONS,
  TEMPLATE_CLONE_LIMIT_BYTES,
  decodeTemplateCloneBytes,
  parseTemplateCloneText,
  parseTemplateLibraryMessage,
} from "./template-library-protocol.js";

const fields = {
  title: "Bounded task",
  desiredOutcome: "Ship the requested behavior.",
  inScope: "The requested slice.",
  outOfScope: "Unrelated work.",
  verification: "Run focused tests.",
  outputFormat: "Code and a concise summary.",
  hardConstraints: "Keep data local.",
  acceptanceCriteria: "The focused tests pass.",
};

function template(overrides: Partial<PromptTemplateInput> = {}): PromptTemplateInput {
  return {
    name: "Personal template",
    description: "A bounded template.",
    promptType: "General",
    prompt: "Implement the requested change.",
    fields: { ...fields },
    recommendedGuidancePackIds: ["outcome", "verification"],
    ...overrides,
  };
}

describe("template library protocol", () => {
  it("strictly parses every Library command and rejects extra or malformed fields", () => {
    const messages = [
      { type: "dwi.library.open" },
      { type: "dwi.library.item.get", templateId: "general" },
      { type: "dwi.library.template.save", operationId: "op:save", expectedRevision: 0, template: template() },
      { type: "dwi.library.template.delete", operationId: "op:delete", expectedRevision: 1, templateId: "template:1" },
      { type: "dwi.library.feedback.submit", operationId: "op:feedback", expectedRevision: 1, templateId: "general", rating: "helpful", stars: 5, note: "Useful." },
      { type: "dwi.library.clone.file.pick", operationId: "op:file" },
      { type: "dwi.library.clone.paste.validate", operationId: "op:paste", text: "# Prompt\nDo the work." },
    ] as const;
    for (const message of messages) expect(parseTemplateLibraryMessage(message)).toEqual(message);

    for (const message of [
      { type: "dwi.library.open", extra: true },
      { type: "dwi.library.item.get", templateId: "../bad" },
      { type: "dwi.library.template.save", operationId: "op", expectedRevision: -1, template: template() },
      { type: "dwi.library.template.save", operationId: "op", expectedRevision: 0, template: { ...template(), extra: true } },
      { type: "dwi.library.template.delete", operationId: "bad operation", expectedRevision: 0, templateId: "template:1" },
      { type: "dwi.library.feedback.submit", operationId: "op", expectedRevision: 0, templateId: "general", rating: 5 },
      { type: "dwi.library.feedback.submit", operationId: "op", expectedRevision: 0, templateId: "general", rating: "helpful", stars: 3 },
      { type: "dwi.library.feedback.submit", operationId: "op", expectedRevision: 0, templateId: "general", rating: "helpful", stars: 6 },
      { type: "dwi.library.feedback.submit", operationId: "op", expectedRevision: 0, templateId: "general", rating: "helpful", stars: 5, note: "x".repeat(1_001) },
      { type: "dwi.library.clone.file.pick", operationId: "op", extra: true },
      { type: "dwi.library.clone.paste.validate", operationId: "op", text: 1 },
      { type: "dwi.library.clone.paste.validate", operationId: "op", text: "x".repeat(TEMPLATE_CLONE_LIMIT_BYTES + 1) },
    ]) expect(parseTemplateLibraryMessage(message)).toBeUndefined();
  });

  it("accepts canonical JSON while removing caller-controlled IDs from clone drafts", () => {
    const result = parseTemplateCloneText(JSON.stringify(template({ templateId: "template:caller" })));
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.template.name).toBe("Personal template");
      expect(result.template.templateId).toBeUndefined();
      expect(result.template.fields).not.toBe(fields);
    }

    const fenced = parseTemplateCloneText(`\`\`\`json\n${JSON.stringify(template())}\n\`\`\``);
    expect(fenced.status).toBe("ready");
    expect(parseTemplateCloneText('{"name": "not canonical"}')).toMatchObject({ status: "invalid" });
    expect(parseTemplateCloneText("{not json}")).toMatchObject({ status: "invalid" });
  });

  it("maps Markdown/plain AI responses into safe generic drafts", () => {
    const result = parseTemplateCloneText("# Review the migration\n\nPlan a staged migration with rollback.");
    expect(result).toMatchObject({
      status: "ready",
      template: {
        name: "Review the migration",
        promptType: "General",
        prompt: "# Review the migration\n\nPlan a staged migration with rollback.",
        recommendedGuidancePackIds: [],
      },
    });
  });

  it("rejects empty, oversized, binary-like, and invalid UTF-8 clone input", () => {
    expect(parseTemplateCloneText(" \n ")).toMatchObject({ status: "invalid" });
    expect(parseTemplateCloneText(`valid\u0000binary`)).toMatchObject({ status: "invalid" });
    expect(parseTemplateCloneText("x".repeat(TEMPLATE_CLONE_LIMIT_BYTES + 1))).toMatchObject({ status: "invalid" });
    expect(decodeTemplateCloneBytes(new Uint8Array([0xff, 0xfe]))).toMatchObject({ status: "invalid" });
    expect(TEMPLATE_CLONE_EXTENSIONS).toEqual([".md", ".txt", ".json", ".yaml", ".yml"]);
  });
});
