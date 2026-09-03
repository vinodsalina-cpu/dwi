import * as vscode from "vscode";
import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  createPromptDocumentV2,
  executeBoundedSemanticEnhancementV2,
  finalizePromptDocumentV2,
  isEntityId,
  resolvePromptSourcesV2,
} from "@platform/domain-prompt-optimizer";
import {
  DWI_MODULES,
  briefDigest,
  compileDwiCandidate,
  createFeedback,
  evaluationMarkdown,
  projectSnapshotToBackstageComponent,
  projectSnapshotToBrief,
  resolveProjectSnapshot,
  type DwiBrief,
  type DwiCandidate,
  type DwiFeedback,
  type DwiProjectSnapshot,
} from "@platform/dwi-core";
import { collectProjectIntelligence } from "@platform/domain-workspace";
import { requireWorkspaceFolder, runWhileWorkspaceCurrent } from "./workspace-state.js";
import { DWI_SNAPSHOT_SCHEMA, DwiWorkspaceSnapshotStore, clearPromptOptimizerState, type DwiOptimizerReview, type DwiWorkspaceConsent, type DwiWorkspaceSnapshot } from "./workspace-snapshot.js";
import { PROVIDER_SECRET_KEY, PROVIDER_SETTINGS_KEY, ProviderRewriteError, checkGeminiProvider, checkOpenAICompatibleProvider, noProviderSettings, normalizeProviderSettings, providerTarget, semanticProviderPort, validateProviderSettings, type ProviderSettingsInput } from "./provider-settings.js";
import { gitOriginFromConfig, selectWorkspaceRoot, workspaceIdentity, type WorkspaceIdentity } from "./workspace-identity.js";
import { collectWorkspaceInspection, WORKSPACE_INSPECTION_EXCLUDE_GLOB, WORKSPACE_INSPECTION_POLICY_VERSION, workspaceInspectionScopeDigest } from "./workspace-inspection.js";
import {
  createProjectDeclarationExclusively,
  parseProjectDeclaration,
  projectDeclarationTemplate,
} from "./project-declaration.js";
import { importProjectStandards } from "./project-importers.js";
import { projectIntelligenceToSnapshot } from "./project-snapshot-adapter.js";
import { gitRevisionChanges, parseGitRevision, parseSafeGitHeadReference, type GitRevision } from "./git-revision.js";
import { bindBriefForProject, canCompileProjectBrief, canConfirmProjectBrief, canResetPromptOptimizerState, confirmWorkspaceBrief, hasApprovedProjectReview } from "./workflow-state.js";
import { MockTemplateLibraryBackend } from "./template-library-backend.js";
import {
  TEMPLATE_CLONE_EXTENSIONS,
  TEMPLATE_CLONE_LIMIT_BYTES,
  decodeTemplateCloneBytes,
  parseTemplateCloneText,
  parseTemplateLibraryMessage,
  type TemplateLibraryCloneMode,
  type TemplateLibraryHostMessage,
} from "./template-library-protocol.js";
import { TemplateLibraryStore, TemplateLibraryStoreError } from "./template-library-store.js";
import { parsePromptCompileRequest, type PromptComposeInput } from "./prompt-compose-protocol.js";
import { parsePromptOptimizerCommand, type PromptOptimizerInput, type PromptOptimizerView } from "./prompt-optimizer-protocol.js";
import { PromptOptimizerRequestBoundary, persistedPromptOptimizerView, restorePromptOptimizerView, type PersistedPromptOptimizerView } from "./prompt-optimizer-session.js";
import { PromptOptimizerSessionStore, type PromptOptimizerSession, type PromptOptimizerSessionRecent } from "./prompt-optimizer-session-store.js";
import { resolveDwiEditorDocument, resolvePersistedPromptReviewDocument, type ResolvedDwiEditorDocument } from "./editor-document.js";
import { ConsentCapabilityStore } from "./consent-capability.js";
import { reviewedProjectSourceContribution } from "./prompt-source-adapter.js";
import { packagedSmokeConfirmationsEnabled } from "./confirmation-mode.js";

const MAX_DECLARATION_BYTES = 64 * 1024;
const MAX_GIT_CONFIG_BYTES = 1024 * 1024;
const MAX_GIT_HEAD_BYTES = 4 * 1024;
const MAX_GIT_REF_BYTES = 4 * 1024;
const MAX_PACKED_REFS_BYTES = 4 * 1024 * 1024;
const MAX_MANAGED_STATE_BYTES = 4 * 1024 * 1024;
const MAX_ACTIVITY_HISTORY = 40;
const MAX_ACTIVITY_OUTPUT_ENTRIES = 200;
const MAX_ACTIVITY_CATEGORY_CHARS = 32;
const MAX_ACTIVITY_TITLE_CHARS = 96;
const MAX_ACTIVITY_DETAIL_CHARS = 240;
type Message = { type: string; [key: string]: unknown };
export const DWI_PROMPT_OPTIMIZER_VIEW_ID = "dwi-prompt-optimizer-view";
export const DWI_NATIVE_VIEW_ID = DWI_PROMPT_OPTIMIZER_VIEW_ID;
const DWI_ACTIVITY_CONTAINER_ID = "dwi-sidebar";
const DWI_CONSENT_RECEIPTS_KEY = "dwi.workspaceInspectionConsent.v1";
const PROMPT_OPTIMIZER_RECENTS_KEY = "dwi.promptOptimizer.recents.v1";
const PROMPT_OPTIMIZER_VIEWS_KEY = "dwi.promptOptimizer.views.v1";
const PROMPT_OPTIMIZER_RECENT_LIMIT = 5;

interface PromptOptimizerRecent {
  id: string;
  workspaceFingerprint: string;
  title: string;
  preview: string;
  promptType: PromptOptimizerInput["promptType"];
  updatedAt: string;
  source?: DwiOptimizerReview["source"];
  provider?: string;
  model?: string;
}

export type DwiActivityLevel = "info" | "warning" | "error";

export interface DwiActivityEntry {
  id: string;
  timestamp: string;
  level: DwiActivityLevel;
  category: string;
  title: string;
  detail?: string;
}

interface DwiActivityDraft {
  level: DwiActivityLevel;
  category: string;
  title: string;
  detail?: string;
}

function boundedActivityText(value: string, maxChars: number): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

function semanticFailureActivityDetail(diagnostic: { expected: string; received: string; notAllowed: string; happened: string }): string {
  const expected = boundedActivityText(diagnostic.expected, 44);
  const received = boundedActivityText(diagnostic.received, 44);
  const notAllowed = boundedActivityText(diagnostic.notAllowed, 44);
  const happened = boundedActivityText(diagnostic.happened, 44);
  return `Expected: ${expected} Received: ${received} Not allowed: ${notAllowed} Happened: ${happened}`;
}

class WorkspaceSelectionChangedError extends Error {
  constructor() {
    super("The selected workspace root changed while Prompt Optimizer was working; retry in the current root.");
    this.name = "WorkspaceSelectionChangedError";
  }
}

function currentInspectionConsent(workspaceFingerprint: string, approvedAt = new Date().toISOString()): DwiWorkspaceConsent {
  return { policyVersion: WORKSPACE_INSPECTION_POLICY_VERSION, scopeDigest: workspaceInspectionScopeDigest(), workspaceFingerprint, approvedAt };
}

function matchingInspectionConsent(snapshot: DwiWorkspaceSnapshot, receipt: DwiWorkspaceConsent | undefined): boolean {
  return Boolean(
    receipt && snapshot.consent &&
    snapshot.consent.policyVersion === WORKSPACE_INSPECTION_POLICY_VERSION &&
    snapshot.consent.scopeDigest === workspaceInspectionScopeDigest() &&
    snapshot.consent.workspaceFingerprint === receipt.workspaceFingerprint &&
    snapshot.consent.policyVersion === receipt.policyVersion &&
    snapshot.consent.scopeDigest === receipt.scopeDigest &&
    snapshot.consent.approvedAt === receipt.approvedAt,
  );
}

type BoundedWorkspaceText =
  | { status: "absent" }
  | { status: "value"; value: string; sha256: string }
  | { status: "invalid"; reason: "too-large" | "invalid-utf8" | "unreadable" | "unsafe-path" };

function isMissingFile(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
  return code === "FileNotFound" || code === "ENOENT";
}

async function boundedWorkspaceTextAt(root: vscode.Uri, segments: readonly string[], maxBytes: number): Promise<BoundedWorkspaceText> {
  let uri = root;
  let finalStat: vscode.FileStat | undefined;
  for (const [index, segment] of segments.entries()) {
    uri = vscode.Uri.joinPath(uri, segment);
    try {
      finalStat = await vscode.workspace.fs.stat(uri);
    } catch (error) {
      return isMissingFile(error) ? { status: "absent" } : { status: "invalid", reason: "unreadable" };
    }
    if (finalStat.type & vscode.FileType.SymbolicLink) return { status: "invalid", reason: "unsafe-path" };
    const isLast = index === segments.length - 1;
    if ((!isLast && !(finalStat.type & vscode.FileType.Directory)) || (isLast && (finalStat.type & vscode.FileType.Directory))) {
      return { status: "invalid", reason: "unsafe-path" };
    }
  }
  if (!finalStat) return { status: "invalid", reason: "unsafe-path" };
  const size = finalStat.size;
  if (size > maxBytes) return { status: "invalid", reason: "too-large" };
  let bytes: Uint8Array;
  try {
    bytes = await vscode.workspace.fs.readFile(uri);
  } catch {
    return { status: "invalid", reason: "unreadable" };
  }
  if (bytes.byteLength > maxBytes) return { status: "invalid", reason: "too-large" };
  try {
    return {
      status: "value",
      value: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch {
    return { status: "invalid", reason: "invalid-utf8" };
  }
}

async function boundedWorkspacePathStat(root: vscode.Uri, candidate: vscode.Uri): Promise<{ size: number; isSymbolicLink: boolean }> {
  const rootPath = root.path.replace(/\/+$/, "");
  if (candidate.scheme !== root.scheme || candidate.authority !== root.authority || !candidate.path.startsWith(`${rootPath}/`)) {
    return { size: 0, isSymbolicLink: true };
  }
  const segments = candidate.path.slice(rootPath.length + 1).split("/");
  if (!segments.length || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    return { size: 0, isSymbolicLink: true };
  }
  let current = root;
  let final: vscode.FileStat | undefined;
  for (const [index, segment] of segments.entries()) {
    current = vscode.Uri.joinPath(current, segment);
    final = await vscode.workspace.fs.stat(current);
    if (final.type & vscode.FileType.SymbolicLink) return { size: final.size, isSymbolicLink: true };
    if (index < segments.length - 1 && !(final.type & vscode.FileType.Directory)) return { size: final.size, isSymbolicLink: true };
  }
  return { size: final?.size ?? 0, isSymbolicLink: false };
}

async function workspaceRevision(folder: vscode.WorkspaceFolder): Promise<GitRevision> {
  const activeGit = activeGitRevision(folder);
  if (activeGit) return activeGit;
  const headResult = await boundedWorkspaceTextAt(folder.uri, [".git", "HEAD"], MAX_GIT_HEAD_BYTES);
  if (headResult.status !== "value") return { branch: null, commit: null, dirty: null };
  const head = headResult.value;
  const reference = parseSafeGitHeadReference(head)?.fullReference;
  const looseResult = reference ? await boundedWorkspaceTextAt(folder.uri, [".git", ...reference.split("/")], MAX_GIT_REF_BYTES) : { status: "absent" } as const;
  const loose = looseResult.status === "value" ? looseResult.value : undefined;
  const packedResult = reference && !loose ? await boundedWorkspaceTextAt(folder.uri, [".git", "packed-refs"], MAX_PACKED_REFS_BYTES) : { status: "absent" } as const;
  const packed = packedResult.status === "value" ? packedResult.value : undefined;
  return parseGitRevision(head, loose, packed);
}

interface ActiveGitApi {
  repositories: readonly {
    rootUri: vscode.Uri;
    state: {
      HEAD?: { commit?: string; name?: string };
      remotes?: readonly { name: string; fetchUrl?: string; pushUrl?: string }[];
      workingTreeChanges: readonly unknown[];
      indexChanges: readonly unknown[];
      mergeChanges: readonly unknown[];
    };
  }[];
}

interface ActiveGitExtension {
  getAPI(version: 1): ActiveGitApi;
}

function activeGitRevision(folder: vscode.WorkspaceFolder): GitRevision | undefined {
  try {
    const repository = activeGitRepository(folder);
    if (!repository) return undefined;
    return {
      branch: repository.state.HEAD?.name ?? null,
      commit: repository.state.HEAD?.commit?.toLowerCase() ?? null,
      dirty: repository.state.workingTreeChanges.length + repository.state.indexChanges.length + repository.state.mergeChanges.length > 0,
    };
  } catch {
    return undefined;
  }
}

function activeGitRepository(folder: vscode.WorkspaceFolder): ActiveGitApi["repositories"][number] | undefined {
  try {
    const extension = vscode.extensions.getExtension<ActiveGitExtension>("vscode.git");
    if (!extension?.isActive) return undefined;
    return extension.exports.getAPI(1).repositories
      .filter(({ rootUri }) => rootUri.scheme === folder.uri.scheme && rootUri.authority === folder.uri.authority && (folder.uri.path === rootUri.path || folder.uri.path.startsWith(`${rootUri.path.replace(/\/+$/, "")}/`)))
      .sort((left, right) => right.rootUri.path.length - left.rootUri.path.length)[0];
  } catch {
    return undefined;
  }
}

function repositoryRelativeRoot(repository: vscode.Uri, folder: vscode.Uri): string {
  if (repository.path === folder.path) return ".";
  return folder.path.slice(repository.path.replace(/\/+$/, "").length + 1) || ".";
}

async function scanApprovedWorkspace(folder: vscode.WorkspaceFolder, identity: WorkspaceIdentity): Promise<{ project: DwiProjectSnapshot; brief: DwiBrief }> {
  const inspection = await collectWorkspaceInspection<vscode.Uri>({
    findFiles: async (glob, limit) => vscode.workspace.findFiles(new vscode.RelativePattern(folder, glob), WORKSPACE_INSPECTION_EXCLUDE_GLOB, limit),
    relativePath: (uri) => vscode.workspace.asRelativePath(uri, false).replaceAll("\\", "/"),
    stat: async (uri) => boundedWorkspacePathStat(folder.uri, uri),
    readFile: async (uri) => vscode.workspace.fs.readFile(uri),
    readRootEntries: async () => (await vscode.workspace.fs.readDirectory(folder.uri)).map(([name]) => name),
  });
  const revision = await workspaceRevision(folder);
  const intelligence = collectProjectIntelligence({
    workspaceId: identity.fingerprint,
    projectName: folder.name,
    manifests: inspection.manifests,
    rootEntries: inspection.rootEntries,
    workspaceRoots: inspection.workspaceRoots,
    revision: {
      commit: revision.commit,
      branch: revision.branch,
      ...(revision.dirty !== null ? { dirty: revision.dirty } : {}),
    },
  });
  const declarationResult = await boundedWorkspaceTextAt(folder.uri, [".dwi", "project.yaml"], MAX_DECLARATION_BYTES);
  if (declarationResult.status === "invalid") throw new Error(`.dwi/project.yaml is ${declarationResult.reason.replaceAll("-", " ")}; fix it before Prompt Optimizer infers project metadata.`);
  const declarationContent = declarationResult.status === "value" ? declarationResult.value : undefined;
  const evidenceContent = Object.fromEntries(inspection.manifests.flatMap(({ path, content }) => content === undefined ? [] : [[path, content]]));
  const evidenceSha256 = Object.fromEntries(inspection.manifests.flatMap(({ path, contentSha256 }) =>
    contentSha256 === undefined ? [] : [[path, contentSha256]],
  ));
  const project = projectIntelligenceToSnapshot({
    intelligence,
    repository: identity.repository,
    sourceRoot: identity.sourceRoot,
    remoteIdentityHash: identity.fingerprint,
    evidenceContent,
    evidenceSha256,
    standards: importProjectStandards(evidenceContent),
    omissions: inspection,
    ...(declarationContent ? { declaration: { value: parseProjectDeclaration(declarationContent), content: declarationContent, sha256: declarationResult.status === "value" ? declarationResult.sha256 : undefined } } : {}),
  });
  return { project, brief: projectSnapshotToBrief(project) };
}

interface WorkspaceOperation {
  folder: vscode.WorkspaceFolder;
  epoch: number;
  identity: WorkspaceIdentity;
  store: DwiWorkspaceSnapshotStore<vscode.Uri>;
}

type ProjectReviewChoice = "approve" | "export" | "cancel";
interface ConfirmationPort {
  approveInspection(folderName: string): Promise<boolean>;
  reviewProject(project: DwiProjectSnapshot): Promise<ProjectReviewChoice>;
}

function confirmationPort(context: vscode.ExtensionContext): ConfirmationPort {
  if (packagedSmokeConfirmationsEnabled(context.extensionMode, process.env.DWI_PACKAGED_SMOKE)) {
    return {
      approveInspection: async () => true,
      reviewProject: async () => "approve",
    };
  }
  return {
    approveInspection: async (folderName) => (await vscode.window.showWarningMessage(
      `Allow Prompt Optimizer to inspect the bounded metadata for ${folderName}?`,
      { modal: true, detail: "Prompt Optimizer will read only the documented, size-bounded project metadata and store the reviewed summary in VS Code global storage." },
      "Allow bounded check",
    )) === "Allow bounded check",
    reviewProject: async (project) => {
      const choice = await vscode.window.showInformationMessage(
        `Review project details for ${project.metadata.name}`,
        {
          modal: true,
          detail: `${project.claims.length} details from ${project.evidence.length} local sources · ${project.resolution.unknowns.length} open questions · ${project.resolution.conflicts.length} conflicts. Approval records that you reviewed this exact project version; open questions remain visible in the prompt.`,
        },
        "Approve project details",
        "Export details…",
      );
      return choice === "Approve project details" ? "approve" : choice === "Export details…" ? "export" : "cancel";
    },
  };
}

class DwiSidebarProvider implements vscode.WebviewViewProvider {
  private readonly views = new Map<string, vscode.WebviewView>();
  private editorDocumentPanel: vscode.WebviewPanel | undefined;
  private selectedRootUri: string | undefined;
  private requestQueue: Promise<void> = Promise.resolve();
  private readonly activityEntries: DwiActivityEntry[] = [];
  private activityOutputEntries = 0;
  private rootEpoch = 0;
  private readonly pendingConsentCapabilities = new ConsentCapabilityStore<vscode.Webview>();
  private readonly optimizerControllers = new Map<string, AbortController>();
  private readonly optimizerRequests = new PromptOptimizerRequestBoundary();
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly templateLibrary: TemplateLibraryStore,
    private readonly optimizerSessions: PromptOptimizerSessionStore,
    private readonly confirmations: ConfirmationPort,
  ) {}
  dispose(): void {
    this.editorDocumentPanel?.dispose();
    this.editorDocumentPanel = undefined;
    this.pendingConsentCapabilities.clear();
    this.views.clear();
  }
  resolveWebviewView(view: vscode.WebviewView): void {
    this.views.set(view.viewType, view);
    view.onDidDispose(() => {
      if (this.views.get(view.viewType) === view) this.views.delete(view.viewType);
    }, undefined, this.context.subscriptions);
    const { webview } = view;
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")] };
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "dwi-webview.js")); const css = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "dwi-webview.css")); const nonce = randomUUID().replaceAll("-", "");
    const initialSurface = "optimizer";
    webview.html = `<!doctype html><html data-dwi-initial-surface="${initialSurface}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'"><link rel="stylesheet" href="${css}"></head><body><div id="root"></div><script nonce="${nonce}" type="module" src="${js}"></script></body></html>`;
    webview.onDidReceiveMessage((message: Message) => {
      void this.dispatch(message, webview).catch(async (error: unknown) => {
        if (error instanceof WorkspaceSelectionChangedError) return;
        const detail = "Prompt Optimizer could not complete this request. Retry or open Activity and its editor log for troubleshooting details.";
        this.recordActivity({
          level: "error",
          category: "Workflow",
          title: "Request failed",
          detail: "The extension host could not complete the requested action.",
        }, webview);
        try {
          await webview.postMessage({ type: "dwi.error", code: "request-failed", message: detail });
          await webview.postMessage({ type: "dwi.project.error", message: detail });
        } catch {
          // The webview may have been disposed while the request was in flight.
        }
      });
    }, undefined, this.context.subscriptions);
  }
  async reveal(surface: "home" | "optimizer" = "optimizer"): Promise<void> {
    await vscode.commands.executeCommand(`workbench.view.extension.${DWI_ACTIVITY_CONTAINER_ID}`);
    const view = this.views.get(DWI_PROMPT_OPTIMIZER_VIEW_ID);
    if (!view) return;
    await this.enqueueMutation(() => this.handle({ type: "dwi.session.open" }, view.webview));
    await view.webview.postMessage({ type: "dwi.surface.select", surface });
    view.show(true);
  }
  workspaceChanged(): void {
    this.rootEpoch += 1;
    this.selectedRootUri = undefined;
    this.pendingConsentCapabilities.clear();
    this.optimizerRequests.invalidate();
    this.recordActivity({
      level: "warning",
      category: "Workspace",
      title: "Workspace selection changed",
      detail: "In-flight work was stopped and the local session will be reloaded.",
    });
    for (const view of this.views.values()) {
      void view.webview.postMessage({ type: "dwi.workspace.changed" });
    }
  }
  private async dispatch(message: Message, webview: vscode.Webview): Promise<void> {
    const optimizerCommand = message.type.startsWith("prompt.v2.") ? parsePromptOptimizerCommand(message) : undefined;
    if (message.type === "prompt.v2.cancel") {
      const command = optimizerCommand;
      if (command?.type === "prompt.v2.cancel") {
        this.optimizerControllers.get(command.cancellationId)?.abort();
        await webview.postMessage({ type: "prompt.v2.cancelled", requestId: command.requestId, correlationId: command.correlationId });
      }
      return;
    }
    if (optimizerCommand?.type === "prompt.v2.draft.save") {
      this.optimizerRequests.invalidate();
    }
    if (optimizerCommand?.type === "prompt.v2.compile" || optimizerCommand?.type === "prompt.v2.semantic") {
      const baseHash = createHash("sha256").update(JSON.stringify({
        task: optimizerCommand.input.task,
        assignmentId: optimizerCommand.input.assignmentId,
        promptType: optimizerCommand.input.promptType,
        outputSize: optimizerCommand.input.outputSize,
      })).digest("hex");
      this.optimizerRequests.start({ documentId: optimizerCommand.documentId, requestId: optimizerCommand.requestId, baseHash });
    }
    if (optimizerCommand?.type === "prompt.v2.semantic") {
      await this.handle(message, webview);
      return;
    }
    await this.enqueueMutation(() => this.handle(message, webview));
  }

  private async enqueueMutation(task: () => Promise<void>): Promise<void> {
    const request = this.requestQueue.then(task);
    this.requestQueue = request.then(() => undefined, () => undefined);
    await request;
  }

  private optimizerRequestIsCurrent(command: { documentId: string; requestId: string }): boolean {
    return this.optimizerRequests.isCurrent(command);
  }

  private optimizerRequestIdentity(command: { documentId: string; requestId: string }): { documentId: string; requestId: string; revision: number; baseHash: string } | undefined {
    return this.optimizerRequests.currentFor(command);
  }

  private recordActivity(draft: DwiActivityDraft, webview?: vscode.Webview): void {
    const category = boundedActivityText(draft.category, MAX_ACTIVITY_CATEGORY_CHARS) || "General";
    const title = boundedActivityText(draft.title, MAX_ACTIVITY_TITLE_CHARS) || "Prompt Optimizer activity";
    const detail = draft.detail ? boundedActivityText(draft.detail, MAX_ACTIVITY_DETAIL_CHARS) : undefined;
    const latest = this.activityEntries.at(-1);
    if (
      latest &&
      latest.level === draft.level &&
      latest.category === category &&
      latest.title === title &&
      latest.detail === detail &&
      Date.now() - Date.parse(latest.timestamp) < 1_500
    ) return;

    const entry: DwiActivityEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level: draft.level,
      category,
      title,
      ...(detail ? { detail } : {}),
    };
    this.activityEntries.push(entry);
    if (this.activityEntries.length > MAX_ACTIVITY_HISTORY) {
      this.activityEntries.splice(0, this.activityEntries.length - MAX_ACTIVITY_HISTORY);
    }
    const envelope = { type: "dwi.activity.entry" as const, entry };
    if (this.activityOutputEntries >= MAX_ACTIVITY_OUTPUT_ENTRIES) {
      this.output.clear();
      for (const retained of this.activityEntries) {
        this.output.appendLine(JSON.stringify({ type: "dwi.activity.entry", entry: retained }));
      }
      this.activityOutputEntries = this.activityEntries.length;
    } else {
      this.output.appendLine(JSON.stringify(envelope));
      this.activityOutputEntries += 1;
    }
    const recipients = webview ? [webview] : [...this.views.values()].map((view) => view.webview);
    for (const recipient of recipients) {
      void Promise.resolve(recipient.postMessage(envelope)).catch(() => undefined);
    }
  }

  private async replayActivity(webview: vscode.Webview): Promise<void> {
    for (const entry of this.activityEntries) {
      await webview.postMessage({ type: "dwi.activity.entry", entry });
    }
  }

  private recordActivityForHostMessage(message: unknown, webview: vscode.Webview): void {
    if (!message || typeof message !== "object" || !("type" in message)) return;
    const hostMessage = message as { type?: unknown; code?: unknown };
    if (hostMessage.type === "dwi.consent.required") {
      this.recordActivity({
        level: "warning",
        category: "Permissions",
        title: "Project check needs approval",
        detail: "Review the bounded local inspection scope before continuing.",
      }, webview);
      return;
    }
    if (hostMessage.type === "dwi.project.error") {
      this.recordActivity({
        level: "error",
        category: "Project",
        title: "Project update failed",
        detail: "The bounded local project check could not be completed.",
      }, webview);
      return;
    }
    if (hostMessage.type !== "dwi.error") return;
    const code = typeof hostMessage.code === "string" ? hostMessage.code : "unknown";
    const known: Record<string, DwiActivityDraft> = {
      "project-stale": {
        level: "warning",
        category: "Project",
        title: "Project evidence changed",
        detail: "Refresh and review the current snapshot before continuing.",
      },
      "review-required": {
        level: "warning",
        category: "Review",
        title: "Review required",
        detail: "Approve the current project details and confirm the brief before continuing.",
      },
      "project-details-required": {
        level: "warning",
        category: "Project",
        title: "Project details need attention",
        detail: "Resolve conflicting or unsupported required details before continuing.",
      },
      "candidate-missing": {
        level: "warning",
        category: "Workflow",
        title: "Compiled prompt required",
        detail: "Create a current prompt before saving an evaluation.",
      },
      "candidate-invalid": {
        level: "warning",
        category: "Workflow",
        title: "Compiled prompt is out of date",
        detail: "Recompile from the current approved brief before continuing.",
      },
      "brief-confirmation-required": {
        level: "warning",
        category: "Brief",
        title: "Brief confirmation required",
        detail: "Confirm the reviewed project brief before continuing.",
      },
      "initialization-failed": {
        level: "error",
        category: "Project",
        title: "Project inspection failed",
        detail: "The bounded local project check could not be initialized.",
      },
      "request-failed": {
        level: "error",
        category: "Workflow",
        title: "Request failed",
        detail: "The extension host could not complete the requested action.",
      },
    };
    this.recordActivity(known[code] ?? {
      level: "error",
      category: "Workflow",
      title: "Workflow action failed",
      detail: "The requested action could not be completed.",
    }, webview);
  }

  private async handleTemplateLibraryMessage(message: Message, webview: vscode.Webview): Promise<boolean> {
    if (typeof message.type !== "string" || !message.type.startsWith("dwi.library.")) return false;
    const request = parseTemplateLibraryMessage(message);
    if (!request) {
      const operationId = isEntityId(message.operationId) ? message.operationId : undefined;
      if (message.type === "dwi.library.clone.file.pick" || message.type === "dwi.library.clone.paste.validate") {
        await this.postTemplateLibrary(webview, {
          type: "dwi.library.clone",
          operationId: operationId ?? `invalid:${randomUUID()}`,
          mode: message.type === "dwi.library.clone.file.pick" ? "file" : "paste",
          status: "invalid",
          message: "The clone request is invalid. Your current clone mode was preserved.",
        });
      } else {
        await this.postTemplateLibrary(webview, {
          type: "dwi.library.error",
          code: "invalid-request",
          message: "The template library request is invalid.",
          ...(operationId ? { operationId } : {}),
        });
      }
      return true;
    }

    try {
      if (request.type === "dwi.library.open") {
        await this.postTemplateLibrary(webview, { type: "dwi.library.state", state: await this.templateLibrary.open() });
        return true;
      }
      if (request.type === "dwi.library.item.get") {
        await this.postTemplateLibrary(webview, { type: "dwi.library.detail", detail: await this.templateLibrary.get(request.templateId) });
        await this.postTemplateLibrary(webview, { type: "dwi.library.state", state: await this.templateLibrary.open() });
        return true;
      }
      if (request.type === "dwi.library.template.save") {
        const result = await this.templateLibrary.save(request.operationId, request.expectedRevision, request.template);
        await this.postTemplateLibrary(webview, {
          type: "dwi.library.saved",
          operationId: request.operationId,
          detail: result.detail,
          state: result.state,
          published: result.published,
        });
        this.recordActivity({
          level: result.published ? "info" : "warning",
          category: "Template library",
          title: "Personal template saved",
          detail: result.published
            ? "The template was saved locally and its backup was acknowledged; contents are excluded from activity and metadata logs."
            : "The template was saved locally, but its backup was not acknowledged; contents are excluded from activity and metadata logs.",
        }, webview);
        return true;
      }
      if (request.type === "dwi.library.template.delete") {
        const result = await this.templateLibrary.delete(request.operationId, request.expectedRevision, request.templateId);
        await this.postTemplateLibrary(webview, {
          type: "dwi.library.deleted",
          operationId: request.operationId,
          templateId: result.templateId,
          state: result.state,
          published: result.published,
        });
        this.recordActivity({
          level: result.published ? "info" : "warning",
          category: "Template library",
          title: "Personal template deleted",
          detail: result.published
            ? "The local body and backup were removed before the metadata-only deletion tombstone was acknowledged."
            : "The local body was cleared; backup deletion remains queued for acknowledgement.",
        }, webview);
        return true;
      }
      if (request.type === "dwi.library.feedback.submit") {
        const result = await this.templateLibrary.submitFeedback(
          request.operationId,
          request.expectedRevision,
          request.templateId,
          request.rating,
          request.stars,
          request.note,
        );
        await this.postTemplateLibrary(webview, {
          type: "dwi.library.feedback",
          operationId: request.operationId,
          templateId: result.templateId,
          rating: result.rating,
          stars: result.stars,
          reviewedAt: result.reviewedAt,
          state: result.state,
          published: result.published,
        });
        this.recordActivity({
          level: result.published ? "info" : "warning",
          category: "Template library",
          title: "Template feedback recorded",
          detail: result.published
            ? "Feedback delivery was acknowledged; note text is excluded from activity and metadata logs."
            : "The review timestamp was saved locally, but feedback delivery was not acknowledged; note text is excluded from activity and metadata logs.",
        }, webview);
        return true;
      }
      if (request.type === "dwi.library.clone.file.pick") {
        await this.pickTemplateCloneFile(webview, request.operationId);
        return true;
      }
      const clone = parseTemplateCloneText(request.text);
      await this.postTemplateLibrary(webview, clone.status === "ready"
        ? { type: "dwi.library.clone", operationId: request.operationId, mode: "paste", status: "ready", template: clone.template }
        : { type: "dwi.library.clone", operationId: request.operationId, mode: "paste", status: "invalid", message: clone.message });
      return true;
    } catch (error) {
      await this.postTemplateLibraryError(webview, error, "operationId" in request ? request.operationId : undefined);
      return true;
    }
  }

  private async pickTemplateCloneFile(webview: vscode.Webview, operationId: string): Promise<void> {
    const mode: TemplateLibraryCloneMode = "file";
    try {
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: "Clone template",
        filters: { "Template text": ["md", "txt", "json", "yaml", "yml"] },
      });
      const uri = selection?.[0];
      if (!uri) {
        await this.postTemplateLibrary(webview, { type: "dwi.library.clone", operationId, mode, status: "cancelled" });
        return;
      }
      const extension = extname(uri.path).toLowerCase();
      if (!(TEMPLATE_CLONE_EXTENSIONS as readonly string[]).includes(extension)) {
        await this.postTemplateLibrary(webview, { type: "dwi.library.clone", operationId, mode, status: "invalid", message: "Choose a .md, .txt, .json, .yaml, or .yml file." });
        return;
      }
      const stat = await vscode.workspace.fs.stat(uri);
      if (!(stat.type & vscode.FileType.File) || stat.type & vscode.FileType.SymbolicLink || stat.size > TEMPLATE_CLONE_LIMIT_BYTES) {
        await this.postTemplateLibrary(webview, { type: "dwi.library.clone", operationId, mode, status: "invalid", message: "Choose a regular UTF-8 file no larger than 256 KiB." });
        return;
      }
      const parsed = decodeTemplateCloneBytes(await vscode.workspace.fs.readFile(uri));
      const sourceLabel = boundedActivityText(uri.path.split("/").at(-1) ?? "Template file", MAX_ACTIVITY_TITLE_CHARS);
      await this.postTemplateLibrary(webview, parsed.status === "ready"
        ? { type: "dwi.library.clone", operationId, mode, status: "ready", template: parsed.template, sourceLabel }
        : { type: "dwi.library.clone", operationId, mode, status: "invalid", message: parsed.message });
    } catch {
      await this.postTemplateLibrary(webview, { type: "dwi.library.clone", operationId, mode, status: "invalid", message: "The selected file could not be read as a bounded UTF-8 template." });
    }
  }

  private async postTemplateLibrary(webview: vscode.Webview, message: TemplateLibraryHostMessage): Promise<void> {
    await webview.postMessage(message);
  }

  private async postTemplateLibraryError(webview: vscode.Webview, error: unknown, operationId?: string): Promise<void> {
    if (error instanceof TemplateLibraryStoreError) {
      await this.postTemplateLibrary(webview, {
        type: "dwi.library.error",
        code: error.code,
        message: error.message,
        ...(operationId ? { operationId } : {}),
        ...(error.currentRevision !== undefined ? { currentRevision: error.currentRevision } : {}),
      });
      return;
    }
    await this.postTemplateLibrary(webview, {
      type: "dwi.library.error",
      code: "invalid-request",
      message: "Prompt Optimizer could not validate the template library request.",
      ...(operationId ? { operationId } : {}),
    });
  }

  private optimizerRecents(workspaceFingerprint?: string): PromptOptimizerRecent[] {
    if (workspaceFingerprint) {
      const opened = this.optimizerSessions.open(workspaceFingerprint);
      if (opened.status === "ready") return opened.session.recents.map((recent) => ({ ...recent, workspaceFingerprint }));
    }
    return this.legacyOptimizerRecents(workspaceFingerprint);
  }

  private legacyOptimizerRecents(workspaceFingerprint?: string): PromptOptimizerRecent[] {
    const stored = this.context.globalState.get<unknown>(PROMPT_OPTIMIZER_RECENTS_KEY, []);
    if (!Array.isArray(stored)) return [];
    return stored.filter((candidate): candidate is PromptOptimizerRecent => {
      if (!candidate || typeof candidate !== "object") return false;
      const recent = candidate as Partial<PromptOptimizerRecent>;
      return typeof recent.id === "string" && typeof recent.workspaceFingerprint === "string" &&
        typeof recent.title === "string" && typeof recent.preview === "string" &&
        typeof recent.promptType === "string" && typeof recent.updatedAt === "string";
    }).filter((recent) => !workspaceFingerprint || recent.workspaceFingerprint === workspaceFingerprint)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, PROMPT_OPTIMIZER_RECENT_LIMIT);
  }

  private async postOptimizerRecents(webview: vscode.Webview, workspaceFingerprint?: string): Promise<void> {
    await webview.postMessage({ type: "prompt.v2.recents", recents: this.optimizerRecents(workspaceFingerprint) });
  }

  private optimizerView(workspaceFingerprint: string): PersistedPromptOptimizerView {
    const opened = this.optimizerSessions.open(workspaceFingerprint);
    if (opened.status === "ready") return opened.session.view;
    return this.legacyOptimizerView(workspaceFingerprint);
  }

  private legacyOptimizerView(workspaceFingerprint: string): PersistedPromptOptimizerView {
    const stored = this.context.workspaceState.get<unknown>(PROMPT_OPTIMIZER_VIEWS_KEY, {});
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return "input";
    return restorePromptOptimizerView((stored as Record<string, unknown>)[workspaceFingerprint], true);
  }

  private async setOptimizerView(workspaceFingerprint: string, view: PromptOptimizerView, candidatePresent = false): Promise<PersistedPromptOptimizerView> {
    const persisted = persistedPromptOptimizerView(view, candidatePresent);
    await this.updateOptimizerSession(workspaceFingerprint, { view: persisted });
    return persisted;
  }

  private async updateOptimizerSession(
    workspaceFingerprint: string,
    patch: { view?: PersistedPromptOptimizerView; draft?: PromptOptimizerInput | null; candidate?: DwiCandidate | null; review?: DwiOptimizerReview | null; recents?: PromptOptimizerSessionRecent[] },
  ): Promise<boolean> {
    const opened = this.optimizerSessions.open(workspaceFingerprint);
    if (opened.status === "unavailable") return false;
    const current = opened.status === "ready" ? opened.session : undefined;
    const legacyRecents = this.optimizerRecents(workspaceFingerprint).map(({ workspaceFingerprint: _workspaceFingerprint, ...recent }) => recent);
    try {
      const candidate = patch.candidate === null ? undefined : patch.candidate ?? current?.candidate;
      const review = patch.review === null ? undefined : patch.review ?? current?.review;
      const draft = patch.draft === null ? undefined : patch.draft ?? current?.draft;
      await this.optimizerSessions.save({
        workspaceFingerprint,
        view: patch.view ?? current?.view ?? "input",
        ...(draft ? { draft } : {}),
        ...(candidate ? { candidate } : {}),
        ...(review ? { review } : {}),
        recents: patch.recents ?? current?.recents ?? legacyRecents,
      }, current?.revision ?? "new");
      return true;
    } catch {
      try { await this.optimizerSessions.reset(workspaceFingerprint); } catch { /* Preserve corrupt/newer state unchanged. */ }
      return false;
    }
  }

  private async invalidateOptimizerRecovery(workspaceFingerprint: string): Promise<void> {
    await this.updateOptimizerSession(workspaceFingerprint, { candidate: null, review: null });
  }

  private optimizerSessionMatchesSnapshot(session: PromptOptimizerSession, snapshot?: DwiWorkspaceSnapshot): boolean {
    if (!snapshot) return false;
    return JSON.stringify(session.draft) === JSON.stringify(snapshot.optimizerDraft ?? snapshot.candidateInput) &&
      JSON.stringify(session.candidate) === JSON.stringify(snapshot.candidate) &&
      JSON.stringify(session.review) === JSON.stringify(snapshot.optimizerReview);
  }

  private async migrateOptimizerSession(workspaceFingerprint: string, snapshot?: DwiWorkspaceSnapshot): Promise<void> {
    try {
      const migrated = await this.optimizerSessions.migrateLegacy(workspaceFingerprint, {
        view: this.legacyOptimizerView(workspaceFingerprint),
        ...(snapshot?.optimizerDraft ? { draft: snapshot.optimizerDraft } : {}),
        ...(snapshot?.candidate ? { candidate: snapshot.candidate } : {}),
        ...(snapshot?.optimizerReview ? { review: snapshot.optimizerReview } : {}),
        recents: this.legacyOptimizerRecents(workspaceFingerprint).map(({ workspaceFingerprint: _workspaceFingerprint, ...recent }) => recent),
      });
      if (migrated.status === "ready") await this.clearLegacyOptimizerState(workspaceFingerprint);
    } catch {
      // Legacy state remains the downgrade-safe recovery path when migration cannot be persisted.
    }
  }

  private async clearLegacyOptimizerState(workspaceFingerprint: string): Promise<void> {
    const storedViews = this.context.workspaceState.get<unknown>(PROMPT_OPTIMIZER_VIEWS_KEY, {});
    if (storedViews && typeof storedViews === "object" && !Array.isArray(storedViews)) {
      const nextViews = { ...(storedViews as Record<string, unknown>) };
      delete nextViews[workspaceFingerprint];
      await this.context.workspaceState.update(PROMPT_OPTIMIZER_VIEWS_KEY, nextViews);
    }
    const storedRecents = this.context.globalState.get<unknown>(PROMPT_OPTIMIZER_RECENTS_KEY, []);
    if (Array.isArray(storedRecents)) {
      await this.context.globalState.update(PROMPT_OPTIMIZER_RECENTS_KEY, storedRecents.filter((entry) =>
        !entry || typeof entry !== "object" || (entry as Partial<PromptOptimizerRecent>).workspaceFingerprint !== workspaceFingerprint,
      ));
    }
  }

  private async postOptimizerView(webview: vscode.Webview, workspaceFingerprint: string, candidatePresent: boolean): Promise<void> {
    const stored = this.optimizerView(workspaceFingerprint);
    await webview.postMessage({ type: "prompt.v2.view.state", view: restorePromptOptimizerView(stored, candidatePresent) });
  }

  private async resetOptimizerSession(workspaceFingerprint: string): Promise<void> {
    await this.optimizerSessions.reset(workspaceFingerprint);
    await this.clearLegacyOptimizerState(workspaceFingerprint);
  }

  private async postPromptError(
    webview: vscode.Webview,
    command: { requestId?: string; correlationId?: string },
    failureKind: string,
    message: string,
    retryable = false,
  ): Promise<void> {
    await webview.postMessage({
      type: "prompt.v2.error",
      requestId: command.requestId,
      correlationId: command.correlationId,
      failureKind,
      retryable,
      message,
      recovery: failureKind === "missing_credential" || failureKind === "authentication" || failureKind === "invalid_model" || failureKind === "quota"
        ? "profile"
        : failureKind === "validation" ? "local-compile" : "retry",
    });
  }

  private async handlePromptOptimizerMessage(message: Message, webview: vscode.Webview): Promise<boolean> {
    if (!message.type.startsWith("prompt.v2.")) return false;
    const command = parsePromptOptimizerCommand(message);
    if (!command) {
      await this.postPromptError(webview, {}, "validation", "Prompt Optimizer rejected an invalid Prompt Optimizer request.");
      return true;
    }
    if (command.type === "prompt.v2.cancel") return true;
    if (command.type === "prompt.v2.session.reset") {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      if (!snapshot || !canResetPromptOptimizerState(snapshot) || !await this.hasCurrentInspectionConsent(snapshot, operation.identity)) {
        await this.postPromptError(webview, {}, "initialization_required", "Initialize and review this project before resetting Prompt Optimizer progress.");
        return true;
      }
      this.assertWorkspaceOperation(operation.folder, operation.epoch);
      const cleared = clearPromptOptimizerState(snapshot, new Date().toISOString());
      await operation.store.updatePartial(cleared);
      await this.resetOptimizerSession(operation.identity.localFingerprint);
      await this.postOptimizerRecents(webview, operation.identity.localFingerprint);
      await this.postOptimizerView(webview, operation.identity.localFingerprint, false);
      await webview.postMessage({
        type: "prompt.v2.session.reset.result",
        status: "reset",
        retained: ["approved-project-brief", "project-declaration", "provider-settings"],
      });
      return true;
    }
    if (command.type === "prompt.v2.review.open") {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      if (!snapshot?.project || !snapshot.brief || !await this.hasCurrentInspectionConsent(snapshot, operation.identity)) {
        await this.postPromptError(webview, {}, "initialization_required", "Initialize and review this project before opening a prompt review.");
        return true;
      }
      const freshness = await this.currentProjectComparison(snapshot.project, operation);
      if (freshness.changes.length || !canCompileProjectBrief(snapshot.project, snapshot.brief)) {
        await this.postPromptError(webview, {}, "initialization_required", "Project context changed or is not reviewed. Refresh it in Project Initializer before opening this review.");
        return true;
      }
      const document = resolvePersistedPromptReviewDocument(snapshot.candidate, snapshot.optimizerReview);
      if (!document) {
        await this.postPromptError(webview, {}, "validation", "Generate a current local preview or LLM rewrite before opening it in the editor.");
        return true;
      }
      this.assertWorkspaceOperation(operation.folder, operation.epoch);
      this.showEditorDocument(document);
      return true;
    }
    if (command.type === "prompt.v2.view.set") {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      const candidatePresent = Boolean(snapshot?.candidate && snapshot.optimizerReview);
      const persisted = await this.setOptimizerView(operation.identity.localFingerprint, command.view, candidatePresent);
      const view = command.view === "resolve" && candidatePresent ? "resolve" : persisted;
      await webview.postMessage({ type: "prompt.v2.view.state", view });
      return true;
    }
    if (command.type === "prompt.v2.draft.save") {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      if (!snapshot?.project || !snapshot.brief || !await this.hasCurrentInspectionConsent(snapshot, operation.identity)) {
        await this.postPromptError(webview, {}, "initialization_required", "Initialize and review this project before saving a Prompt Optimizer draft.");
        return true;
      }
      this.assertWorkspaceOperation(operation.folder, operation.epoch);
      await operation.store.updatePartial(this.partial({
        ...snapshot,
        stage: "compose",
        optimizerDraft: command.input,
        optimizerReview: undefined,
        candidate: undefined,
        candidateInput: undefined,
        evaluationMarkdown: undefined,
        feedback: undefined,
      }));
      await this.updateOptimizerSession(operation.identity.localFingerprint, { draft: command.input, candidate: null, review: null, view: "input" });
      await this.setOptimizerView(operation.identity.localFingerprint, "input");
      return true;
    }
    if (command.type === "prompt.v2.record.save") {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      const input = snapshot?.optimizerDraft ?? snapshot?.candidateInput;
      if (!snapshot?.candidate || !snapshot.optimizerReview || !input) {
        await this.postPromptError(webview, command, "validation", "Generate a current local preview or LLM rewrite before saving it to recents.");
        return true;
      }
      const now = new Date().toISOString();
      const review = snapshot.optimizerReview;
      const recent: PromptOptimizerRecent = {
        id: randomUUID(),
        workspaceFingerprint: operation.identity.localFingerprint,
        title: boundedActivityText(review.source === "provider" && review.title ? review.title : input.task || "Prompt result", 96),
        preview: boundedActivityText(snapshot.candidate.text, 180),
        promptType: input.promptType,
        updatedAt: now,
        source: review.source,
        ...(review.source === "provider" ? { provider: review.provider, model: review.model } : {}),
      };
      const scoped = [recent, ...this.optimizerRecents(operation.identity.localFingerprint)].slice(0, PROMPT_OPTIMIZER_RECENT_LIMIT);
      const persisted = await this.updateOptimizerSession(operation.identity.localFingerprint, {
        recents: scoped.map(({ workspaceFingerprint: _workspaceFingerprint, ...item }) => item),
      });
      if (!persisted) {
        await this.postPromptError(webview, command, "storage", "The prompt could not be saved to workspace-scoped recents.");
        return true;
      }
      await this.postOptimizerRecents(webview, operation.identity.localFingerprint);
      await webview.postMessage({ type: "prompt.v2.record.result", requestId: command.requestId, correlationId: command.correlationId, status: "saved", recent });
      return true;
    }

    const operation = await this.workspaceOperation();
    const state = await operation.store.load();
    const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
    if (!snapshot?.project || !snapshot.brief || !await this.hasCurrentInspectionConsent(snapshot, operation.identity)) {
      await this.postPromptError(webview, command, "initialization_required", "Initialize and review this project before using Prompt Optimizer.");
      return true;
    }
    const freshness = await this.currentProjectComparison(snapshot.project, operation);
    if (freshness.changes.length || !canCompileProjectBrief(snapshot.project, snapshot.brief)) {
      await this.postPromptError(webview, command, "initialization_required", "Project context changed or is not reviewed. Refresh it in Project Initializer.");
      return true;
    }
    const selectedModuleIds = DWI_MODULES.filter(({ defaultSelected }) => defaultSelected).map(({ id }) => id);
    const brief = bindBriefForProject(snapshot.project, snapshot.brief);
    const sourcePlan = resolvePromptSourcesV2({
      task: command.input.task,
      template: { id: command.input.assignmentId, label: command.input.assignmentId },
      guidance: selectedModuleIds.map((id) => ({ id, label: id, required: true })),
      project: reviewedProjectSourceContribution(snapshot.project, true),
    });
    if (sourcePlan.blocked) {
      await this.postPromptError(webview, command, "initialization_required", sourcePlan.blockReasons[0] ?? "Prompt sources are not current.");
      return true;
    }
    let localCandidate: DwiCandidate;
    try {
      localCandidate = await this.recompileCandidate(brief, selectedModuleIds, command.input);
    } catch {
      await this.postPromptError(webview, command, "validation", "The selected template is unavailable, changed, or too large for this task.");
      return true;
    }
    if (command.type === "prompt.v2.compile") {
      if (!this.optimizerRequestIsCurrent(command)) {
        await this.postPromptError(webview, command, "stale", "A newer Prompt Optimizer input replaced this local resolve result.");
        return true;
      }
      this.assertWorkspaceOperation(operation.folder, operation.epoch);
      await operation.store.updatePartial(this.partial({
        ...snapshot,
        stage: "evaluate",
        brief,
        selectedModuleIds,
        candidate: localCandidate,
        candidateInput: command.input,
        optimizerDraft: command.input,
        optimizerReview: { source: "local" },
        evaluationMarkdown: undefined,
        feedback: undefined,
      }));
      await this.updateOptimizerSession(operation.identity.localFingerprint, {
        draft: command.input,
        candidate: localCandidate,
        review: { source: "local" },
      });
      await this.setOptimizerView(operation.identity.localFingerprint, "resolve", true);
      const identity = this.optimizerRequestIdentity(command);
      if (!identity) return true;
      await webview.postMessage({ type: "prompt.v2.compiled", correlationId: command.correlationId, ...identity, candidate: localCandidate, sourcePlan });
      this.recordActivity({ level: "info", category: "Prompt", title: "Local prompt preview compiled", detail: "A deterministic preview was created locally; prompt text is excluded from activity and logs." }, webview);
      return true;
    }

    const identity = this.optimizerRequestIdentity(command);
    if (!identity) {
      await this.postPromptError(webview, command, "stale", "A newer Prompt Optimizer input replaced this semantic request.");
      return true;
    }
    const provider = normalizeProviderSettings(this.context.globalState.get(PROVIDER_SETTINGS_KEY, noProviderSettings()));
    const key = await this.context.secrets.get(PROVIDER_SECRET_KEY);
    if (provider.health !== "ready" || !provider.configured || !key) {
      await this.postPromptError(webview, command, "missing_credential", "Configure and verify an LLM provider before rewriting the prompt.");
      return true;
    }
    const controller = new AbortController();
    this.optimizerControllers.set(command.cancellationId, controller);
    await webview.postMessage({ type: "prompt.v2.pending", requestId: command.requestId, correlationId: command.correlationId, cancellationId: command.cancellationId, operation: "enhance" });
    try {
      const emptyDocument = createPromptDocumentV2({
        id: command.documentId,
        now: new Date().toISOString(),
        promptType: command.input.promptType,
        templateId: command.input.assignmentId,
      });
      const { canonicalHash: _canonicalHash, ...documentSource } = emptyDocument;
      const document = finalizePromptDocumentV2({
        ...documentSource,
        revision: identity.revision,
        baseline: localCandidate.text,
        lockedSections: ["constraints", "rules-and-skills"],
      });
      const semanticProvider = provider.mode === "gemini" ? "gemini" : "openai";
      const criticality = command.input.outputSize;
      const complexity = criticality === "auto" ? "medium" : criticality;
      const languages = brief.stack.filter((item) => /^(?:TypeScript|JavaScript|Python|Java|Kotlin|Swift|Go|Rust|C|C\+\+|C#|Ruby|PHP)$/iu.test(item));
      const dependencies = brief.stack.filter((item) => !languages.includes(item));
      const outcome = await executeBoundedSemanticEnhancementV2({
        document,
        provider: semanticProviderPort(provider, key, fetch),
        providerId: semanticProvider,
        model: provider.model!,
        requestId: command.requestId,
        cancellationId: command.cancellationId,
        patchId: `patch-${command.requestId}`,
        now: new Date().toISOString(),
        signal: controller.signal,
        estimationContext: {
          estimationId: `estimate-${randomUUID()}`,
          moduleCount: brief.modules.length,
          languages,
          dependencies,
          taskComplexity: complexity,
          expectedIterations: complexity === "high" ? 4 : complexity === "medium" ? 3 : 2,
          expectedToolCalls: Math.max(1, Math.min(20, brief.modules.length + selectedModuleIds.length)),
          expectedRetries: complexity === "high" ? 2 : 1,
          contextLimitTokens: 32_768,
          criticality,
          requestedProvider: semanticProvider,
          requestedModel: provider.model!,
        },
      });
      if (outcome.status !== "candidate") {
        await this.enqueueMutation(async () => {
          if (!this.optimizerRequestIsCurrent(command)) return;
          await webview.postMessage({
            type: outcome.status === "cancelled" ? "prompt.v2.cancelled" : "prompt.v2.semantic.fallback",
            requestId: command.requestId,
            correlationId: command.correlationId,
            localCandidate,
            sourcePlan,
            trace: outcome.trace,
            failureCode: outcome.failureCode,
            message: outcome.status === "cancelled"
              ? "Prompt rewrite cancelled."
              : "The provider result was rejected. The unchanged local candidate remains available.",
          });
          if (outcome.status !== "cancelled") {
            this.recordActivity({
              level: "error",
              category: "LLM rewrite",
              title: `Provider result rejected · ${outcome.failureCode}`,
              detail: semanticFailureActivityDetail(outcome.diagnostic),
            }, webview);
          }
        });
        return true;
      }
      const optimizedTokens = Math.ceil(new TextEncoder().encode(outcome.compiled.text).byteLength / 4);
      const candidate: DwiCandidate = {
        ...localCandidate,
        text: outcome.compiled.text,
        estimate: {
          ...localCandidate.estimate,
          optimizedTokens,
          estimatedAvoidedDuplication: Math.max(0, localCandidate.estimate.baselineTokens - optimizedTokens),
        },
      };
      await this.enqueueMutation(async () => {
        if (!this.optimizerRequestIsCurrent(command)) {
          await this.postPromptError(webview, command, "stale", "A newer Prompt Optimizer input replaced this provider result.");
          return;
        }
        this.assertWorkspaceOperation(operation.folder, operation.epoch);
        await operation.store.updatePartial(this.partial({
          ...snapshot,
          stage: "evaluate",
          brief,
          selectedModuleIds,
          candidate,
          candidateInput: command.input,
          optimizerDraft: command.input,
          optimizerReview: {
            source: "provider",
            provider: semanticProvider,
            model: provider.model!,
            title: "Validated semantic enhancement",
            summary: "A current hash-bound patch was validated and compiled locally.",
          },
          evaluationMarkdown: undefined,
          feedback: undefined,
        }));
        await this.updateOptimizerSession(operation.identity.localFingerprint, {
          draft: command.input,
          candidate,
          review: {
            source: "provider",
            provider: semanticProvider,
            model: provider.model!,
            title: "Validated semantic enhancement",
            summary: "A current hash-bound patch was validated and compiled locally.",
          },
        });
        await this.setOptimizerView(operation.identity.localFingerprint, "review", true);
        const identity = this.optimizerRequestIdentity(command);
        if (!identity) return;
        await webview.postMessage({
          type: "prompt.v2.semantic.result",
          correlationId: command.correlationId,
          ...identity,
          operation: "enhance",
          localCandidate,
          candidate,
          sourcePlan,
          trace: outcome.trace,
          semantic: {
            provider: semanticProvider,
            model: provider.model!,
            finishReason: outcome.finishReason,
            appliedOperations: outcome.document.semanticPatches.at(-1)?.operations.length ?? 0,
            projection: outcome.projection,
            refinedPrompt: candidate.text,
          },
        });
        this.recordActivity({ level: "info", category: "Prompt", title: "Prompt rewritten", detail: "A verified provider returned a rewrite; prompt text is excluded from activity and logs." }, webview);
      });
    } catch (error) {
      if (controller.signal.aborted) {
        await webview.postMessage({ type: "prompt.v2.cancelled", requestId: command.requestId, correlationId: command.correlationId });
      } else if (error instanceof ProviderRewriteError) {
        const kind = error.health === "invalid-credential" ? "authentication" : error.health === "invalid-model" ? "invalid_model" : error.health === "connectivity" ? "network" : error.health;
        await this.postPromptError(webview, command, kind, error.message, error.health === "connectivity" || error.health === "timeout" || error.health === "rate-limit");
      } else {
        await this.postPromptError(webview, command, "provider", "The provider could not complete this prompt rewrite.", true);
      }
    } finally {
      this.optimizerControllers.delete(command.cancellationId);
    }
    return true;
  }

  private async handle(message: Message, webview: vscode.Webview): Promise<void> {
    if (await this.handleTemplateLibraryMessage(message, webview)) return;
    if (await this.handlePromptOptimizerMessage(message, webview)) return;
    if (message.type === "dwi.document.open") {
      const document = resolveDwiEditorDocument(message);
      if (!document) throw new Error("The Prompt Optimizer editor-document request is invalid.");
      this.showEditorDocument(document);
      return;
    }
    if (message.type === "dwi.activity.open-log") {
      const document = resolveDwiEditorDocument({
        type: "dwi.document.open",
        document: { kind: "activity-log", entries: this.activityEntries },
      });
      if (document) this.showEditorDocument(document);
      return;
    }
    if (message.type === "dwi.provider.get") { await webview.postMessage({ type: "dwi.provider.state", settings: normalizeProviderSettings(this.context.globalState.get(PROVIDER_SETTINGS_KEY, noProviderSettings())) }); return; }
    if (message.type === "dwi.provider.save") {
      try {
        const input = message.settings as ProviderSettingsInput;
        const settings = validateProviderSettings(input);
        const existing = normalizeProviderSettings(this.context.globalState.get(PROVIDER_SETTINGS_KEY, noProviderSettings()));
        const target = providerTarget(settings);
        let existingTarget: string | undefined;
        try { existingTarget = existing.mode === "none" ? undefined : providerTarget(existing); } catch { existingTarget = undefined; }
        const suppliedKey = input.key?.trim() ?? "";
        const usesStoredKey = !suppliedKey;
        if (usesStoredKey && (!existingTarget || existing.mode !== settings.mode || existingTarget !== target)) {
          await webview.postMessage({ type: "dwi.provider.error", message: "Enter a new API key when changing provider or endpoint; the stored key was not sent." });
          return;
        }
        if (usesStoredKey) {
          const choice = await vscode.window.showWarningMessage("Use the stored provider credential for this connection check?", { modal: true, detail: `Prompt Optimizer will send it only to the previously approved provider target ${target}.` }, "Use stored credential");
          if (choice !== "Use stored credential") return;
        } else if (existingTarget && existingTarget !== target) {
          const choice = await vscode.window.showWarningMessage("Change the provider credential destination?", { modal: true, detail: `The new credential will be checked against ${target}.` }, "Continue");
          if (choice !== "Continue") return;
        }
        const key = suppliedKey || await this.context.secrets.get(PROVIDER_SECRET_KEY);
        if (!key) {
          await webview.postMessage({ type: "dwi.provider.check-failed", health: "missing", message: "Enter an API key before checking the provider." });
          return;
        }
        await webview.postMessage({ type: "dwi.provider.checking", settings: { ...settings, health: "checking", configured: false } });
        const check = input.mode === "gemini"
          ? await checkGeminiProvider(settings.model!, key)
          : await checkOpenAICompatibleProvider(settings.model!, settings.baseUrl!, key);
        if (!check.ok) {
          await webview.postMessage({ type: "dwi.provider.check-failed", health: check.health, message: check.message });
          return;
        }
        if (typeof input.key === "string" && input.key.trim()) await this.context.secrets.store(PROVIDER_SECRET_KEY, input.key.trim());
        const saved = { ...settings, configured: true, health: "ready" as const, checkedAt: check.checkedAt, errorMessage: undefined };
        await this.context.globalState.update(PROVIDER_SETTINGS_KEY, saved);
        await webview.postMessage({ type: "dwi.provider.saved", settings: saved });
        this.recordActivity({
          level: "info",
          category: "Provider",
          title: "Provider settings saved",
          detail: "Provider credentials are excluded from activity and logs.",
        }, webview);
      } catch (error) {
        await webview.postMessage({ type: "dwi.provider.error", message: error instanceof Error ? error.message : "Provider settings could not be saved." });
        this.recordActivity({
          level: "error",
          category: "Provider",
          title: "Provider settings were not saved",
          detail: "Check the entered configuration and try again.",
        }, webview);
      }
      return;
    }
    if (message.type === "dwi.provider.clear") {
      await this.context.secrets.delete(PROVIDER_SECRET_KEY);
      const settings = noProviderSettings();
      await this.context.globalState.update(PROVIDER_SETTINGS_KEY, settings);
      await webview.postMessage({ type: "dwi.provider.saved", settings });
      this.recordActivity({
        level: "info",
        category: "Provider",
        title: "Provider settings cleared",
        detail: "Stored provider credentials and configuration were removed.",
      }, webview);
      return;
    }
    if (message.type === "dwi.session.open") {
      const epoch = this.rootEpoch;
      const roots = vscode.workspace.workspaceFolders ?? [];
      await this.replayActivity(webview);
      await webview.postMessage({ type: "dwi.provider.state", settings: normalizeProviderSettings(this.context.globalState.get(PROVIDER_SETTINGS_KEY, noProviderSettings())) });
      try {
        await this.postTemplateLibrary(webview, { type: "dwi.library.state", state: await this.templateLibrary.open() });
      } catch (error) {
        await this.postTemplateLibraryError(webview, error);
      }
      if (epoch !== this.rootEpoch) return;
      if (!roots.length) {
        await webview.postMessage({ type: "dwi.session.generic", reason: "no-workspace" });
        return;
      }
      if (roots.length > 1 && !this.selectedRootUri) {
        await webview.postMessage({
          type: "dwi.workspace.choose-root",
          roots: roots.map((root) => ({
            uri: root.uri.toString(),
            label: root.name,
            fingerprint: workspaceIdentity(root.uri.toString(), root.name).localFingerprint,
          })),
        });
        return;
      }
      try {
        const operation = await this.workspaceOperation();
        const state = await operation.store.load();
        const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
        await this.migrateOptimizerSession(operation.identity.localFingerprint, snapshot);
        await this.postOptimizerRecents(webview, operation.identity.localFingerprint);
        await this.postOptimizerView(webview, operation.identity.localFingerprint, (state.status === "partial" || state.status === "complete") && Boolean(state.snapshot.candidate));
        this.assertWorkspaceOperation(operation.folder, operation.epoch);
        if (
          (state.status === "partial" || state.status === "complete") &&
          !await this.hasCurrentInspectionConsent(state.snapshot, operation.identity)
        ) {
          await this.postWorkspaceMessage(webview, operation, {
            type: "dwi.consent.required",
            message: "The bounded inspection policy changed or local consent is unavailable. Review and approve the current scope before scanning again.",
          });
          await this.postProjectOnboarding(webview, operation);
          return;
        }
        await this.postWorkspaceMessage(webview, operation, { type: `dwi.snapshot.${state.status}`, ...state });
        const optimizerSession = this.optimizerSessions.open(operation.identity.localFingerprint);
        if (optimizerSession.status === "ready" && this.optimizerSessionMatchesSnapshot(optimizerSession.session, snapshot)) {
          await webview.postMessage({
            type: "prompt.v2.session.state",
            draft: optimizerSession.session.draft,
            candidate: optimizerSession.session.candidate,
            review: optimizerSession.session.review,
            view: optimizerSession.session.view,
          });
        }
        if ((state.status === "partial" || state.status === "complete") && state.snapshot.project) {
          await this.postProjectSnapshot(webview, state.snapshot.project, operation);
        } else {
          await this.postProjectOnboarding(webview, operation);
        }
      } catch (error) {
        if (error instanceof WorkspaceSelectionChangedError) return;
        await webview.postMessage({ type: "dwi.session.generic", reason: "context-invalid" });
        this.recordActivity({
          level: "error",
          category: "Workspace",
          title: "Workspace session could not open",
          detail: "Select an available workspace root and retry.",
        }, webview);
      }
      return;
    }
    if (message.type === "dwi.session.open-folder") {
      try {
        await vscode.commands.executeCommand("workbench.view.explorer");
        const folders = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, canSelectMany: false, openLabel: "Open Folder" });
        if (!folders?.[0]) {
          await webview.postMessage({ type: "dwi.open-folder.result", ok: false, reason: "open-folder-cancelled" });
          return;
        }
        await vscode.commands.executeCommand("vscode.openFolder", folders[0], false);
        await webview.postMessage({ type: "dwi.open-folder.result", ok: true });
      } catch {
        await webview.postMessage({ type: "dwi.open-folder.result", ok: false, reason: "open-folder-failed" });
      }
      return;
    }
    if (message.type === "dwi.workspace.select-root") { const root = selectWorkspaceRoot((vscode.workspace.workspaceFolders ?? []).map((folder) => ({ uri: folder.uri.toString(), folder })), String(message.uri ?? "")); if (!root) { await webview.postMessage({ type: "dwi.session.generic", reason: "context-invalid" }); return; } this.rootEpoch += 1; this.selectedRootUri = root.uri; await this.handle({ type: "dwi.session.open" }, webview); return; }
    if (message.type === "dwi.consent.approve") {
      try {
        const operation = await this.workspaceOperation();
        const { folder, epoch, identity, store } = operation;
        if (!this.consumeConsentCapability(webview, String(message.consentCapability ?? ""), operation)) {
          await this.postWorkspaceMessage(webview, operation, { type: "dwi.consent.required", message: "This approval expired. Review the bounded inspection scope and approve it again." });
          return;
        }
        const approved = await this.confirmations.approveInspection(folder.name);
        this.assertWorkspaceOperation(folder, epoch);
        if (!approved) {
          await this.postWorkspaceMessage(webview, operation, { type: "dwi.consent.required", message: "The project check was not started. Approve the bounded scope when you are ready." });
          return;
        }
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.consent.loading" });
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.scanning", message: "Reading the project details you allowed…" });
        const receipt = currentInspectionConsent(identity.localFingerprint);
        const { project, brief } = await scanApprovedWorkspace(folder, identity);
        this.assertWorkspaceOperation(folder, epoch);
        const initial = await store.begin(receipt);
        this.assertWorkspaceOperation(folder, epoch);
        await store.updatePartial(this.partial({ ...initial, stage: "brief", project, brief }));
        this.assertWorkspaceOperation(folder, epoch);
        await this.recordInspectionConsent(receipt);
        this.assertWorkspaceOperation(folder, epoch);
        await this.postProjectSnapshot(webview, project, operation, true);
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.brief.ready", brief });
        this.recordActivity({
          level: "info",
          category: "Project",
          title: "Project check complete",
          detail: "Prompt Optimizer read only the bounded local evidence covered by your approval.",
        }, webview);
      } catch (error) {
        if (error instanceof WorkspaceSelectionChangedError) return;
        await webview.postMessage({ type: "dwi.project.error", message: error instanceof Error ? error.message : "Prompt Optimizer could not inspect this workspace." });
        await webview.postMessage({ type: "dwi.error", code: "initialization-failed", message: error instanceof Error ? error.message : "Prompt Optimizer could not initialize this workspace." });
        this.recordActivity({
          level: "error",
          category: "Project",
          title: "Project inspection failed",
          detail: "The bounded local project check could not be initialized.",
        }, webview);
      }
      return;
    }
    if (message.type === "dwi.snapshot.partial") {
      const data = message.snapshot as Partial<DwiWorkspaceSnapshot>;
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const previous = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      if (!previous || !await this.hasCurrentInspectionConsent(previous, operation.identity)) {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.consent.required", message: "Approve the current inspection scope before saving project workflow state." });
        return;
      }
      const incomingBrief = data.brief;
      const brief = previous.project
        ? bindBriefForProject(previous.project, incomingBrief ?? previous.brief)
        : previous.brief;
      const stage = ["consent", "brief", "compose", "evaluate"].includes(String(data.stage)) ? data.stage : previous.stage;
      const keepCandidate = stage === "evaluate" ? previous.candidate : undefined;
      this.assertWorkspaceOperation(operation.folder, operation.epoch);
      await operation.store.updatePartial(this.partial({ ...previous, stage, brief, selectedModuleIds: data.selectedModuleIds, candidate: keepCandidate, project: previous.project }));
      return;
    }
    if (message.type === "dwi.brief.confirm") {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      if (!snapshot?.project || !snapshot.brief || !await this.hasCurrentInspectionConsent(snapshot, operation.identity)) {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.consent.required", message: "Allow the local project check before confirming this brief." });
        return;
      }
      const freshness = await this.currentProjectComparison(snapshot.project, operation);
      if (freshness.changes.length) {
        await this.replaceWithFreshProject(operation.store, snapshot, freshness.fresh, freshness.brief, operation);
        await this.postProjectSnapshot(webview, freshness.fresh, operation, true);
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.brief.ready", brief: { ...freshness.brief, confirmed: false, corrections: "" } });
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "project-stale", message: "The project changed. Review the updated details before continuing." });
        return;
      }
      if (!hasApprovedProjectReview(snapshot.project)) {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "review-required", message: "Review and approve the project details before confirming this brief." });
        return;
      }
      if (!canConfirmProjectBrief(snapshot.project)) {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "project-details-required", message: "Resolve conflicting or unsupported project details before continuing." });
        return;
      }
      const requested = message.brief && typeof message.brief === "object"
        ? message.brief as Partial<DwiBrief>
        : {};
      const updated = confirmWorkspaceBrief(snapshot, {
        confirmed: requested.confirmed === true,
        corrections: typeof requested.corrections === "string" ? requested.corrections : snapshot.brief.corrections,
      });
      this.assertWorkspaceOperation(operation.folder, operation.epoch);
      await operation.store.updatePartial(this.partial(updated));
      await this.invalidateOptimizerRecovery(operation.identity.localFingerprint);
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.brief.confirmed", brief: updated.brief });
      this.recordActivity({
        level: "info",
        category: "Brief",
        title: "Project brief confirmed",
        detail: "The confirmed brief is bound to the currently approved project snapshot.",
      }, webview);
      return;
    }
    if (message.type === "dwi.snapshot.reset") {
      const operation = await this.workspaceOperation();
      await operation.store.reset();
      await this.resetOptimizerSession(operation.identity.localFingerprint);
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.snapshot.absent" });
      await this.postProjectOnboarding(webview, operation);
      this.recordActivity({
        level: "info",
        category: "Workflow",
        title: "Workflow reset",
        detail: "Local workflow state was cleared after confirmation.",
      }, webview);
      return;
    }
    if (message.type === "dwi.project.refresh") { await this.refreshProject(webview); return; }
    if (message.type === "dwi.project.review") { await this.reviewProject(webview); return; }
    if (message.type === "dwi.project.open-declaration") { await this.openProjectDeclaration(webview); return; }
    if (message.type === "dwi.project.use-context") { await this.useProjectContext(webview); return; }
    if (message.type === "dwi.feedback.record") {
      const raw = message.feedback as Omit<DwiFeedback,"id"|"createdAt">;
      const event = createFeedback(raw);
      await webview.postMessage({ type: "dwi.feedback.saved", count: 1, feedback: event });
      this.recordActivity({
        level: "info",
        category: "Evaluation",
        title: "Evaluation saved",
        detail: "The evaluation was recorded locally without including its contents in activity.",
      }, webview);
      return;
    }
    if (message.type === "dwi.feedback.delete") {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      if (state.status === "complete") {
        this.assertWorkspaceOperation(operation.folder, operation.epoch);
        await operation.store.complete({ ...state.snapshot, evaluationMarkdown: "", feedback: undefined });
      }
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.feedback.deleted" });
      this.recordActivity({
        level: "info",
        category: "Evaluation",
        title: "Evaluation removed",
        detail: "The saved local evaluation was cleared.",
      }, webview);
      return;
    }
    if (message.type === "dwi.journey.complete") {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const previous = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      if (!previous || !await this.hasCurrentInspectionConsent(previous, operation.identity)) {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.consent.required", message: "Approve the current inspection scope before completing this workflow." });
        return;
      }
      if (!previous.project || !previous.brief || !previous.candidate) {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "candidate-missing", message: "Compile a current, reviewed candidate before recording an evaluation." });
        return;
      }
      if (!canCompileProjectBrief(previous.project, previous.brief)) {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "review-required", message: "Review the project and confirm its brief before saving an evaluation." });
        return;
      }
      const freshness = await this.currentProjectComparison(previous.project, operation);
      if (freshness.changes.length) {
        await this.postStaleProject(webview, previous.project, freshness.changes, operation);
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "project-stale", message: "Project evidence changed. Refresh and review before recording this evaluation." });
        return;
      }
      const brief = bindBriefForProject(previous.project, previous.brief);
      let candidate: DwiCandidate;
      try {
        candidate = await this.recompileCandidate(brief, previous.candidate.selectedModuleIds, previous.candidateInput);
      } catch {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "candidate-invalid", message: "The prompt assignment changed or is no longer available. Recompile the prompt before recording an evaluation." });
        return;
      }
      if (JSON.stringify(candidate) !== JSON.stringify(previous.candidate)) {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "candidate-invalid", message: "The saved candidate is not bound to the current project brief. Recompile it." });
        return;
      }
      const rawFeedback = message.feedback as Omit<DwiFeedback,"id"|"createdAt">;
      const feedback = createFeedback({ ...rawFeedback, selectedModuleIds: candidate.selectedModuleIds, estimate: candidate.estimate });
      const snapshot: DwiWorkspaceSnapshot = {
        ...previous,
        brief,
        candidate,
        status: "complete",
        stage: "evaluate",
        evaluationMarkdown: evaluationMarkdown(feedback, brief),
        feedback,
      };
      this.assertWorkspaceOperation(operation.folder, operation.epoch);
      await operation.store.complete(snapshot);
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.journey.completed", snapshot });
      this.recordActivity({
        level: "info",
        category: "Evaluation",
        title: "Evaluation saved",
        detail: "The human-gated evaluation was recorded locally without including its contents in activity.",
      }, webview);
      return;
    }
    if (message.type === "dwi.evaluation.export") {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      if (!snapshot?.project || !snapshot.brief || !snapshot.candidate || !await this.hasCurrentInspectionConsent(snapshot, operation.identity)) throw new Error("Compile a consented candidate before exporting its evaluation.");
      if (!canCompileProjectBrief(snapshot.project, snapshot.brief)) throw new Error("Review the project and confirm its brief before exporting its evaluation.");
      const freshness = await this.currentProjectComparison(snapshot.project, operation);
      if (freshness.changes.length) throw new Error("Project evidence changed. Refresh and recompile before exporting the evaluation.");
      const brief = bindBriefForProject(snapshot.project, snapshot.brief);
      const candidate = await this.recompileCandidate(brief, snapshot.candidate.selectedModuleIds, snapshot.candidateInput);
      if (JSON.stringify(candidate) !== JSON.stringify(snapshot.candidate)) throw new Error("The saved candidate is not bound to the current project brief. Recompile it.");
      const rawFeedback = message.feedback as Omit<DwiFeedback,"id"|"createdAt">;
      const feedback = createFeedback({ ...rawFeedback, selectedModuleIds: candidate.selectedModuleIds, estimate: candidate.estimate });
      const target = await vscode.window.showSaveDialog({ filters: { Markdown: ["md"] }, saveLabel: "Export human-gated evaluation draft" });
      if (target) {
        this.assertWorkspaceOperation(operation.folder, operation.epoch);
        await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(evaluationMarkdown(feedback, brief)));
        this.recordActivity({
          level: "info",
          category: "Export",
          title: "Evaluation exported",
          detail: "The selected Markdown file was written successfully.",
        }, webview);
      }
      return;
    }
    if (message.type === "dwi.candidate.compile") {
      const request = parsePromptCompileRequest(message);
      if (!request) {
        await webview.postMessage({ type: "dwi.error", code: "candidate-invalid", message: "Review the task, assignment, output size, and content choices before creating the prompt." });
        this.recordActivity({
          level: "warning",
          category: "Prompt",
          title: "Prompt input was rejected",
          detail: "The extension host rejected an invalid prompt composition request without compiling its contents.",
        }, webview);
        return;
      }
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      if (!snapshot?.project || !snapshot.brief || !await this.hasCurrentInspectionConsent(snapshot, operation.identity)) {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.consent.required", message: "Approve the current inspection scope before compiling project-aware context." });
        return;
      }
      const freshness = await this.currentProjectComparison(snapshot.project, operation);
      if (freshness.changes.length) {
        await this.postStaleProject(webview, snapshot.project, freshness.changes, operation);
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "project-stale", message: "Project evidence changed. Refresh and review before compiling." });
        return;
      }
      if (!canCompileProjectBrief(snapshot.project, snapshot.brief)) {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "review-required", message: "Review the project and confirm its brief before creating the prompt." });
        return;
      }
      const brief = bindBriefForProject(snapshot.project, snapshot.brief);
      let candidate: DwiCandidate;
      try {
        candidate = await this.recompileCandidate(brief, request.selectedModuleIds, request);
      } catch {
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.error", code: "candidate-invalid", message: "The selected prompt assignment is unavailable, changed, or too large for this task." });
        return;
      }
      this.assertWorkspaceOperation(operation.folder, operation.epoch);
      await operation.store.updatePartial(this.partial({
        ...snapshot,
        stage: "evaluate",
        brief,
        selectedModuleIds: candidate.selectedModuleIds,
        candidate,
        candidateInput: {
          task: request.task,
          assignmentId: request.assignmentId,
          promptType: request.promptType,
          outputSize: request.outputSize,
        },
        optimizerDraft: {
          task: request.task,
          assignmentId: request.assignmentId,
          promptType: request.promptType,
          outputSize: request.outputSize,
        },
        optimizerReview: { source: "local" },
      }));
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.candidate.ready", candidate });
      this.recordActivity({
        level: "info",
        category: "Prompt",
        title: "Local prompt preview compiled",
        detail: "A deterministic preview was created locally; prompt text is excluded from activity and logs.",
      }, webview);
      return;
    }
  }

  private showEditorDocument(document: ResolvedDwiEditorDocument): void {
    let panel = this.editorDocumentPanel;
    if (!panel) {
      panel = vscode.window.createWebviewPanel(
        "dwi.editorDocument",
        document.title,
        vscode.ViewColumn.Active,
        { enableScripts: false, enableFindWidget: true, retainContextWhenHidden: true },
      );
      this.editorDocumentPanel = panel;
      panel.onDidDispose(() => {
        if (this.editorDocumentPanel === panel) this.editorDocumentPanel = undefined;
      });
    } else {
      panel.title = document.title;
      panel.reveal(vscode.ViewColumn.Active, false);
    }
    panel.webview.html = document.html;
  }

  private async recompileCandidate(
    brief: DwiBrief,
    selectedModuleIds: readonly string[],
    input?: PromptComposeInput,
  ): Promise<DwiCandidate> {
    if (!input) return compileDwiCandidate(brief, selectedModuleIds);
    const template = await this.templateLibrary.resolve(input.assignmentId);
    if (!template || template.promptType !== input.promptType) throw new Error("The prompt assignment is unavailable or changed.");
    return compileDwiCandidate(brief, selectedModuleIds, {
      task: input.task,
      promptType: template.promptType,
      template,
      outputSize: input.outputSize,
    });
  }

  private async postWorkspaceMessage(
    webview: vscode.Webview,
    operation: WorkspaceOperation,
    message: unknown,
  ): Promise<void> {
    const safeMessage = message && typeof message === "object" && "type" in message && (message as { type?: unknown }).type === "dwi.consent.required"
      ? { ...(message as Record<string, unknown>), consentCapability: this.issueConsentCapability(webview, operation) }
      : message;
    await runWhileWorkspaceCurrent(
      () => this.assertWorkspaceOperation(operation.folder, operation.epoch),
      async () => { await webview.postMessage(safeMessage); },
    );
    this.recordActivityForHostMessage(safeMessage, webview);
  }

  private async postProjectOnboarding(webview: vscode.Webview, operation: WorkspaceOperation): Promise<void> {
    await this.postWorkspaceMessage(webview, operation, {
      type: "dwi.project.snapshot",
      consentCapability: this.issueConsentCapability(webview, operation),
      snapshot: {
        status: "unsupported",
        projectName: operation.folder.name,
        coverage: { percent: 0, complete: 0, total: 5, label: "Inspection approval required" },
        conflictCount: 0,
        pendingChanges: 0,
        sections: [],
        message: "Allow the local project check to create the first project summary.",
      },
    });
  }

  private async postProjectSnapshot(webview: vscode.Webview, project: DwiProjectSnapshot, operation: WorkspaceOperation, verifiedFresh = false): Promise<void> {
    if (verifiedFresh) {
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.snapshot", snapshot: project });
      return;
    }
    try {
      const { changes } = await this.currentProjectComparison(project, operation);
      if (changes.length) {
        await this.postStaleProject(webview, project, changes, operation);
        return;
      }
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.snapshot", snapshot: project });
    } catch (error) {
      if (error instanceof WorkspaceSelectionChangedError) throw error;
      await this.postStaleProject(webview, project, ["bounded evidence freshness could not be verified"], operation);
    }
  }

  private async postStaleProject(webview: vscode.Webview, project: DwiProjectSnapshot, changes: readonly string[], operation: WorkspaceOperation): Promise<void> {
    await this.postWorkspaceMessage(webview, operation, {
      type: "dwi.project.snapshot",
      snapshot: { ...project, status: "stale", message: `Project state changed: ${changes.join("; ")}.` },
    });
  }

  private async currentProjectComparison(project: DwiProjectSnapshot, bound?: WorkspaceOperation): Promise<{ fresh: DwiProjectSnapshot; brief: DwiBrief; changes: string[] }> {
    const operation = bound ?? await this.workspaceOperation();
    this.assertWorkspaceOperation(operation.folder, operation.epoch);
    const { project: fresh, brief } = await scanApprovedWorkspace(operation.folder, operation.identity);
    this.assertWorkspaceOperation(operation.folder, operation.epoch);
    const changes = gitRevisionChanges(project.metadata.revision, {
      branch: fresh.metadata.revision.branch ?? null,
      commit: fresh.metadata.revision.commit ?? null,
      dirty: fresh.metadata.revision.dirty ?? null,
    });
    if (project.metadata.id !== fresh.metadata.id) changes.push("project identity changed");
    if (project.metadata.revision.evidenceDigest !== fresh.metadata.revision.evidenceDigest) changes.push("bounded evidence content changed");
    if (project.resolution.effectiveSnapshotHash !== fresh.resolution.effectiveSnapshotHash) changes.push("resolved project metadata changed");
    return { fresh, brief, changes: [...new Set(changes)] };
  }

  private canUseProjectContext(project: DwiProjectSnapshot): boolean {
    return hasApprovedProjectReview(project)
      && project.resolution.status === "current"
      && project.resolution.conflicts.length === 0
      && !project.resolution.unknowns.some(({ required }) => required);
  }

  private async replaceWithFreshProject(
    store: DwiWorkspaceSnapshotStore<vscode.Uri>,
    previous: DwiWorkspaceSnapshot,
    project: DwiProjectSnapshot,
    brief = projectSnapshotToBrief(project),
    operation?: WorkspaceOperation,
  ): Promise<void> {
    if (operation) this.assertWorkspaceOperation(operation.folder, operation.epoch);
    await store.updatePartial(this.partial({
      ...previous,
      stage: "brief",
      project,
      brief: { ...brief, confirmed: false, corrections: "" },
      candidate: undefined,
      candidateInput: undefined,
      optimizerDraft: previous.optimizerDraft,
      optimizerReview: undefined,
      evaluationMarkdown: undefined,
      feedback: undefined,
    }));
    if (operation) {
      await this.invalidateOptimizerRecovery(operation.identity.localFingerprint);
      this.assertWorkspaceOperation(operation.folder, operation.epoch);
    }
  }

  private async refreshProject(webview: vscode.Webview): Promise<void> {
    const operation = await this.workspaceOperation();
    const { folder, epoch, identity, store } = operation;
    const state = await store.load();
    if (state.status !== "partial" && state.status !== "complete") {
      await this.postProjectOnboarding(webview, operation);
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: "Project inspection needs approval in Prompt workflow first." });
      return;
    }
    if (!await this.hasCurrentInspectionConsent(state.snapshot, operation.identity)) {
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.consent.required", message: "Approve the current bounded inspection scope before refreshing." });
      return;
    }
    await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.scanning", message: "Refreshing bounded project evidence…" });
    try {
      const { project, brief } = await scanApprovedWorkspace(folder, identity);
      this.assertWorkspaceOperation(folder, epoch);
      await this.replaceWithFreshProject(store, state.snapshot, project, brief, operation);
      this.assertWorkspaceOperation(folder, epoch);
      await this.postProjectSnapshot(webview, project, operation, true);
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.brief.ready", brief: { ...brief, confirmed: false, corrections: "" } });
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: `Project details refreshed from ${project.evidence.length} local sources.` });
      this.recordActivity({
        level: "info",
        category: "Project",
        title: "Project details refreshed",
        detail: "The bounded local evidence was checked again and downstream drafts were cleared.",
      }, webview);
    } catch (error) {
      if (error instanceof WorkspaceSelectionChangedError) return;
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.error", message: error instanceof Error ? error.message : "The project scan failed." });
    }
  }

  private async reviewProject(webview: vscode.Webview): Promise<void> {
    const operation = await this.workspaceOperation();
    const { store } = operation;
    const state = await store.load();
    if ((state.status !== "partial" && state.status !== "complete") || !state.snapshot.project) {
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: "Check the project before reviewing it." });
      return;
    }
    if (!await this.hasCurrentInspectionConsent(state.snapshot, operation.identity)) {
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.consent.required", message: "Approve the current bounded inspection scope before reviewing." });
      return;
    }
    const project = state.snapshot.project;
    const preflight = await this.currentProjectComparison(project, operation);
    if (preflight.changes.length) {
      await this.replaceWithFreshProject(store, state.snapshot, preflight.fresh, preflight.brief, operation);
      await this.postProjectSnapshot(webview, preflight.fresh, operation, true);
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.brief.ready", brief: { ...preflight.brief, confirmed: false, corrections: "" } });
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: "The project changed while review was opening. Review the updated details." });
      this.recordActivity({
        level: "warning",
        category: "Review",
        title: "Review restarted",
        detail: "Project evidence changed before approval, so the current snapshot was refreshed.",
      }, webview);
      return;
    }
    const choice = await this.confirmations.reviewProject(project);
    this.assertWorkspaceOperation(operation.folder, operation.epoch);
    if (choice === "export") {
      await this.exportProjectSnapshot();
      return;
    }
    if (choice !== "approve") {
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: "Project details remain unreviewed." });
      return;
    }
    const finalCheck = await this.currentProjectComparison(project, operation);
    if (finalCheck.changes.length) {
      await this.replaceWithFreshProject(store, state.snapshot, finalCheck.fresh, finalCheck.brief, operation);
      await this.postProjectSnapshot(webview, finalCheck.fresh, operation, true);
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.brief.ready", brief: { ...finalCheck.brief, confirmed: false, corrections: "" } });
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: "The project changed during review. Nothing was approved; review the updated details." });
      this.recordActivity({
        level: "warning",
        category: "Review",
        title: "Approval was not recorded",
        detail: "Project evidence changed during review, so the current snapshot was refreshed.",
      }, webview);
      return;
    }
    const { resolution, ...source } = project;
    const reviewedAt = new Date().toISOString();
    const approved = resolveProjectSnapshot(
      {
        ...source,
        metadata: {
          ...source.metadata,
          review: { state: "approved", reviewedAt, reviewedBy: "local-vscode-user" },
        },
      },
      { unknowns: resolution.unknowns, coverageOverrides: resolution.coverage },
    );
    const approvedBrief = { ...projectSnapshotToBrief(approved), confirmed: false, corrections: "" };
    const updated = this.partial({ ...state.snapshot, stage: "brief", project: approved, brief: approvedBrief, candidate: undefined, candidateInput: undefined, optimizerDraft: state.snapshot.optimizerDraft, optimizerReview: undefined, evaluationMarkdown: undefined, feedback: undefined });
    this.assertWorkspaceOperation(operation.folder, operation.epoch);
    await store.updatePartial(updated);
    await this.invalidateOptimizerRecovery(operation.identity.localFingerprint);
    this.assertWorkspaceOperation(operation.folder, operation.epoch);
    await this.postProjectSnapshot(webview, approved, operation, true);
    await this.postWorkspaceMessage(webview, operation, { type: "dwi.brief.ready", brief: approvedBrief });
    await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: "Project review saved locally. Open questions remain visible." });
    this.recordActivity({
      level: "info",
      category: "Review",
      title: "Project review approved",
      detail: "Approval was bound to the exact current local snapshot.",
    }, webview);
  }

  private async openProjectDeclaration(webview: vscode.Webview): Promise<void> {
    const operation = await this.workspaceOperation();
    const { folder, epoch } = operation;
    const directory = vscode.Uri.joinPath(folder.uri, ".dwi");
    const target = vscode.Uri.joinPath(directory, "project.yaml");
    const existing = await boundedWorkspaceTextAt(folder.uri, [".dwi", "project.yaml"], MAX_DECLARATION_BYTES);
    if (existing.status === "invalid") {
      throw new Error(`Prompt Optimizer refuses to open a declaration that is ${existing.reason.replaceAll("-", " ")}.`);
    }
    if (existing.status === "absent") {
      try {
        const stat = await vscode.workspace.fs.stat(directory);
        if ((stat.type & vscode.FileType.SymbolicLink) || !(stat.type & vscode.FileType.Directory)) throw new Error("The .dwi path is not a safe directory.");
      } catch (error) {
        if (!isMissingFile(error)) throw error;
        this.assertWorkspaceOperation(folder, epoch);
        await vscode.workspace.fs.createDirectory(directory);
      }
      this.assertWorkspaceOperation(folder, epoch);
      const directoryStat = await vscode.workspace.fs.stat(directory);
      if ((directoryStat.type & vscode.FileType.SymbolicLink) || !(directoryStat.type & vscode.FileType.Directory)) {
        throw new Error("The .dwi path changed and is no longer a safe directory.");
      }
      const template = projectDeclarationTemplate(folder.name);
      const staging = vscode.Uri.joinPath(directory, `.project.yaml.staging-${randomUUID()}`);
      await createProjectDeclarationExclusively(
        {
          writeFile: async (uri, content) => vscode.workspace.fs.writeFile(uri, content),
          renameWithoutOverwrite: async (from, to) => vscode.workspace.fs.rename(from, to, { overwrite: false }),
          delete: async (uri) => vscode.workspace.fs.delete(uri, { recursive: false, useTrash: false }),
        },
        staging,
        target,
        new TextEncoder().encode(template),
        () => this.assertWorkspaceOperation(folder, epoch),
      );
    }
    this.assertWorkspaceOperation(folder, epoch);
    const finalDeclaration = await boundedWorkspaceTextAt(folder.uri, [".dwi", "project.yaml"], MAX_DECLARATION_BYTES);
    if (finalDeclaration.status !== "value") {
      throw new Error("The project declaration changed before Prompt Optimizer could open it; retry.");
    }
    const document = await vscode.workspace.openTextDocument(target);
    this.assertWorkspaceOperation(folder, epoch);
    await vscode.window.showTextDocument(document, { preview: false });
    await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: "Add the missing project details, save the file, then choose Check again." });
    this.recordActivity({
      level: "info",
      category: "Project",
      title: "Project declaration opened",
      detail: "The local .dwi/project.yaml declaration is ready to edit.",
    }, webview);
  }

  private async useProjectContext(webview: vscode.Webview): Promise<void> {
    const operation = await this.workspaceOperation();
    const state = await operation.store.load();
    const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
    const project = snapshot?.project;
    if (!snapshot || !await this.hasCurrentInspectionConsent(snapshot, operation.identity)) {
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.consent.required", message: "Approve the current bounded inspection scope before using project context." });
      return;
    }
    if (project) {
      const freshness = await this.currentProjectComparison(project, operation);
      if (freshness.changes.length) {
        await this.postStaleProject(webview, project, freshness.changes, operation);
        await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: "Project evidence changed after this snapshot. Refresh and review it before using AI context." });
        return;
      }
    }
    if (!project || !this.canUseProjectContext(project)) {
      await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: "Approve the snapshot and resolve required gaps or conflicts before using it as AI context." });
      return;
    }
    const context = briefDigest(projectSnapshotToBrief(project));
    this.assertWorkspaceOperation(operation.folder, operation.epoch);
    await vscode.env.clipboard.writeText(context);
    await this.postWorkspaceMessage(webview, operation, { type: "dwi.project.action", message: "Approved bounded project context copied to the OS clipboard. No provider or network request was made." });
    this.recordActivity({
      level: "info",
      category: "Project",
      title: "Approved context copied",
      detail: "Project context was copied locally; its contents are excluded from activity and logs.",
    }, webview);
  }

  async exportProjectSnapshot(): Promise<void> {
    try {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      const project = snapshot?.project;
      if (!project) throw new Error("Create a project snapshot before exporting it.");
      if (!snapshot || !await this.hasCurrentInspectionConsent(snapshot, operation.identity)) throw new Error("Approve the current bounded inspection scope before exporting.");
      const freshness = await this.currentProjectComparison(project, operation);
      if (freshness.changes.length) throw new Error("Project evidence changed. Refresh and review the snapshot before exporting it.");
      const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(operation.folder.uri, "dwi-project-snapshot.json"), filters: { JSON: ["json"] }, saveLabel: "Export Prompt Optimizer project snapshot" });
      if (target) {
        const finalCheck = await this.currentProjectComparison(project, operation);
        if (finalCheck.changes.length) throw new Error("Project evidence changed while choosing the export location. Refresh and retry.");
        await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(`${JSON.stringify(project, null, 2)}\n`));
        this.recordActivity({
          level: "info",
          category: "Export",
          title: "Project details exported",
          detail: "The selected JSON file was written successfully; its contents are excluded from activity.",
        });
      }
    } catch (error) {
      if (error instanceof WorkspaceSelectionChangedError) return;
      this.recordActivity({
        level: "error",
        category: "Export",
        title: "Project details were not exported",
        detail: "Review the current project state and try again.",
      });
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : "Prompt Optimizer project snapshot could not be exported.");
    }
  }

  async exportBackstageComponent(): Promise<void> {
    try {
      const operation = await this.workspaceOperation();
      const state = await operation.store.load();
      const snapshot = state.status === "partial" || state.status === "complete" ? state.snapshot : undefined;
      const project = snapshot?.project;
      if (!project) throw new Error("Create a project snapshot before exporting it.");
      if (!snapshot || !await this.hasCurrentInspectionConsent(snapshot, operation.identity)) throw new Error("Approve the current bounded inspection scope before exporting.");
      if (!this.canUseProjectContext(project)) throw new Error("Resolve required gaps and conflicts, then approve this exact snapshot before exporting a Backstage Component.");
      const freshness = await this.currentProjectComparison(project, operation);
      if (freshness.changes.length) throw new Error("Project evidence changed. Refresh and review the snapshot before exporting it.");
      const component = projectSnapshotToBackstageComponent(project);
      const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.joinPath(operation.folder.uri, "catalog-info.json"), filters: { JSON: ["json"] }, saveLabel: "Export Backstage Component" });
      if (target) {
        const finalCheck = await this.currentProjectComparison(project, operation);
        if (finalCheck.changes.length) throw new Error("Project evidence changed while choosing the export location. Refresh and retry.");
        await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(`${JSON.stringify(component, null, 2)}\n`));
        this.recordActivity({
          level: "info",
          category: "Export",
          title: "Backstage component exported",
          detail: "The selected JSON file was written successfully; its contents are excluded from activity.",
        });
      }
    } catch (error) {
      if (error instanceof WorkspaceSelectionChangedError) return;
      this.recordActivity({
        level: "error",
        category: "Export",
        title: "Backstage component was not exported",
        detail: "Review the current project state and try again.",
      });
      void vscode.window.showErrorMessage(error instanceof Error ? error.message : "Backstage Component could not be exported.");
    }
  }

  private partial(data: Partial<DwiWorkspaceSnapshot>): DwiWorkspaceSnapshot {
    return { schema: DWI_SNAPSHOT_SCHEMA, status: "partial", stage: data.stage ?? "consent", updatedAt: new Date().toISOString(), ...(data.generation !== undefined ? { generation: data.generation } : {}), ...(data.consent ? { consent: data.consent } : {}), project: data.project, brief: data.brief, selectedModuleIds: Array.isArray(data.selectedModuleIds) ? data.selectedModuleIds.filter((id): id is string => typeof id === "string" && DWI_MODULES.some((module) => module.id === id)) : undefined, candidate: data.candidate, candidateInput: data.candidate ? data.candidateInput : undefined, optimizerDraft: data.optimizerDraft, optimizerReview: data.candidate ? data.optimizerReview : undefined };
  }

  private async store(folder = this.activeFolder(), identity?: WorkspaceIdentity): Promise<DwiWorkspaceSnapshotStore<vscode.Uri>> {
    const selectedIdentity = identity ?? await this.identity(folder);
    const root = vscode.Uri.joinPath(
      this.context.globalStorageUri,
      "workspace-state",
      selectedIdentity.localFingerprint,
    );
    return new DwiWorkspaceSnapshotStore(root, selectedIdentity, {
      exists: async (uri) => { try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; } },
      stat: async (uri) => {
        const value = await vscode.workspace.fs.stat(uri);
        return {
          size: value.size,
          isDirectory: Boolean(value.type & vscode.FileType.Directory),
          isSymbolicLink: Boolean(value.type & vscode.FileType.SymbolicLink),
        };
      },
      readFile: async (uri) => {
        if ((await vscode.workspace.fs.stat(uri)).size > MAX_MANAGED_STATE_BYTES) throw new Error("Managed Prompt Optimizer state exceeds the 4 MiB limit.");
        const content = await vscode.workspace.fs.readFile(uri);
        if (content.byteLength > MAX_MANAGED_STATE_BYTES) throw new Error("Managed Prompt Optimizer state exceeds the 4 MiB limit.");
        return content;
      },
      writeFile: async (uri, content) => {
        if (content.byteLength > MAX_MANAGED_STATE_BYTES) throw new Error("Managed Prompt Optimizer state exceeds the 4 MiB limit.");
        await vscode.workspace.fs.writeFile(uri, content);
      },
      readDirectory: async (uri) => (await vscode.workspace.fs.readDirectory(uri)).map(([name]) => name),
      createDirectory: async (uri) => vscode.workspace.fs.createDirectory(uri),
      rename: async (from, to) => vscode.workspace.fs.rename(from, to, { overwrite: false }),
      delete: async (uri) => vscode.workspace.fs.delete(uri, { recursive: true, useTrash: false }),
    }, { join: (base, child) => vscode.Uri.joinPath(base, child) });
  }
  private async hasCurrentInspectionConsent(snapshot: DwiWorkspaceSnapshot, boundIdentity?: WorkspaceIdentity): Promise<boolean> {
    const identity = boundIdentity ?? await this.identity(this.activeFolder());
    const receipts = this.context.globalState.get<Record<string, DwiWorkspaceConsent>>(DWI_CONSENT_RECEIPTS_KEY, {});
    return snapshot.consent?.workspaceFingerprint === identity.localFingerprint
      && matchingInspectionConsent(snapshot, receipts[identity.localFingerprint]);
  }
  private async recordInspectionConsent(receipt: DwiWorkspaceConsent): Promise<void> {
    const receipts = {
      ...this.context.globalState.get<Record<string, DwiWorkspaceConsent>>(DWI_CONSENT_RECEIPTS_KEY, {}),
      [receipt.workspaceFingerprint]: receipt,
    };
    const bounded = Object.fromEntries(Object.entries(receipts)
      .sort((left, right) => Date.parse(right[1].approvedAt) - Date.parse(left[1].approvedAt))
      .slice(0, 256));
    await this.context.globalState.update(DWI_CONSENT_RECEIPTS_KEY, bounded);
  }
  private issueConsentCapability(webview: vscode.Webview, operation: WorkspaceOperation): string {
    return this.pendingConsentCapabilities.issue(webview, { workspaceFingerprint: operation.identity.localFingerprint, scopeDigest: workspaceInspectionScopeDigest(), epoch: operation.epoch });
  }
  private consumeConsentCapability(webview: vscode.Webview, token: string, operation: WorkspaceOperation): boolean {
    return this.pendingConsentCapabilities.consume(webview, token, { workspaceFingerprint: operation.identity.localFingerprint, scopeDigest: workspaceInspectionScopeDigest(), epoch: operation.epoch });
  }
  private async identity(folder: vscode.WorkspaceFolder): Promise<WorkspaceIdentity> {
    const repository = activeGitRepository(folder);
    const sourceRoot = repository ? repositoryRelativeRoot(repository.rootUri, folder.uri) : ".";
    const activeRemote = repository?.state.remotes?.find(({ name }) => name === "origin")?.fetchUrl
      ?? repository?.state.remotes?.find(({ name }) => name === "origin")?.pushUrl;
    if (activeRemote) return workspaceIdentity(folder.uri.toString(), folder.name, activeRemote, sourceRoot);
    const config = await boundedWorkspaceTextAt(folder.uri, [".git", "config"], MAX_GIT_CONFIG_BYTES);
    return workspaceIdentity(folder.uri.toString(), folder.name, config.status === "value" ? gitOriginFromConfig(config.value) : undefined, sourceRoot);
  }
  private async workspaceOperation(): Promise<WorkspaceOperation> {
    const folder = this.activeFolder();
    const epoch = this.rootEpoch;
    const identity = await this.identity(folder);
    this.assertWorkspaceOperation(folder, epoch);
    return { folder, epoch, identity, store: await this.store(folder, identity) };
  }
  private assertWorkspaceOperation(folder: vscode.WorkspaceFolder, epoch: number): void {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const chosen = this.selectedRootUri ? folders.find((item) => item.uri.toString() === this.selectedRootUri) : folders[0];
    if (epoch !== this.rootEpoch || chosen?.uri.toString() !== folder.uri.toString()) throw new WorkspaceSelectionChangedError();
  }
  private activeFolder(): vscode.WorkspaceFolder { const folders = vscode.workspace.workspaceFolders ?? []; const chosen = this.selectedRootUri ? folders.find((folder) => folder.uri.toString() === this.selectedRootUri) : folders[0]; return requireWorkspaceFolder(chosen); }
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Prompt Optimizer");
  const templateLibrary = new TemplateLibraryStore(context.globalState, new MockTemplateLibraryBackend(output));
  const optimizerSessions = new PromptOptimizerSessionStore(context.workspaceState);
  const sidebar = new DwiSidebarProvider(context, output, templateLibrary, optimizerSessions, confirmationPort(context));
  context.subscriptions.push(
    sidebar,
    output,
    vscode.window.registerWebviewViewProvider(DWI_PROMPT_OPTIMIZER_VIEW_ID, sidebar, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand("dwi.open", () => sidebar.reveal("home")),
    vscode.commands.registerCommand("dwi.openPromptOptimizer", () => sidebar.reveal("optimizer")),
    vscode.commands.registerCommand("dwi.exportProjectSnapshot", () => sidebar.exportProjectSnapshot()),
    vscode.commands.registerCommand("dwi.exportBackstageComponent", () => sidebar.exportBackstageComponent()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => sidebar.workspaceChanged()),
  );
}
export function deactivate(): void {}
