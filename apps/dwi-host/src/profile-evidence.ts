export interface StackEvidence {
  readonly stack: string;
  readonly relativePath: string;
  readonly reason: string;
}

/** Python counts only from a root or deployable component manifest, never scripts or docs. */
export function isPrimaryPythonManifest(relativePath: string): boolean {
  const parts = relativePath.replaceAll("\\", "/").split("/");
  const filename = parts.at(-1)?.toLowerCase();
  if (!filename || !["pyproject.toml", "requirements.txt"].includes(filename)) return false;
  if (parts.length === 1) return true;
  return parts.length === 2 && ["api", "apps", "backend", "packages", "server", "services"].includes(parts[0]!);
}

export function stackEvidenceLabel(evidence: readonly StackEvidence[]): string {
  return evidence.length ? evidence.map((item) => `${item.stack}: ${item.relativePath} (${item.reason})`).join(" · ") : "No primary runtime manifest was identified.";
}
