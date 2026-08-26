import { canonicalHash, type CanonicalValue } from "./canonical.js";
import type { PromptRefinementId, PromptRefinementV2 } from "./types.js";

export function createPromptRefinementV2<T>(
  id: PromptRefinementId,
): PromptRefinementV2<T> {
  return {
    id,
    state: "not-used",
    revision: 0,
    history: [],
    future: [],
  };
}

export function refinementInputHash(value: CanonicalValue): string {
  return canonicalHash(value);
}

export function draftPromptRefinementV2<T>(
  refinement: PromptRefinementV2<T>,
  draft: T,
): PromptRefinementV2<T> {
  const current = refinement.draft ?? refinement.applied;
  const history =
    current === undefined
      ? refinement.history
      : [...refinement.history, current];
  return {
    ...refinement,
    state: refinement.state === "applied" ? "needs-review" : "draft",
    draft,
    revision: refinement.revision + 1,
    history,
    future: [],
  };
}

export function applyPromptRefinementV2<T>(
  refinement: PromptRefinementV2<T>,
  inputHash: string,
): PromptRefinementV2<T> {
  if (refinement.draft === undefined) {
    throw new Error(`Refinement ${refinement.id} has no draft to apply.`);
  }
  return {
    ...refinement,
    state: "applied",
    applied: refinement.draft,
    appliedInputHash: inputHash,
    revision: refinement.revision + 1,
  };
}

export function invalidatePromptRefinementV2<T>(
  refinement: PromptRefinementV2<T>,
  inputHash: string,
): PromptRefinementV2<T> {
  if (
    refinement.state !== "applied" ||
    refinement.appliedInputHash === inputHash
  ) {
    return refinement;
  }
  return {
    ...refinement,
    state: "needs-review",
    revision: refinement.revision + 1,
  };
}

export function removePromptRefinementV2<T>(
  refinement: PromptRefinementV2<T>,
): PromptRefinementV2<T> {
  const current = refinement.draft ?? refinement.applied;
  return {
    id: refinement.id,
    state: "not-used",
    revision: refinement.revision + 1,
    history:
      current === undefined
        ? refinement.history
        : [...refinement.history, current],
    future: [],
  };
}

export function undoPromptRefinementV2<T>(
  refinement: PromptRefinementV2<T>,
): PromptRefinementV2<T> {
  const prior = refinement.history.at(-1);
  if (prior === undefined) return refinement;
  const current = refinement.draft ?? refinement.applied;
  return {
    ...refinement,
    state: "draft",
    draft: prior,
    revision: refinement.revision + 1,
    history: refinement.history.slice(0, -1),
    future:
      current === undefined
        ? refinement.future
        : [current, ...refinement.future],
  };
}

export function redoPromptRefinementV2<T>(
  refinement: PromptRefinementV2<T>,
): PromptRefinementV2<T> {
  const next = refinement.future[0];
  if (next === undefined) return refinement;
  const current = refinement.draft ?? refinement.applied;
  return {
    ...refinement,
    state: "draft",
    draft: next,
    revision: refinement.revision + 1,
    history:
      current === undefined
        ? refinement.history
        : [...refinement.history, current],
    future: refinement.future.slice(1),
  };
}

export function isPromptRefinementIncludedV2<T>(
  refinement: PromptRefinementV2<T>,
  inputHash: string,
): boolean {
  return (
    refinement.state === "applied" &&
    refinement.applied !== undefined &&
    refinement.appliedInputHash === inputHash
  );
}
