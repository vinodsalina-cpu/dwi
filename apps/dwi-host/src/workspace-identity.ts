import { createHash } from "node:crypto";

export type WorkspaceIdentityKind = "remote" | "canonical-folder";
export interface WorkspaceIdentity { uri: string; fingerprint: string; localFingerprint: string; label: string; kind: WorkspaceIdentityKind; value: string; repository?: string; sourceRoot: string }

function normalizeRemote(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  const scp = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(trimmed);
  const candidate = scp ? `https://${scp[1]}/${scp[2]}` : trimmed;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:", "ssh:", "git:"].includes(url.protocol) || !url.hostname) return undefined;
    const path = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
    if (!path || path.split("/").some((part) => !part || part === "." || part === "..")) return undefined;
    return `https://${url.host.toLowerCase()}/${path}`;
  } catch {
    return undefined;
  }
}
const normalizeFolder = (value: string) => value.replace(/\/+$/, "");

/** Remote identity is stable across clones and moves; folder identity is the explicit fallback. */
export function workspaceIdentity(uri: string, label: string, remoteUrl?: string, sourceRoot = "."): WorkspaceIdentity {
  const canonicalUri = normalizeFolder(uri);
  const remote = remoteUrl?.trim() ? normalizeRemote(remoteUrl) : undefined;
  const normalizedSourceRoot = sourceRoot === "." || (!sourceRoot.startsWith("/") && !sourceRoot.includes("\\") && sourceRoot.split("/").every((part) => part && part !== "." && part !== "..")) ? sourceRoot : ".";
  const kind: WorkspaceIdentityKind = remote ? "remote" : "canonical-folder";
  const value = remote ? `${remote}${normalizedSourceRoot === "." ? "" : `#dwi-root=${encodeURIComponent(normalizedSourceRoot)}`}` : canonicalUri;
  const fingerprint = createHash("sha256").update(`dwi.workspace.v2\0${kind}\0${value}`).digest("hex").slice(0, 24);
  const localFingerprint = createHash("sha256").update(`dwi.workspace-local.v1\0${canonicalUri}\0${normalizedSourceRoot}`).digest("hex").slice(0, 24);
  return { uri: canonicalUri, label, kind, value, ...(remote ? { repository: remote } : {}), sourceRoot: normalizedSourceRoot, fingerprint, localFingerprint };
}

export function gitOriginFromConfig(config: string): string | undefined {
  let inOrigin = false;
  for (const line of config.split(/\r?\n/)) {
    const section = /^\s*\[([^\]]+)]\s*$/.exec(line);
    if (section) { inOrigin = /^remote\s+"origin"$/i.test(section[1] ?? ""); continue; }
    if (inOrigin) { const url = /^\s*url\s*=\s*(.+?)\s*$/i.exec(line)?.[1]; if (url) return url; }
  }
  return undefined;
}

export function selectWorkspaceRoot<T extends { uri: string }>(roots: readonly T[], uri: string): T | undefined {
  return roots.find((root) => normalizeFolder(root.uri) === normalizeFolder(uri));
}
