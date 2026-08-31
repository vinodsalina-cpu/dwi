import type { PromptOptimizerView } from "./prompt-optimizer-protocol.js";

export type PersistedPromptOptimizerView = Exclude<PromptOptimizerView, "resolve">;

/**
 * Resolve is an in-memory transition, never a resumable checkpoint. Existing
 * input/review values therefore remain readable without adding persistence.
 */
export function restorePromptOptimizerView(
  stored: unknown,
  candidatePresent: boolean,
): PersistedPromptOptimizerView {
  return stored === "review" && candidatePresent ? "review" : "input";
}

export function persistedPromptOptimizerView(
  view: PromptOptimizerView,
  candidatePresent: boolean,
): PersistedPromptOptimizerView {
  return view === "review" && candidatePresent ? "review" : "input";
}

export interface PromptOptimizerRequestIdentity {
  readonly documentId: string;
  readonly requestId: string;
  readonly revision: number;
  readonly baseHash: string;
}

export class PromptOptimizerRequestBoundary {
  private readonly current = new Map<string, Omit<PromptOptimizerRequestIdentity, "documentId">>();

  start(identity: Omit<PromptOptimizerRequestIdentity, "revision">): PromptOptimizerRequestIdentity {
    const revision = (this.current.get(identity.documentId)?.revision ?? 0) + 1;
    const authoritative = { ...identity, revision };
    this.current.set(identity.documentId, {
      requestId: authoritative.requestId,
      revision: authoritative.revision,
      baseHash: authoritative.baseHash,
    });
    return authoritative;
  }

  invalidate(): void {
    this.current.clear();
  }

  currentFor(identity: Pick<PromptOptimizerRequestIdentity, "documentId" | "requestId">): PromptOptimizerRequestIdentity | undefined {
    const current = this.current.get(identity.documentId);
    return current?.requestId === identity.requestId ? { documentId: identity.documentId, ...current } : undefined;
  }

  isCurrent(identity: Pick<PromptOptimizerRequestIdentity, "documentId" | "requestId">): boolean {
    return this.currentFor(identity) !== undefined;
  }
}
