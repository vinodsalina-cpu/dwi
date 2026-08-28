import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PromptTemplate } from "@platform/domain-prompt-optimizer/types";
import {
  LibraryWorkspace,
  type LibraryFeedbackRequest,
  type LibraryItemSummary,
  type LibraryState,
  type LibraryTemplateDetail,
} from "./library.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const managedItem: LibraryItemSummary = {
  id: "managed-delivery",
  name: "Managed delivery",
  kind: "template",
  source: "managed",
  reviewedAt: "2026-08-27T14:00:00.000Z",
  promptType: "General",
};

const personalItem: LibraryItemSummary = {
  id: "personal-release",
  name: "Personal release",
  kind: "template",
  source: "personal",
  reviewedAt: "2026-08-27T13:00:00.000Z",
  promptType: "Migration",
};

function template(item: LibraryItemSummary): PromptTemplate {
  return {
    id: item.id,
    builtIn: item.source === "managed",
    name: item.name,
    description: `${item.name} overview`,
    promptType: item.promptType === "Migration" ? "Migration" : "General",
    prompt: `Use ${item.name} as the base instruction.`,
    fields: {
      title: item.name,
      desiredOutcome: "Deliver an observable result.",
      inScope: "The requested change.",
      outOfScope: "Unrelated refactors.",
      verification: "Run focused tests.",
      outputFormat: "Return a concise report.",
      hardConstraints: "Preserve project boundaries.",
      acceptanceCriteria: "The requested behavior works.",
    },
    recommendedGuidancePackIds: ["outcome", "verification"],
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-27T12:00:00.000Z",
  };
}

function detail(item: LibraryItemSummary, revision = 6): LibraryTemplateDetail {
  return {
    item,
    template: template(item),
    revision,
    versions: Array.from({ length: revision }, (_, index) => ({
      revision: index + 1,
      updatedAt: `2026-08-${String(20 + index).padStart(2, "0")}T12:00:00.000Z`,
      label: index + 1 === revision ? "Current" : undefined,
    })),
  };
}

function itemSet(source: "managed" | "personal", count = 6): LibraryItemSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${source}-${index}`,
    name: `${source === "managed" ? "Managed" : "Personal"} template ${index + 1}`,
    kind: "template" as const,
    source,
    reviewedAt: `2026-08-${String(10 + index).padStart(2, "0")}T12:00:00.000Z`,
    promptType: "General",
  }));
}

function readyState(): LibraryState {
  return {
    status: "ready",
    kinds: [
      { kind: "template", label: "Templates", available: true },
      { kind: "skill", label: "Skills", available: false },
      { kind: "rule", label: "Rules", available: false },
    ],
    recents: [personalItem, { id: "rule-1", name: "Repository policy", kind: "rule", source: "managed", reviewedAt: "2026-08-26T12:00:00.000Z" }, managedItem],
    managedTemplates: [managedItem, ...itemSet("managed")],
    personalTemplates: [personalItem, ...itemSet("personal")],
  };
}

describe("Library workspace", () => {
  it("keeps the compact home kind-generic and exposes two independently scrollable review panes", async () => {
    render(<LibraryWorkspace state={readyState()} />);

    expect(screen.getByRole("heading", { name: "Library" })).toBeTruthy();
    const recents = screen.getByRole("list", { name: "Recently reviewed library items" });
    expect(within(recents).getByText("Repository policy")).toBeTruthy();
    expect(within(recents).getByText("Rule")).toBeTruthy();

    const create = screen.getByRole("button", { name: "Create library item" });
    expect(create.getAttribute("aria-haspopup")).toBe("menu");
    create.focus();
    fireEvent.keyDown(create, { key: "ArrowDown" });
    expect(screen.getByRole("menu", { name: "Create library item" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Template" }));
    const reviewTab = screen.getByRole("tab", { name: "Review" });
    act(() => reviewTab.focus());
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Create library item" })).toBeNull());

    fireEvent.click(create);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Create library item" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(create));

    fireEvent.click(reviewTab);
    expect(screen.getByRole("button", { name: "Templates" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("button", { name: "Skills" }) as HTMLButtonElement).disabled).toBe(true);

    const managedHeading = screen.getByRole("heading", { name: "Managed templates" });
    const personalHeading = screen.getByRole("heading", { name: "Personal templates" });
    const managedPane = managedHeading.closest("article");
    const personalPane = personalHeading.closest("article");
    expect(managedPane).toBeTruthy();
    expect(personalPane).toBeTruthy();
    expect(within(managedPane!).getByRole("list", { name: "Managed templates" })).toBeTruthy();
    expect(within(personalPane!).getByRole("list", { name: "Personal templates" })).toBeTruthy();
    expect(managedPane!.querySelector(".library-pane-scroll")).toBeTruthy();
    expect(personalPane!.querySelector(".library-pane-scroll")).toBeTruthy();
  });

  it("opens a full reader and submits five-star managed feedback through the host-shaped contract", async () => {
    const onRequestDetail = vi.fn(() => detail(managedItem));
    const onFeedback = vi.fn();
    render(<LibraryWorkspace state={readyState()} detail={detail(managedItem)} onRequestDetail={onRequestDetail} onFeedback={onFeedback} />);

    fireEvent.click(screen.getByRole("button", { name: /Managed delivery/ }));
    expect(screen.getByRole("region", { name: "Managed delivery reader" })).toBeTruthy();
    expect(screen.getByText("Use Managed delivery as the base instruction.")).toBeTruthy();
    expect(onRequestDetail).toHaveBeenCalledWith({ templateId: managedItem.id });

    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    const rating = screen.getByRole("radiogroup", { name: "Rating" });
    const firstStar = within(rating).getByRole("radio", { name: "1 star" });
    fireEvent.keyDown(firstStar, { key: "End" });
    const fifthStar = within(rating).getByRole("radio", { name: "5 stars" });
    expect(fifthStar.getAttribute("aria-checked")).toBe("true");
    expect(within(rating).getAllByRole("radio").filter((item) => item.getAttribute("aria-checked") === "true")).toHaveLength(1);
    fireEvent.keyDown(fifthStar, { key: "ArrowLeft" });
    expect(within(rating).getByRole("radio", { name: "4 stars" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(within(rating).getByRole("radio", { name: "4 stars" }), { key: "ArrowRight" });
    expect(fifthStar.getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: "Feedback" }), { target: { value: "Strong starting point." } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(onFeedback).toHaveBeenCalledTimes(1));
    expect(onFeedback.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: 6,
      templateId: managedItem.id,
      rating: "helpful",
      stars: 5,
      note: "Strong starting point.",
    });
  });

  it("shows only five newest version rows and confirms personal-template deletion", async () => {
    const onDelete = vi.fn();
    render(<LibraryWorkspace
      state={readyState()}
      detail={detail(personalItem)}
      initialRoute={{ view: "reader", item: personalItem, from: { tab: "review", kind: "template" } }}
      onDelete={onDelete}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("region", { name: "Edit Personal release" })).toBeTruthy();
    expect(screen.getAllByText(/^Version \d+$/)).toHaveLength(5);
    expect(screen.getByText("Version 6")).toBeTruthy();
    expect(screen.queryByText("Version 1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const saveConfirmation = screen.getByRole("dialog", { name: "Confirm save" });
    expect(within(saveConfirmation).getByText("This updates the current template and records version metadata.")).toBeTruthy();
    fireEvent.click(within(saveConfirmation).getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Back to template" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete template" }));
    expect(screen.getByRole("dialog", { name: "Delete template" })).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog", { name: "Delete template" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onDelete.mock.calls[0]?.[0]).toMatchObject({ expectedRevision: 6, templateId: personalItem.id });
  });

  it("keeps Save disabled until required canonical fields are complete and confirms before saving", async () => {
    const onSave = vi.fn();
    render(<LibraryWorkspace state={readyState()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Create library item" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Template" }));
    expect(screen.getByRole("region", { name: "Create template" })).toBeTruthy();

    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: /^Name/ }), { target: { value: "Release readiness" } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Base instruction/ }), { target: { value: "Prepare a release-ready change." } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Desired outcome/ }), { target: { value: "A safe release." } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Acceptance criteria/ }), { target: { value: "All release checks pass." } });
    fireEvent.change(screen.getByRole("textbox", { name: /^Verification/ }), { target: { value: "Run the release test suite." } });
    expect(save.disabled).toBe(false);

    const templateTitle = screen.getByRole("textbox", { name: "Template title" });
    fireEvent.change(templateTitle, { target: { value: "x".repeat(32_768) } });
    expect(save.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("32,768-character limit");
    fireEvent.change(templateTitle, { target: { value: "" } });
    expect(save.disabled).toBe(false);

    fireEvent.click(save);
    const confirmation = screen.getByRole("dialog", { name: "Confirm save" });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Confirm save" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      template: {
        name: "Release readiness",
        prompt: "Prepare a release-ready change.",
        fields: {
          desiredOutcome: "A safe release.",
          acceptanceCriteria: "All release checks pass.",
          verification: "Run the release test suite.",
        },
      },
    });
  });

  it("confirms before leaving a dirty editor and preserves the draft when cancelled", async () => {
    render(<LibraryWorkspace
      state={readyState()}
      initialRoute={{ view: "editor", mode: "create", from: { tab: "recents", kind: "template" } }}
    />);

    const name = screen.getByRole("textbox", { name: /^Name/ }) as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Unsaved template" } });
    const back = screen.getByRole("button", { name: "Back to Library" });
    fireEvent.click(back);
    const discard = screen.getByRole("dialog", { name: "Discard template changes" });
    fireEvent.click(within(discard).getByRole("button", { name: "Keep editing" }));
    expect(screen.getByRole("region", { name: "Create template" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /^Name/ }) as HTMLInputElement).value).toBe("Unsaved template");

    fireEvent.click(back);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Discard template changes" })).getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("heading", { name: "Library" })).toBeTruthy();
  });

  it("confirms before cloned content replaces unsaved editor changes", async () => {
    const source = template(managedItem);
    const onClonePaste = vi.fn((request: { operationId: string }) => ({
      operationId: request.operationId,
      status: "ready" as const,
      template: {
        name: "Cloned template",
        description: source.description,
        promptType: source.promptType,
        prompt: source.prompt,
        fields: { ...source.fields },
        recommendedGuidancePackIds: [...source.recommendedGuidancePackIds],
      },
    }));
    render(<LibraryWorkspace
      state={readyState()}
      initialRoute={{ view: "editor", mode: "create", from: { tab: "recents", kind: "template" } }}
      onClonePaste={onClonePaste}
    />);

    fireEvent.change(screen.getByRole("textbox", { name: /^Name/ }), { target: { value: "Unsaved template" } });
    fireEvent.click(screen.getByRole("button", { name: "Clone" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Paste AI response" }));
    fireEvent.change(screen.getByRole("textbox", { name: "AI response" }), { target: { value: "structured response" } });
    fireEvent.click(screen.getByRole("button", { name: "Use response" }));

    const replacement = await screen.findByRole("dialog", { name: "Replace template draft" });
    fireEvent.click(within(replacement).getByRole("button", { name: "Keep current" }));
    expect((screen.getByRole("textbox", { name: /^Name/ }) as HTMLInputElement).value).toBe("Unsaved template");
    expect((screen.getByRole("textbox", { name: "AI response" }) as HTMLTextAreaElement).value).toBe("structured response");
  });

  it("returns to the unchanged paste state after invalid clone input", async () => {
    const onClonePaste = vi.fn((request: { operationId: string }) => ({
      operationId: request.operationId,
      status: "invalid" as const,
      message: "No supported template fields were found.",
    }));
    render(<LibraryWorkspace
      state={readyState()}
      initialRoute={{ view: "editor", mode: "create", from: { tab: "recents", kind: "template" } }}
      onClonePaste={onClonePaste}
    />);

    const clone = screen.getByRole("button", { name: "Clone" });
    expect(clone.getAttribute("aria-haspopup")).toBe("menu");
    fireEvent.keyDown(clone, { key: "ArrowUp" });
    const appendFile = screen.getByRole("menuitem", { name: "Append file" });
    const pasteResponse = screen.getByRole("menuitem", { name: "Paste AI response" });
    expect(document.activeElement).toBe(pasteResponse);
    fireEvent.keyDown(pasteResponse, { key: "Home" });
    expect(document.activeElement).toBe(appendFile);
    fireEvent.keyDown(appendFile, { key: "End" });
    expect(document.activeElement).toBe(pasteResponse);
    fireEvent.keyDown(pasteResponse, { key: "ArrowDown" });
    expect(document.activeElement).toBe(appendFile);
    fireEvent.keyDown(appendFile, { key: "ArrowUp" });
    expect(document.activeElement).toBe(pasteResponse);
    fireEvent.click(pasteResponse);
    const paste = screen.getByRole("textbox", { name: "AI response" }) as HTMLTextAreaElement;
    fireEvent.change(paste, { target: { value: "unstructured answer" } });
    fireEvent.click(screen.getByRole("button", { name: "Use response" }));

    const invalid = await screen.findByRole("dialog", { name: "Invalid clone input" });
    expect(within(invalid).getByText("No supported template fields were found.")).toBeTruthy();
    fireEvent.click(within(invalid).getByRole("button", { name: "Back" }));
    const restored = screen.getByRole("textbox", { name: "AI response" }) as HTMLTextAreaElement;
    expect(restored.value).toBe("unstructured answer");
  });

  it("gates reader actions until detail arrives and focuses each full-surface route", async () => {
    const start = { view: "reader", item: personalItem, from: { tab: "review", kind: "template" } } as const;
    const view = render(<LibraryWorkspace state={readyState()} initialRoute={start} />);

    expect(screen.getByText("Loading template…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Back to Library" }));

    view.rerender(<LibraryWorkspace state={readyState()} initialRoute={start} detail={detail(personalItem)} />);
    const edit = screen.getByRole("button", { name: "Edit" });
    fireEvent.click(edit);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: /^Name/ })));

    fireEvent.change(screen.getByRole("textbox", { name: /^Name/ }), { target: { value: "My stale draft" } });
    view.rerender(<LibraryWorkspace state={readyState()} initialRoute={start} detail={detail(personalItem, 7)} />);
    expect(screen.getByRole("alert").textContent).toContain("A newer version is available");
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Review latest" }));
    expect(screen.getByRole("region", { name: "Personal release reader" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Back to Library" }));
  });

  it("keeps exact-star feedback and its note available when delivery is not acknowledged", async () => {
    const onFeedback = vi.fn((_request: LibraryFeedbackRequest) =>
      Promise.reject(new Error("Delivery was not acknowledged.")),
    );
    render(<LibraryWorkspace
      state={readyState()}
      detail={detail(managedItem)}
      initialRoute={{ view: "reader", item: managedItem, from: { tab: "review", kind: "template" } }}
      onFeedback={onFeedback}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
    fireEvent.click(screen.getByRole("radio", { name: "4 stars" }));
    const note = screen.getByRole("textbox", { name: "Feedback" }) as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "Keep this note for retry." } });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Delivery was not acknowledged"));
    expect((screen.getByRole("textbox", { name: "Feedback" }) as HTMLTextAreaElement).value).toBe("Keep this note for retry.");
    expect(screen.getByRole("radio", { name: "4 stars" }).getAttribute("aria-checked")).toBe("true");
    expect(onFeedback.mock.calls[0]?.[0]).toMatchObject({ rating: "helpful", stars: 4 });

    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
    await waitFor(() => expect(onFeedback).toHaveBeenCalledTimes(2));
    expect(onFeedback.mock.calls[1]?.[0].operationId).toBe(
      onFeedback.mock.calls[0]?.[0].operationId,
    );
  });
});
