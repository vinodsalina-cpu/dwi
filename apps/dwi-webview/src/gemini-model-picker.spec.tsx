import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { GeminiModelPicker } from "./gemini-model-picker.js";

describe("GeminiModelPicker", () => {
  it("shows five curated models before search and offers a custom model", () => {
    const onChange = vi.fn();
    render(<GeminiModelPicker value="gemini-3.7-flash" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Gemini 3.7 Flash/ }));
    const list = screen.getByRole("listbox", { name: "Gemini text models" });
    expect(within(list).getAllByRole("option")).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Other model…" })).toBeTruthy();
  });

  it("filters the full catalog and accepts a custom latest model ID", () => {
    const onChange = vi.fn();
    render(<GeminiModelPicker value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose a Gemini model" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search Gemini models" }), { target: { value: "Gemma" } });
    expect(screen.getByRole("option", { name: /Gemma 4 31B IT/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Other model…" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Custom Gemini model ID" }), { target: { value: "gemini-flash-latest" } });
    fireEvent.click(screen.getByRole("button", { name: "Use model" }));
    expect(onChange).toHaveBeenCalledWith("gemini-flash-latest");
  });
});
