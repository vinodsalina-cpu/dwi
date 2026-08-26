import * as vscode from "vscode";
import { DWI_MODULES, compileDwiCandidate, createFeedback, evaluationMarkdown, type DwiBrief, type DwiFact, type DwiFeedback } from "@platform/dwi-core";
import { shouldIgnoreRetrievalPath } from "@platform/domain-workspace";
import { isPrimaryPythonManifest, stackEvidenceLabel, type StackEvidence } from "./profile-evidence.js";
import { requireWorkspaceFolder } from "./workspace-state.js";
import { DWI_SNAPSHOT_SCHEMA, DwiWorkspaceSnapshotStore, type DwiWorkspaceSnapshot } from "./workspace-snapshot.js";
import { PROVIDER_SECRET_KEY, PROVIDER_SETTINGS_KEY, noProviderSettings, validateProviderSettings, type ProviderSettingsInput } from "./provider-settings.js";
import { selectWorkspaceRoot, workspaceIdentity } from "./workspace-identity.js";

const MAX_FILE_BYTES = 128 * 1024;
const EXCLUDE = "**/{node_modules,.git,.env*,dist,build,out,coverage,.next,.turbo,.cache,__pycache__,.venv,venv}/**";
type Message = { type: string; [key: string]: unknown };
export const DWI_NATIVE_VIEW_ID = "dwi-view";

async function safeText(uri: vscode.Uri): Promise<string | undefined> {
  const relative = vscode.workspace.asRelativePath(uri, false).replaceAll("\\", "/");
  if (shouldIgnoreRetrievalPath(relative)) return;
  const stat = await vscode.workspace.fs.stat(uri); if (stat.size > MAX_FILE_BYTES) return;
  return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
}

export async function profileApprovedWorkspace(folder = requireWorkspaceFolder(vscode.workspace.workspaceFolders?.[0])): Promise<DwiBrief> {
  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/{package.json,pnpm-workspace.yaml,pyproject.toml,requirements.txt,README.md,README}"), EXCLUDE, 40);
  const facts: DwiFact[] = []; const stack = new Set<string>(); const stackEvidence: StackEvidence[] = []; const scripts = new Set<string>(); const modules = new Set<string>(); let packageManager = "unknown"; let archetype = "software project";
  for (const uri of files) {
    const relative = vscode.workspace.asRelativePath(uri, false).replaceAll("\\", "/"); const text = await safeText(uri); if (!text) continue;
    const base = relative.split("/").at(-1)?.toLowerCase();
    if (base === "package.json") {
      try { const manifest = JSON.parse(text) as { scripts?: Record<string,string>; packageManager?: string; dependencies?: Record<string,string>; devDependencies?: Record<string,string> }; Object.keys(manifest.scripts ?? {}).slice(0, 16).forEach((x) => scripts.add(x)); if (manifest.packageManager?.startsWith("pnpm")) packageManager = "pnpm"; const deps = { ...manifest.dependencies, ...manifest.devDependencies }; stack.add("TypeScript"); stackEvidence.push({ stack: "TypeScript", relativePath: relative, reason: "package manifest" }); if (deps.react) { stack.add("React"); stackEvidence.push({ stack: "React", relativePath: relative, reason: "dependency" }); } if (deps.next) { stack.add("Next.js"); stackEvidence.push({ stack: "Next.js", relativePath: relative, reason: "dependency" }); } if (deps["@nestjs/core"]) { stack.add("NestJS"); stackEvidence.push({ stack: "NestJS", relativePath: relative, reason: "dependency" }); } if (relative.includes("/")) modules.add(relative.split("/")[0]!); } catch { /* malformed manifests are omitted, never forwarded */ }
    } else if ((base === "pyproject.toml" || base === "requirements.txt") && isPrimaryPythonManifest(relative)) { stack.add("Python"); stackEvidence.push({ stack: "Python", relativePath: relative, reason: "runtime manifest" }); if (packageManager === "unknown") packageManager = base === "pyproject.toml" ? "pyproject" : "pip"; }
  }
  if (files.some((f) => vscode.workspace.asRelativePath(f, false) === "pnpm-workspace.yaml")) { packageManager = "pnpm"; archetype = "multi-package workspace"; }
  facts.push({ id: "stack", label: "Stack", value: [...stack].join(" + ") || "Unknown", confidence: stack.size ? "high" : "low", evidence: stackEvidenceLabel(stackEvidence) });
  facts.push({ id: "package-manager", label: "Package manager", value: packageManager, confidence: packageManager === "unknown" ? "low" : "high", evidence: "Workspace and package manifests" });
  facts.push({ id: "verification", label: "Verification", value: [...scripts].filter((x) => /test|lint|typecheck|check|build/.test(x)).slice(0, 6).join(", ") || "Not discovered", confidence: scripts.size ? "medium" : "low", evidence: "Declared scripts" });
  return { version: "dwi.brief.v1", projectName: folder.name, archetype, stack: [...stack], packageManager, scripts: [...scripts].slice(0, 16), modules: [...modules].slice(0, 12), facts, unknowns: ["Delivery target", "Task-specific acceptance criteria"], confirmed: false, corrections: "" };
}

class DwiSidebarProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private selectedRootUri: string | undefined;
  constructor(private readonly context: vscode.ExtensionContext) {}
  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const { webview } = view;
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "dist")] };
    const js = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "dwi-webview.js")); const css = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "dwi-webview.css")); const nonce = crypto.randomUUID().replaceAll("-", "");
    webview.html = `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'"></head><body><div id="root"></div><link rel="stylesheet" href="${css}"><script nonce="${nonce}" type="module" src="${js}"></script></body></html>`;
    webview.onDidReceiveMessage((message: Message) => void this.handle(message, webview), undefined, this.context.subscriptions);
  }
  async reveal(): Promise<void> {
    await vscode.commands.executeCommand("workbench.view.extension.dwi-sidebar");
    this.view?.show(true);
  }
  workspaceChanged(): void { void this.view?.webview.postMessage({ type: "dwi.workspace.changed" }); }
  private async handle(message: Message, webview: vscode.Webview): Promise<void> {
    if (message.type === "dwi.provider.get") { await webview.postMessage({ type: "dwi.provider.state", settings: this.context.globalState.get(PROVIDER_SETTINGS_KEY, noProviderSettings()) }); return; }
    if (message.type === "dwi.provider.save") { try { const input = message.settings as ProviderSettingsInput; const settings = validateProviderSettings(input); if (typeof input.key === "string" && input.key.length) await this.context.secrets.store(PROVIDER_SECRET_KEY, input.key); await this.context.globalState.update(PROVIDER_SETTINGS_KEY, settings); await webview.postMessage({ type: "dwi.provider.saved", settings }); } catch (error) { await webview.postMessage({ type: "dwi.provider.error", message: error instanceof Error ? error.message : "Provider settings could not be saved." }); } return; }
    if (message.type === "dwi.session.open") { const roots = vscode.workspace.workspaceFolders ?? []; if (!roots.length) { await webview.postMessage({ type: "dwi.session.generic", reason: "no-workspace" }); return; } if (roots.length > 1 && !this.selectedRootUri) { await webview.postMessage({ type: "dwi.workspace.choose-root", roots: roots.map((root) => ({ uri: root.uri.toString(), label: root.name, fingerprint: workspaceIdentity(root.uri.toString(), root.name).fingerprint })) }); return; } try { const state = await this.store().load(); await webview.postMessage({ type: `dwi.snapshot.${state.status}`, ...state }); } catch { await webview.postMessage({ type: "dwi.session.generic", reason: "context-invalid" }); } return; }
    if (message.type === "dwi.workspace.select-root") { const root = selectWorkspaceRoot((vscode.workspace.workspaceFolders ?? []).map((folder) => ({ uri: folder.uri.toString(), folder })), String(message.uri ?? "")); if (!root) { await webview.postMessage({ type: "dwi.session.generic", reason: "context-invalid" }); return; } this.selectedRootUri = root.uri; await this.handle({ type: "dwi.session.open" }, webview); return; }
    if (message.type === "dwi.consent.approve") { await webview.postMessage({ type: "dwi.consent.loading" }); try { const store = this.store(); await store.begin(); const brief = await profileApprovedWorkspace(this.activeFolder()); await store.updatePartial(this.partial({ stage: "brief", brief })); await webview.postMessage({ type: "dwi.brief.ready", brief }); } catch (error) { await webview.postMessage({ type: "dwi.error", code: "workspace-required", message: error instanceof Error ? error.message : "DWI could not create a local project brief." }); } return; }
    if (message.type === "dwi.snapshot.partial") { await this.store().updatePartial(this.partial(message.snapshot as Partial<DwiWorkspaceSnapshot>)); return; }
    if (message.type === "dwi.snapshot.reset") { await this.store().reset(); await webview.postMessage({ type: "dwi.snapshot.absent" }); return; }
    if (message.type === "dwi.feedback.record") {
      const raw = message.feedback as Omit<DwiFeedback,"id"|"createdAt">; const event = createFeedback(raw); await webview.postMessage({ type: "dwi.feedback.saved", count: 1, feedback: event }); return;
    }
    if (message.type === "dwi.feedback.delete") { await webview.postMessage({ type: "dwi.feedback.deleted" }); return; }
    if (message.type === "dwi.journey.complete") { const data = message.snapshot as Partial<DwiWorkspaceSnapshot>; const feedback = createFeedback(message.feedback as Omit<DwiFeedback,"id"|"createdAt">); const snapshot: DwiWorkspaceSnapshot = { ...this.partial(data), status: "complete", stage: "evaluate", candidate: data.candidate, evaluationMarkdown: typeof data.evaluationMarkdown === "string" ? data.evaluationMarkdown : "", feedback }; await this.store().complete(snapshot); await webview.postMessage({ type: "dwi.journey.completed", snapshot }); return; }
    if (message.type === "dwi.evaluation.export") {
      const brief = message.brief as DwiBrief; const feedback = createFeedback(message.feedback as Omit<DwiFeedback,"id"|"createdAt">); const target = await vscode.window.showSaveDialog({ filters: { Markdown: ["md"] }, saveLabel: "Export human-gated evaluation draft" }); if (target) await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(evaluationMarkdown(feedback, brief))); return;
    }
    if (message.type === "dwi.candidate.compile") { const brief = message.brief as DwiBrief; const ids = Array.isArray(message.selectedModuleIds) ? message.selectedModuleIds.filter((x): x is string => typeof x === "string" && DWI_MODULES.some((m) => m.id === x)) : []; await webview.postMessage({ type: "dwi.candidate.ready", candidate: compileDwiCandidate({ ...brief, confirmed: true }, ids) }); }
  }

  private partial(data: Partial<DwiWorkspaceSnapshot>): DwiWorkspaceSnapshot {
    return { schema: DWI_SNAPSHOT_SCHEMA, status: "partial", stage: data.stage ?? "consent", updatedAt: new Date().toISOString(), brief: data.brief, selectedModuleIds: Array.isArray(data.selectedModuleIds) ? data.selectedModuleIds.filter((id): id is string => typeof id === "string" && DWI_MODULES.some((module) => module.id === id)) : undefined, candidate: data.candidate };
  }

  private store(): DwiWorkspaceSnapshotStore<vscode.Uri> {
    const root = this.activeFolder().uri;
    return new DwiWorkspaceSnapshotStore(root, {
      exists: async (uri) => { try { await vscode.workspace.fs.stat(uri); return true; } catch { return false; } },
      readFile: async (uri) => vscode.workspace.fs.readFile(uri),
      writeFile: async (uri, content) => vscode.workspace.fs.writeFile(uri, content),
      readDirectory: async (uri) => (await vscode.workspace.fs.readDirectory(uri)).map(([name]) => name),
      createDirectory: async (uri) => vscode.workspace.fs.createDirectory(uri),
      rename: async (from, to) => vscode.workspace.fs.rename(from, to, { overwrite: false }),
      delete: async (uri) => vscode.workspace.fs.delete(uri, { recursive: true, useTrash: false }),
    }, { join: (base, child) => vscode.Uri.joinPath(base, child) });
  }
  private activeFolder(): vscode.WorkspaceFolder { const folders = vscode.workspace.workspaceFolders ?? []; const chosen = this.selectedRootUri ? folders.find((folder) => folder.uri.toString() === this.selectedRootUri) : folders[0]; return requireWorkspaceFolder(chosen); }
}

export function activate(context: vscode.ExtensionContext): void {
  const sidebar = new DwiSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DWI_NATIVE_VIEW_ID, sidebar, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand("dwi.open", () => sidebar.reveal()),
    vscode.workspace.onDidChangeWorkspaceFolders(() => sidebar.workspaceChanged()),
  );
}
export function deactivate(): void {}
