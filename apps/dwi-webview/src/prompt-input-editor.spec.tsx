import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import {
  PromptInputEditor,
  type PromptAssignmentOption,
  type PromptOutputSize,
} from "./prompt-input-editor.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function assignments(count: number): PromptAssignmentOption[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `assignment-${index + 1}`,
    name: index === 10 ? "Eleventh migration" : `Assignment ${index + 1}`,
    promptType: index === 10 ? "Migration" : index % 2 ? "Architecture" : "General",
    source: index === 10 ? "developer" : "managed",
  }));
}

function Harness({ options, initialAssignmentId }: {
  options: readonly PromptAssignmentOption[];
  initialAssignmentId?: string;
}) {
  const [text, setText] = useState("");
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId ?? options[0]?.id);
  const [outputSize, setOutputSize] = useState<PromptOutputSize>("low");
  return <PromptInputEditor
    text={text}
    onTextChange={setText}
    assignments={options}
    assignmentId={assignmentId}
    onAssignmentChange={(assignment) => setAssignmentId(assignment.id)}
    outputSize={outputSize}
    onOutputSizeChange={setOutputSize}
  />;
}

describe("PromptInputEditor", () => {
  it("renders the compact controlled editor with Low output by default", () => {
    render(<Harness options={assignments(2)} />);

    const editor = screen.getByRole("textbox", { name: "Prompt" });
    expect(editor.getAttribute("placeholder")).toBe("Describe the work to optimize…");
    expect(editor.classList.contains("prompt-input-editor__textarea")).toBe(true);
    expect(screen.getByRole("button", { name: "Assignment: Assignment 1" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("button", { name: "Criticality: Low" }).getAttribute("aria-expanded")).toBe("false");

    fireEvent.change(editor, { target: { value: "Improve this prompt" } });
    expect((editor as HTMLTextAreaElement).value).toBe("Improve this prompt");
  });

  it("does not show search for exactly ten assignments", () => {
    render(<Harness options={assignments(10)} />);
    fireEvent.click(screen.getByRole("button", { name: "Assignment: Assignment 1" }));

    expect(screen.queryByRole("searchbox", { name: "Search assignments" })).toBeNull();
    expect(within(screen.getByRole("listbox", { name: "Assignments" })).getAllByRole("option")).toHaveLength(10);
  });

  it("shows search above ten assignments and filters name, type, and source", () => {
    render(<Harness options={assignments(11)} />);
    fireEvent.click(screen.getByRole("button", { name: "Assignment: Assignment 1" }));

    const search = screen.getByRole("searchbox", { name: "Search assignments" });
    expect(document.activeElement).toBe(search);
    fireEvent.change(search, { target: { value: "Eleventh" } });
    expect(within(screen.getByRole("listbox", { name: "Assignments" })).getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("option", { name: /Eleventh migration/ })).toBeTruthy();

    fireEvent.change(search, { target: { value: "developer" } });
    expect(within(screen.getByRole("listbox", { name: "Assignments" })).getAllByRole("option")).toHaveLength(1);
    fireEvent.change(search, { target: { value: "not present" } });
    expect(screen.getByRole("status").textContent).toBe("No matching assignments");
  });

  it("supports list navigation, selection, outside dismissal, and Escape focus return", async () => {
    const options = assignments(3);
    render(<Harness options={options} />);
    const trigger = screen.getByRole("button", { name: "Assignment: Assignment 1" });

    fireEvent.click(trigger);
    const list = screen.getByRole("listbox", { name: "Assignments" });
    expect(document.activeElement).toBe(list);
    fireEvent.keyDown(list, { key: "End" });
    fireEvent.keyDown(list, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Assignment: Assignment 3" })).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Assignment: Assignment 3" }));

    const selectedTrigger = screen.getByRole("button", { name: "Assignment: Assignment 3" });
    fireEvent.click(selectedTrigger);
    fireEvent.keyDown(screen.getByRole("listbox", { name: "Assignments" }), { key: "Home" });
    fireEvent.keyDown(screen.getByRole("listbox", { name: "Assignments" }), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("listbox", { name: "Assignments" }), { key: "ArrowUp" });
    fireEvent.keyDown(screen.getByRole("listbox", { name: "Assignments" }), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Choose assignment" })).toBeNull());
    expect(document.activeElement).toBe(selectedTrigger);

    fireEvent.click(selectedTrigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Choose assignment" })).toBeNull();
  });

  it("changes the controlled output choice with keyboard navigation", async () => {
    render(<Harness options={assignments(2)} />);
    const lowTrigger = screen.getByRole("button", { name: "Criticality: Low" });
    fireEvent.click(lowTrigger);

    const list = screen.getByRole("listbox", { name: "Criticality levels" });
    expect(document.activeElement).toBe(list);
    fireEvent.keyDown(list, { key: "End" });
    fireEvent.keyDown(list, { key: "Enter" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Criticality: High" })).toBeTruthy());
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Criticality: High" }));
  });
});
