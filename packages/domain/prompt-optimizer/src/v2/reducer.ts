import type {
  PromptCandidateV2,
  PromptDocumentV2,
  PromptRefinementId,
  PromptRefinementState,
} from "./types.js";

export type PromptComposerRouteV2 = "recents" | "create" | "saved";
export type PromptComposerStageV2 = "write" | "refine" | "review";
export type PromptReviewModeV2 = "structure" | "plain" | "diff" | "outbound";
export type PromptFocusSurfaceV2 =
  | "baseline"
  | "type"
  | "context"
  | "questions"
  | "rules"
  | "skills"
  | "output"
  | "tokens"
  | "assertions"
  | "review";
export type PromptTransientLayerV2 =
  "none" | "menu" | "dialog" | "help" | "confirmation";

export interface PromptAsyncOperationV2 {
  readonly kind: "analyze" | "enhance" | "validate" | "persist" | "context";
  readonly requestId: string;
  readonly cancellationId: string;
  readonly baseRevision: number;
  readonly baseHash: string;
  readonly status: "pending" | "cancelling";
}

export interface PromptPersistenceConflictV2 {
  readonly recordId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;
  readonly recovery: "reload" | "save-copy" | "cancel";
}

export interface PromptComposerStateV2 {
  readonly route: PromptComposerRouteV2;
  readonly stage: PromptComposerStageV2;
  readonly focus: PromptFocusSurfaceV2;
  readonly transient: PromptTransientLayerV2;
  readonly reviewMode: PromptReviewModeV2;
  readonly document: PromptDocumentV2;
  readonly candidates: readonly PromptCandidateV2[];
  readonly selectedCandidateId?: string;
  readonly activeOperation?: PromptAsyncOperationV2;
  readonly persistenceConflict?: PromptPersistenceConflictV2;
  readonly typeFitDecision: "none" | "keep" | "switch-required";
  readonly statusMessage?: string;
}

export type PromptComposerEventV2 =
  | { type: "route.selected"; route: PromptComposerRouteV2 }
  | { type: "stage.selected"; stage: PromptComposerStageV2 }
  | { type: "focus.selected"; focus: PromptFocusSurfaceV2 }
  | { type: "transient.opened"; layer: Exclude<PromptTransientLayerV2, "none"> }
  | { type: "transient.closed" }
  | { type: "review.modeSelected"; mode: PromptReviewModeV2 }
  | { type: "document.replaced"; document: PromptDocumentV2 }
  | { type: "document.mutated"; document: PromptDocumentV2 }
  | {
      type: "refinement.stateObserved";
      refinementId: PromptRefinementId;
      state: PromptRefinementState;
    }
  | { type: "candidate.added"; candidate: PromptCandidateV2 }
  | { type: "candidate.selected"; candidateId: string }
  | { type: "operation.started"; operation: PromptAsyncOperationV2 }
  | { type: "operation.cancelling"; cancellationId: string }
  | {
      type: "operation.finished";
      requestId: string;
      sourceRevision: number;
      sourceHash: string;
      message?: string;
    }
  | { type: "operation.failed"; requestId: string; message: string }
  | { type: "persistence.conflict"; conflict: PromptPersistenceConflictV2 }
  | { type: "persistence.conflictResolved" }
  | { type: "typeFit.keep" }
  | { type: "typeFit.switchRequired" }
  | { type: "status.cleared" };

export function createPromptComposerStateV2(
  document: PromptDocumentV2,
): PromptComposerStateV2 {
  return {
    route: "create",
    stage: "write",
    focus: "baseline",
    transient: "none",
    reviewMode: "structure",
    document,
    candidates: [],
    typeFitDecision: "none",
  };
}

export function reducePromptComposerV2(
  state: PromptComposerStateV2,
  event: PromptComposerEventV2,
): PromptComposerStateV2 {
  switch (event.type) {
    case "route.selected":
      return {
        ...state,
        route: event.route,
        transient: "none",
        statusMessage: undefined,
      };
    case "stage.selected":
      return {
        ...state,
        stage: event.stage,
        focus:
          event.stage === "write"
            ? "baseline"
            : event.stage === "review"
              ? "review"
              : state.focus,
        transient: "none",
      };
    case "focus.selected":
      return { ...state, focus: event.focus, transient: "none" };
    case "transient.opened":
      return { ...state, transient: event.layer };
    case "transient.closed":
      return { ...state, transient: "none" };
    case "review.modeSelected":
      return { ...state, reviewMode: event.mode };
    case "document.replaced":
      return {
        ...createPromptComposerStateV2(event.document),
        route: state.route,
      };
    case "document.mutated": {
      const candidates = state.candidates.map((candidate) => ({
        ...candidate,
        stale:
          candidate.sourceRevision !== event.document.revision ||
          candidate.sourceDocumentHash !== event.document.canonicalHash,
      }));
      return {
        ...state,
        document: event.document,
        candidates,
        selectedCandidateId: undefined,
        activeOperation: undefined,
        typeFitDecision: "none",
        statusMessage: "Source changed. Previous candidates are stale.",
      };
    }
    case "refinement.stateObserved":
      return {
        ...state,
        statusMessage: `${event.refinementId} is ${event.state}.`,
      };
    case "candidate.added":
      if (
        event.candidate.sourceRevision !== state.document.revision ||
        event.candidate.sourceDocumentHash !== state.document.canonicalHash
      ) {
        return { ...state, statusMessage: "Stale candidate was rejected." };
      }
      return {
        ...state,
        candidates: [
          event.candidate,
          ...state.candidates.filter(({ id }) => id !== event.candidate.id),
        ],
        selectedCandidateId: event.candidate.id,
      };
    case "candidate.selected": {
      const candidate = state.candidates.find(
        ({ id }) => id === event.candidateId,
      );
      if (!candidate || candidate.stale) {
        return {
          ...state,
          statusMessage: "A stale candidate cannot be selected.",
        };
      }
      return { ...state, selectedCandidateId: candidate.id };
    }
    case "operation.started":
      return {
        ...state,
        activeOperation: event.operation,
        statusMessage: undefined,
      };
    case "operation.cancelling":
      if (state.activeOperation?.cancellationId !== event.cancellationId)
        return state;
      return {
        ...state,
        activeOperation: {
          ...state.activeOperation,
          status: "cancelling",
        },
      };
    case "operation.finished":
      if (state.activeOperation?.requestId !== event.requestId) return state;
      if (
        event.sourceRevision !== state.document.revision ||
        event.sourceHash !== state.document.canonicalHash
      ) {
        return {
          ...state,
          activeOperation: undefined,
          statusMessage: "Stale operation result was ignored.",
        };
      }
      return {
        ...state,
        activeOperation: undefined,
        statusMessage: event.message,
      };
    case "operation.failed":
      if (state.activeOperation?.requestId !== event.requestId) return state;
      return {
        ...state,
        activeOperation: undefined,
        statusMessage: event.message,
      };
    case "persistence.conflict":
      return { ...state, persistenceConflict: event.conflict };
    case "persistence.conflictResolved":
      return { ...state, persistenceConflict: undefined };
    case "typeFit.keep":
      return { ...state, typeFitDecision: "keep" };
    case "typeFit.switchRequired":
      return { ...state, typeFitDecision: "switch-required" };
    case "status.cleared":
      return { ...state, statusMessage: undefined };
  }
}
