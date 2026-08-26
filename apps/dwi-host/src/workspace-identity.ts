import { createHash } from "node:crypto";

export interface WorkspaceIdentity { uri: string; fingerprint: string; label: string }

/** Stable, scoped identity for one explicitly selected workspace root. */
export function workspaceIdentity(uri: string, label: string): WorkspaceIdentity {
  const canonicalUri = uri.replace(/\/+$/, "");
  return { uri: canonicalUri, label, fingerprint: createHash("sha256").update(`dwi.workspace.v1\0${canonicalUri}`).digest("hex").slice(0, 16) };
}

export function selectWorkspaceRoot<T extends { uri: string }>(roots: readonly T[], uri: string): T | undefined {
  return roots.find((root) => root.uri.replace(/\/+$/, "") === uri.replace(/\/+$/, ""));
}
