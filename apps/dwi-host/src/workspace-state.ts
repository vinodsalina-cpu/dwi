export interface WorkspaceFolderLike { readonly name: string }

export function requireWorkspaceFolder<T extends WorkspaceFolderLike>(folder: T | undefined): T {
  if (!folder) throw new Error("Open a workspace before creating a project brief.");
  return folder;
}
