import type { PromptOptimizerView } from "./prompt-optimizer-protocol.js";

export type PersistedPromptOptimizerView = PromptOptimizerView;

/**
 * The current step is a resumable checkpoint. Candidate availability is
 * validated separately so stale context can discard output without losing the
 * developer's exact workflow position.
 */
export function restorePromptOptimizerView(
  stored: unknown,
  candidatePresent: boolean,
): PersistedPromptOptimizerView {
  void candidatePresent;
  return stored === "resolve" || stored === "review" ? stored : "input";
}

export function persistedPromptOptimizerView(
  view: PromptOptimizerView,
  candidatePresent: boolean,
): PersistedPromptOptimizerView {
  void candidatePresent;
  return view;
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
