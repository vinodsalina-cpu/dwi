export interface GitRevision {
  branch: string | null;
  commit: string | null;
  dirty: boolean | null;
}

export interface RecordedGitRevision {
  branch?: string;
  commit?: string;
  dirty?: boolean;
}

const objectId = /^[a-f0-9]{40,64}$/i;

export function parseSafeGitHeadReference(head: string): { fullReference: string; branch: string } | undefined {
  const match = /^ref:\s+(refs\/heads\/(.+))$/i.exec(head.trim());
  const branch = match?.[2];
  if (
    !branch ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{") ||
    branch === "@" ||
    branch.includes("]") ||
    /[\u0000-\u0020\u007f~^:?*\[\\]/.test(branch) ||
    branch.split("/").some((segment) => !segment || segment === "." || segment === ".." || segment.toLowerCase().endsWith(".lock"))
  ) return undefined;
  return { fullReference: match[1]!, branch };
}

export function parseGitRevision(head: string, referencedValue?: string, packedRefs?: string): GitRevision {
  const value = head.trim();
  if (objectId.test(value)) return { branch: null, commit: value.toLowerCase(), dirty: null };
  const reference = parseSafeGitHeadReference(value);
  if (!reference) return { branch: null, commit: null, dirty: null };
  const { fullReference, branch } = reference;
  const loose = referencedValue?.trim();
  if (loose && objectId.test(loose)) return { branch, commit: loose.toLowerCase(), dirty: null };
  for (const line of packedRefs?.split(/\r?\n/) ?? []) {
    const match = /^([a-f0-9]{40,64})\s+(.+)$/i.exec(line.trim());
    if (match?.[2] === fullReference) return { branch, commit: match[1]!.toLowerCase(), dirty: null };
  }
  return { branch, commit: null, dirty: null };
}

export function gitRevisionChanges(recorded: RecordedGitRevision, current: GitRevision): string[] {
  const changes: string[] = [];
  if (recorded.commit && !current.commit) changes.push("current commit could not be verified");
  else if (recorded.commit && current.commit && recorded.commit.toLowerCase() !== current.commit.toLowerCase()) changes.push(`commit ${recorded.commit.slice(0, 8)} → ${current.commit.slice(0, 8)}`);
  if (recorded.branch && !current.branch) changes.push("current branch could not be verified");
  else if (recorded.branch && current.branch && recorded.branch !== current.branch) changes.push(`branch ${recorded.branch} → ${current.branch}`);
  if (recorded.dirty !== undefined && current.dirty === null) changes.push("working-tree state could not be verified");
  else if (recorded.dirty !== undefined && current.dirty !== null && recorded.dirty !== current.dirty) changes.push(`working tree ${recorded.dirty ? "dirty" : "clean"} → ${current.dirty ? "dirty" : "clean"}`);
  return changes;
}
