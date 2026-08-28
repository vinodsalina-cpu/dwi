import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import React, { act } from "react";
import { compileDwiCandidate, DWI_MODULES } from "@platform/dwi-core";
import { PROJECT_UI_FIXTURES } from "./project-fixtures.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const brief = {
  version: "dwi.brief.v1" as const,
  projectName: "DWI",
  archetype: "TypeScript monorepo",
  stack: ["TypeScript", "React"],
  packageManager: "pnpm",
  scripts: ["test"],
  modules: ["apps", "packages"],
  facts: [{ id: "manifest", label: "Workspace", value: "pnpm", confidence: "high" as const, evidence: "package.json" }],
  unknowns: [],
  confirmed: true,
  corrections: "",
};

const managedLibrary = {
  revision: 1,
  managed: [{ id: "general", kind: "managed", immutable: true, name: "General delivery brief", description: "General template", promptType: "General" }],
  personal: [], recent: [], personalLimit: 25, personalRemaining: 25,
};

function hostMessage(data: unknown) { window.dispatchEvent(new MessageEvent("message", { data })); }

describe("DWI Home, Initializer, and Prompt Optimizer", () => {
  it("keeps initialization separate and makes local preview, LLM rewrite, cancellation, and recents explicit", async () => {
    const posted: unknown[] = [];
    Object.defineProperty(globalThis, "acquireVsCodeApi", { configurable: true, value: () => ({ postMessage: (message: unknown) => posted.push(message) }) });
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => { await import("./main.js"); });

    expect(screen.getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Project Initializer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Prompt Optimizer" })).toBeTruthy();
    expect(screen.getByText("Local")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Provider status: missing/ })).toBeTruthy();

    await act(async () => { hostMessage({ type: "dwi.snapshot.absent" }); });
    expect(screen.getByRole("heading", { name: "Initialize this project" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start initialization" }));
    expect(screen.getByLabelText("Step 1 of 2: Access")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reset session" })).toBeNull();

    await act(async () => {
      hostMessage({ type: "dwi.library.state", state: managedLibrary });
      hostMessage({ type: "dwi.project.snapshot", snapshot: { ...PROJECT_UI_FIXTURES.current, projectName: "DWI", reviewed: true } });
      hostMessage({ type: "dwi.brief.confirmed", brief });
      hostMessage({ type: "dwi.provider.state", settings: { mode: "gemini", model: "gemini-2.5-flash", configured: true, health: "ready", checkedAt: "2026-08-28T00:00:00.000Z" } });
      hostMessage({ type: "prompt.v2.recents", recents: [{ id: "recent-1", title: "Secure provider setup", preview: "Implement provider verification…", promptType: "Security review", updatedAt: "2026-08-28T00:00:00.000Z", provider: "gemini", model: "gemini-2.5-flash" }] });
    });

    expect(screen.getByRole("heading", { name: "DWI" })).toBeTruthy();
    expect(screen.getByText("Secure provider setup")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Prompt Optimizer" }));
    expect(screen.getByRole("navigation", { name: "Prompt Optimizer steps" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /1 Input/ }).getAttribute("aria-current")).toBe("step");
    expect((screen.getByRole("button", { name: /2 Review/ }) as HTMLButtonElement).disabled).toBe(true);
    const task = screen.getByRole("textbox", { name: "Task to optimize" }) as HTMLTextAreaElement;
    expect(task.disabled).toBe(false);
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.change(task, { target: { value: "Implement a safe provider retry flow." } });

    fireEvent.click(screen.getByRole("button", { name: "Preview locally" }));
    const compile = posted.findLast((message) => (message as { type?: string }).type === "prompt.v2.compile") as Record<string, unknown>;
    expect(compile).toMatchObject({ type: "prompt.v2.compile", schemaVersion: "prompt-command.v2", documentId: "current-prompt", revision: 1 });
    expect(compile).not.toHaveProperty("selectedModuleIds");

    const localCandidate = compileDwiCandidate(brief, DWI_MODULES.filter(({ defaultSelected }) => defaultSelected).map(({ id }) => id), { task: "Implement a safe provider retry flow.", promptType: "General", outputSize: "low" });
    await act(async () => { hostMessage({ type: "prompt.v2.compiled", requestId: compile.requestId, candidate: localCandidate }); });
    expect(screen.getByText("Step 2 · Local preview")).toBeTruthy();
    expect(screen.getByRole("button", { name: /2 Review/ }).getAttribute("aria-current")).toBe("step");
    expect(screen.queryByRole("textbox", { name: "Task to optimize" })).toBeNull();
    expect(screen.getByRole("region", { name: "Generated prompt" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open in editor" }));
    expect(posted.findLast((message) => (message as { type?: string }).type === "prompt.v2.review.open")).toEqual({ type: "prompt.v2.review.open", schemaVersion: "prompt-command.v2" });

    fireEvent.click(screen.getByRole("button", { name: "Rewrite with LLM" }));
    const semantic = posted.findLast((message) => (message as { type?: string }).type === "prompt.v2.semantic") as Record<string, unknown>;
    expect(semantic).toMatchObject({ type: "prompt.v2.semantic", operation: "enhance", revision: 2 });
    await act(async () => { hostMessage({ type: "prompt.v2.pending", requestId: semantic.requestId }); });
    fireEvent.click(screen.getByRole("button", { name: "Cancel rewrite" }));
    expect(posted.findLast((message) => (message as { type?: string }).type === "prompt.v2.cancel")).toMatchObject({ cancellationId: semantic.cancellationId });

    const optimized = { ...localCandidate, text: "Optimized implementation prompt" };
    const result = { optimizedPrompt: optimized.text, title: "Safe provider retry", summary: "Clarifies retry and failure handling.", improvements: ["Defines errors"], remainingQuestions: [], warnings: [], provider: "gemini", model: "gemini-2.5-flash", finishReason: "STOP", latencyMs: 120 };
    await act(async () => { hostMessage({ type: "prompt.v2.semantic.result", requestId: semantic.requestId, localCandidate, candidate: optimized, result }); });
    expect(screen.getByRole("heading", { name: "Safe provider retry" })).toBeTruthy();
    expect(screen.getByText("Optimized implementation prompt")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Task to optimize" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save to recents" }));
    expect(posted.findLast((message) => (message as { type?: string }).type === "prompt.v2.record.save")).toMatchObject({ requestId: semantic.requestId, documentId: "current-prompt" });

    fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
    expect(screen.getByRole("textbox", { name: "Task to optimize" })).toBeTruthy();
    expect(screen.queryByText("Optimized implementation prompt")).toBeNull();
    expect((screen.getByRole("button", { name: /2 Review/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /2 Review/ }));
    expect(screen.getByText("Optimized implementation prompt")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Task to optimize" }), { target: { value: "Change the retry policy." } });
    expect((screen.getByRole("button", { name: /2 Review/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Optimized implementation prompt")).toBeNull();

    await act(async () => {
      hostMessage({ type: "prompt.v2.view.state", view: "review" });
      hostMessage({ type: "dwi.snapshot.partial", snapshot: { status: "partial", stage: "evaluate", brief, candidate: optimized, optimizerDraft: { task: "Implement a safe provider retry flow.", assignmentId: "general", promptType: "General", outputSize: "low" }, optimizerReview: { source: "provider", provider: "gemini", model: "gemini-2.5-flash", title: "Safe provider retry", summary: "Clarifies retry and failure handling." } } });
    });
    expect(screen.getByText("Optimized implementation prompt")).toBeTruthy();
    expect(screen.getByRole("button", { name: /2 Review/ }).getAttribute("aria-current")).toBe("step");

    await act(async () => {
      hostMessage({ type: "prompt.v2.view.state", view: "input" });
      hostMessage({ type: "dwi.snapshot.partial", snapshot: { status: "partial", stage: "evaluate", brief, candidate: optimized, optimizerDraft: { task: "Implement a safe provider retry flow.", assignmentId: "general", promptType: "General", outputSize: "low" }, optimizerReview: { source: "provider", provider: "gemini", model: "gemini-2.5-flash" } } });
    });
    expect(screen.getByRole("textbox", { name: "Task to optimize" })).toBeTruthy();
    expect(screen.queryByText("Optimized implementation prompt")).toBeNull();

    await act(async () => {
      hostMessage({ type: "prompt.v2.view.state", view: "review" });
      hostMessage({ type: "dwi.snapshot.partial", snapshot: { status: "partial", stage: "evaluate", brief, candidate: optimized, optimizerDraft: { task: "Legacy prompt", assignmentId: "general", promptType: "General", outputSize: "low" } } });
    });
    expect(screen.getByRole("textbox", { name: "Task to optimize" })).toBeTruthy();
    expect((screen.getByRole("button", { name: /2 Review/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText("Optimized implementation prompt")).toBeNull();
  });
});
