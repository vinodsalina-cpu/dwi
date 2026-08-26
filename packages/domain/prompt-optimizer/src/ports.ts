import type { PromptProvider, PromptUsage } from "./types.js";
import type {
  PromptSemanticRequestV2,
  PromptSemanticResultV2,
} from "./v2/semantic.js";
import type { PromptRepositoryContextV2 } from "./v2/types.js";

export interface PromptProviderGenerationRequest {
  model: string;
  system: string;
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs?: number;
}

export interface PromptProviderGenerationResult {
  text: string;
  finishReason: string;
  latencyMs: number;
  usage?: PromptUsage;
}

export interface PromptProviderPort {
  readonly id: PromptProvider;
  readonly model: string;
  generate(
    credential: string,
    request: PromptProviderGenerationRequest,
    signal: AbortSignal,
  ): Promise<PromptProviderGenerationResult>;
}

export interface PromptProviderRegistryPort {
  get(provider: PromptProvider): Promise<PromptProviderPort>;
}

export interface PromptSemanticProviderPort {
  execute(
    credential: string,
    request: PromptSemanticRequestV2,
    signal: AbortSignal,
  ): Promise<PromptSemanticResultV2>;
}

export interface PromptSemanticProviderRegistryPort {
  get(provider: PromptProvider): Promise<PromptSemanticProviderPort>;
}

export interface PromptCredentialPort {
  getCredential(provider: PromptProvider): PromiseLike<string | undefined>;
}

export interface PromptStatePort {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface CapturedEditorSelection {
  content: string;
  label: string;
  languageId?: string;
  relativePath?: string;
}

export interface PickedPromptFile {
  bytes: Uint8Array;
  byteLength?: number;
  label: string;
  languageId?: string;
  relativePath?: string;
}

export interface PromptFilePort {
  pickContextFiles(): PromiseLike<readonly PickedPromptFile[] | undefined>;
  pickImportJson(): PromiseLike<Uint8Array | undefined>;
  saveExportJson(
    suggestedName: string,
    content: Uint8Array,
  ): PromiseLike<boolean>;
}

export interface PromptConfirmationPort {
  confirmRecordDelete(label: string): PromiseLike<boolean>;
  confirmTemplateDelete(label: string): PromiseLike<boolean>;
  confirmRecentRemove(label: string): PromiseLike<boolean>;
  confirmRecentClear(count: number): PromiseLike<boolean>;
}

export interface PromptOptimizerPorts {
  getCredential(provider: PromptProvider): PromiseLike<string | undefined>;
  providers: PromptProviderRegistryPort;
  captureSelection():
    | CapturedEditorSelection
    | undefined
    | PromiseLike<CapturedEditorSelection | undefined>;
  files: PromptFilePort;
  prompts: PromptConfirmationPort;
  workspaceAvailable(): boolean;
  workspaceState: PromptStatePort;
  globalState: PromptStatePort;
  now?: () => number;
  createId?: () => string;
  timeoutMs?: number;
  loadGovernedPromptContext?: (
    signal?: AbortSignal,
  ) => PromiseLike<PromptRepositoryContextV2>;
}
