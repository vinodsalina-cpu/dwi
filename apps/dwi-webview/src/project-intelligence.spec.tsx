import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PROJECT_UI_FIXTURES } from "./project-fixtures.js";
import { ProjectIntelligenceView, normalizeProjectSnapshot, type ProjectSnapshotStatus } from "./project-intelligence.js";

afterEach(cleanup);

const statusLabels: Record<ProjectSnapshotStatus, string> = {
  scanning: "Scanning",
  current: "Current",
  stale: "Stale",
  partial: "Partial",
  conflict: "Conflict",
  unsupported: "Unsupported",
  error: "Error",
};

describe("Project intelligence view", () => {
  it.each(Object.entries(statusLabels) as [ProjectSnapshotStatus, string][])("renders the %s fixture with an explicit state", (state, label) => {
    render(<ProjectIntelligenceView snapshot={PROJECT_UI_FIXTURES[state]} onRefresh={vi.fn()} onReview={vi.fn()} onUseContext={vi.fn()} />);
    expect(screen.getByText(label, { selector: ".project-status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: state === "scanning" ? "Scanning…" : "Refresh" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Copy AI context to clipboard" }) as HTMLButtonElement).disabled).toBe(["scanning", "stale", "partial", "conflict", "unsupported", "error"].includes(state));
    if (state === "error") expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("keeps claim evidence collapsed until requested", () => {
    render(<ProjectIntelligenceView snapshot={PROJECT_UI_FIXTURES.current} onRefresh={vi.fn()} onReview={vi.fn()} onUseContext={vi.fn()} />);
    const section = screen.getByText("Identity", { selector: ".section-label strong" }).closest("details") as HTMLDetailsElement;
    expect(section.open).toBe(false);
    fireEvent.click(screen.getByText("Identity", { selector: ".section-label strong" }));
    expect(section.open).toBe(true);
    expect(screen.getByText("group:commerce-payments")).toBeTruthy();
    const evidence = screen.getAllByText("1 evidence item")[0]!.closest("details") as HTMLDetailsElement;
    expect(evidence.open).toBe(false);
    fireEvent.click(screen.getAllByText("1 evidence item")[0]!);
    expect(evidence.open).toBe(true);
    expect(screen.getAllByText(".dwi/project.yaml").length).toBeGreaterThan(0);
  });

  it("normalizes a canonical snapshot without inventing aggregate confidence", () => {
    const snapshot = normalizeProjectSnapshot({
      apiVersion: "dwi.dev/v1",
      kind: "Project",
      metadata: { name: "orders-api", revision: { commit: "abcdef123456", generatedAt: "2026-08-26T12:00:00Z" } },
      spec: { identity: { description: "Processes orders", componentType: "service", lifecycle: "production", owners: ["group:orders"] }, workflows: [{ id: "test", argv: ["go", "test", "./..."] }] },
      observed: { languages: [{ id: "go", versionConstraint: ">=1.27" }], ecosystems: ["go-modules"], frameworks: [], toolchains: [], components: [], entrypoints: [], documentation: [] },
      claims: [{ id: "go-language", path: "/observed/languages/0", value: { id: "go", versionConstraint: ">=1.27" }, state: "accepted", confidence: "high", authority: "deterministic", evidenceRefs: ["ev-go"] }],
      evidence: [{ id: "ev-go", kind: "manifest", relativePath: "go.mod", content: "module example.com/orders", parser: "go-pack@1.0.0" }],
      proposals: [],
      resolution: { coverage: { identity: "complete", toolchain: "complete", verification: "partial", architecture: "incomplete", documentation: "unsupported" }, conflicts: [], unknowns: ["Deployment target"] },
    });

    expect(snapshot.status).toBe("partial");
    expect(snapshot.projectName).toBe("orders-api");
    expect(snapshot.owner).toBe("group:orders");
    expect(snapshot.coverage.percent).toBe(50);
    expect(snapshot.sections.find((section) => section.id === "toolchain")?.claims[0]?.evidence[0]?.source).toBe("go.mod");
    expect(snapshot.sections.find((section) => section.id === "commands")?.claims[0]?.value).toBe("go test ./...");
    expect(JSON.stringify(snapshot)).not.toContain("HIGH CONFIDENCE");
    expect(JSON.stringify(snapshot)).not.toContain("module example.com/orders");
  });

  it("renders resolved declaration values instead of stale detector seeds", () => {
    const snapshot = normalizeProjectSnapshot({
      apiVersion: "dwi.dev/v1",
      kind: "Project",
      metadata: { name: "payments", revision: { generatedAt: "2026-08-26T12:00:00Z" } },
      spec: { identity: { owners: [], tags: [] }, workflows: [], boundaries: {} },
      observed: {},
      claims: [],
      evidence: [],
      proposals: [],
      resolution: {
        coverage: { identity: "complete", toolchain: "partial", verification: "partial", architecture: "complete", documentation: "complete" },
        conflicts: [],
        unknowns: [],
        effectiveSnapshot: {
          spec: { identity: { description: "Declared purpose", componentType: "service", lifecycle: "production", owners: ["group:payments"], tags: [] }, workflows: [], boundaries: {} },
          observed: { languages: [{ id: "go", name: "Go" }] },
        },
      },
    });
    expect(snapshot.owner).toBe("group:payments");
    expect(snapshot.componentType).toBe("service");
    expect(snapshot.lifecycle).toBe("production");
    expect(snapshot.description).toBe("Declared purpose");
    expect(snapshot.sections.find(({ id }) => id === "toolchain")?.claims.some(({ value }) => value === "Go")).toBe(true);
  });

  it("renders longest-plausible content without dropping primary actions", () => {
    render(<ProjectIntelligenceView snapshot={PROJECT_UI_FIXTURES["long-content"]} onRefresh={vi.fn()} onReview={vi.fn()} onUseContext={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Review snapshot/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy AI context to clipboard" })).toBeTruthy();
    expect(screen.getByText(/OS clipboard/)).toBeTruthy();
  });

  it("blocks AI context until a canonical snapshot has human review", () => {
    render(<ProjectIntelligenceView snapshot={{ ...PROJECT_UI_FIXTURES.current, reviewed: false }} onRefresh={vi.fn()} onReview={vi.fn()} onUseContext={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Copy AI context to clipboard" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
