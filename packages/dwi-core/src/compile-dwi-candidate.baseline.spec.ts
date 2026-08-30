import { describe, expect, it } from "vitest";
import { BUILT_IN_PROMPT_TEMPLATES } from "@platform/domain-prompt-optimizer";
import {
  DWI_MODULES,
  compileDwiCandidate,
  type DwiBrief,
  type DwiCandidate,
} from "./index.js";

const brief: DwiBrief = {
  version: "dwi.brief.v1",
  projectName: "Demo",
  archetype: "web application",
  stack: ["TypeScript", "React"],
  packageManager: "pnpm",
  scripts: ["test", "build"],
  modules: ["apps/web"],
  facts: [],
  unknowns: ["deployment target"],
  confirmed: true,
  corrections: "none",
};

const noInputBaseline: DwiCandidate = {
  text: `## Task
Implement the requested feature in this project.

## Desired outcome
Deliver a reviewable feature that fits the confirmed project profile.

## Scope
In scope: Use these selected work modules: Project orientation.
Out of scope: Autonomous execution, hidden scanning, provider calls, and unrelated refactors.

## Relevant context
[Confirmed DWI project brief]
Project: Demo
Archetype: web application
Stack: TypeScript, React
Package manager: pnpm
Scripts: test, build
Modules: apps/web
Corrections: none
Unknowns: deployment target

## Constraints
Inspect before changing code. Preserve existing behavior and security boundaries. Do not expose secrets or private paths.

## Acceptance criteria
The requested behavior is implemented, focused tests pass, affected checks are reported, and remaining risks are explicit.

## Output contract
Return only a concise outcome, changed files, verification, and remaining risks. Keep supporting prose compact.

## Verification
Run the narrow owning tests first, then typecheck/lint and the affected dependency graph.`,
  selectedModuleIds: ["orientation"],
  estimate: {
    baselineTokens: 338,
    optimizedTokens: 266,
    estimatedAvoidedDuplication: 72,
    method: "Deterministic UTF-8 bytes ÷ 4 estimate; not provider billing.",
  },
};

const generalLowBaseline: DwiCandidate = {
  text: `## Task
Implement a safe provider retry flow.

## Desired outcome
Deliver a reviewable feature that fits the confirmed project profile.

## Scope
In scope: Use these selected work modules: Project orientation, Feature delivery, Reuse before create, Architecture boundaries, Verification plan.
Out of scope: Autonomous execution, hidden scanning, provider calls, and unrelated refactors.

## Relevant context
[Confirmed DWI project brief]
Project: Demo
Archetype: web application
Stack: TypeScript, React
Package manager: pnpm
Scripts: test, build
Modules: apps/web
Corrections: none
Unknowns: deployment target

## Constraints
Inspect before changing code. Preserve existing behavior and security boundaries. Do not expose secrets or private paths.

## Acceptance criteria
The requested behavior is implemented, focused tests pass, affected checks are reported, and remaining risks are explicit.

## Output contract
Return only a concise outcome, changed files, verification, and remaining risks. Keep supporting prose compact.

## Verification
Run the narrow owning tests first, then typecheck/lint and the affected dependency graph.`,
  selectedModuleIds: [
    "orientation",
    "feature-delivery",
    "reuse-first",
    "architecture-boundaries",
    "verification",
  ],
  estimate: {
    baselineTokens: 944,
    optimizedTokens: 284,
    estimatedAvoidedDuplication: 660,
    method: "Deterministic UTF-8 bytes ÷ 4 estimate; not provider billing.",
  },
};

const bugFixHighBaseline: DwiCandidate = {
  text: `## Task
Create a bug-fix prompt with reproduction, expected behavior, likely boundaries, regression checks, and non-goals.

User request:
Repair checkout retries.

## Desired outcome
Restore the expected behavior and prevent the reported failure from recurring.

## Scope
In scope: Limit changes to the reproduced failure path and the smallest justified supporting code.
Use these selected work modules: Project orientation, Verification plan.
Out of scope: Avoid unrelated cleanup, redesign, or behavior changes outside the failing path.
Autonomous execution, hidden scanning, provider calls, and unrelated refactors.

## Relevant context
[Confirmed DWI project brief]
Project: Demo
Archetype: web application
Stack: TypeScript, React
Package manager: pnpm
Scripts: test, build
Modules: apps/web
Corrections: none
Unknowns: deployment target

## Constraints
Preserve unaffected behavior and do not claim a root cause without code evidence.
Inspect before changing code. Preserve existing behavior and security boundaries. Do not expose secrets or private paths.

## Rules and skills
- State the observable outcome before implementation details.
- Preserve explicit in-scope and out-of-scope boundaries; ask rather than widening scope.
- Require concrete verification and a report of any check that was not run.
- Express completion as observable acceptance criteria.

## Acceptance criteria
The reproduction no longer fails and regression coverage protects the expected behavior.

## Output contract
Return root cause, fix summary, regression coverage, checks run, and residual risk.
Return a detailed implementation report with decisions and tradeoffs, changed files and rationale, verification evidence, remaining risks, and actionable follow-ups.

## Verification
Reproduce the failure, add or update a regression check, and run nearby existing tests.
Run the narrow owning tests first, then typecheck/lint and the affected dependency graph.`,
  selectedModuleIds: ["orientation", "verification"],
  estimate: {
    baselineTokens: 465,
    optimizedTokens: 487,
    estimatedAvoidedDuplication: 0,
    method: "Deterministic UTF-8 bytes ÷ 4 estimate; not provider billing.",
  },
};

describe("compileDwiCandidate whole-wrapper baseline v1", () => {
  it("freezes the host no-input fallback and wrapper defaults", () => {
    expect(compileDwiCandidate(brief, ["orientation"])).toEqual(noInputBaseline);
  });

  it("freezes the live general low-output wrapper result", () => {
    const result = compileDwiCandidate(
      brief,
      DWI_MODULES.filter(({ defaultSelected }) => defaultSelected).map(({ id }) => id),
      {
        task: "Implement a safe provider retry flow.",
        promptType: "General",
        outputSize: "low",
      },
    );

    expect(result).toEqual(generalLowBaseline);
  });

  it("freezes template composition, selected modules, sizing, and estimates", () => {
    const template = BUILT_IN_PROMPT_TEMPLATES.find(({ id }) => id === "bug-fix");
    expect(template).toBeDefined();

    const result = compileDwiCandidate(
      brief,
      ["verification", "orientation"],
      {
        task: "  Repair checkout retries.  ",
        template,
        outputSize: "high",
      },
    );

    expect(result).toEqual(bugFixHighBaseline);
  });
});
