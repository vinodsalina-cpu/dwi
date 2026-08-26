import type { DwiBrief, DwiCandidate, DwiFeedback } from "@platform/dwi-core";

export const DWI_SNAPSHOT_SCHEMA = "dwi.workspace.snapshot.v1" as const;
const MANIFEST_FILE = "manifest.json";
const PARTIAL_FILE = "PARTIAL";
const COMPLETE_FILE = "COMPLETE";
const KNOWN_FILES = new Set([MANIFEST_FILE, PARTIAL_FILE, COMPLETE_FILE]);
export type DwiJourneyStage = "consent" | "brief" | "compose" | "evaluate";

export interface DwiWorkspaceSnapshot {
  schema: typeof DWI_SNAPSHOT_SCHEMA;
  status: "partial" | "complete";
  stage: DwiJourneyStage;
  updatedAt: string;
  brief?: DwiBrief;
  selectedModuleIds?: string[];
  candidate?: DwiCandidate;
  evaluationMarkdown?: string;
  feedback?: DwiFeedback;
}

export interface SnapshotFs<Path> {
  exists(path: Path): Promise<boolean>;
  readFile(path: Path): Promise<Uint8Array>;
  writeFile(path: Path, content: Uint8Array): Promise<void>;
  readDirectory(path: Path): Promise<readonly string[]>;
  createDirectory(path: Path): Promise<void>;
  rename(from: Path, to: Path): Promise<void>;
  delete(path: Path): Promise<void>;
}

export interface SnapshotPath<Path> { join(base: Path, child: string): Path }
export type SnapshotLoad<Path> =
  | { status: "absent" }
  | { status: "complete"; snapshot: DwiWorkspaceSnapshot }
  | { status: "partial"; snapshot: DwiWorkspaceSnapshot }
  | { status: "recovery"; reason: "corrupt-or-unsupported" | "unrecognized-content" };

export class DwiWorkspaceSnapshotStore<Path> {
  private readonly dwi: Path;

  constructor(private readonly root: Path, private readonly fs: SnapshotFs<Path>, private readonly paths: SnapshotPath<Path>, private readonly stamp: () => string = () => Date.now().toString()) {
    this.dwi = paths.join(root, ".dwi");
  }

  async load(): Promise<SnapshotLoad<Path>> {
    if (!await this.fs.exists(this.dwi)) return { status: "absent" };
    const result = await this.classify(this.dwi);
    if (result.snapshot?.status === "complete") return { status: "complete", snapshot: result.snapshot };
    if (result.snapshot?.status === "partial") return { status: "partial", snapshot: result.snapshot };
    return { status: "recovery", reason: result.unexpected ? "unrecognized-content" : "corrupt-or-unsupported" };
  }

  async begin(): Promise<DwiWorkspaceSnapshot> {
    await this.prepareForFreshJourney();
    const snapshot: DwiWorkspaceSnapshot = { schema: DWI_SNAPSHOT_SCHEMA, status: "partial", stage: "consent", updatedAt: this.stamp() };
    await this.write(snapshot);
    return snapshot;
  }

  async updatePartial(snapshot: DwiWorkspaceSnapshot): Promise<void> {
    if (snapshot.status !== "partial") throw new Error("DWI partial persistence requires a partial snapshot.");
    await this.write({ ...snapshot, updatedAt: this.stamp() });
  }

  async complete(snapshot: DwiWorkspaceSnapshot): Promise<void> {
    if (snapshot.status !== "complete") throw new Error("DWI completion requires a complete snapshot.");
    await this.write({ ...snapshot, updatedAt: this.stamp() });
  }

  async reset(): Promise<void> {
    if (!await this.fs.exists(this.dwi)) return;
    const result = await this.classify(this.dwi);
    if (result.unexpected) await this.recover();
    else await this.fs.delete(this.dwi);
  }

  private async prepareForFreshJourney(): Promise<void> {
    if (!await this.fs.exists(this.dwi)) return;
    const result = await this.classify(this.dwi);
    if (result.unexpected) await this.recover();
    else await this.fs.delete(this.dwi);
  }

  private async write(snapshot: DwiWorkspaceSnapshot): Promise<void> {
    assertSnapshot(snapshot);
    const staging = this.paths.join(this.root, `.dwi.staging-${this.stamp()}`);
    try {
      await this.fs.createDirectory(staging);
      await this.fs.writeFile(this.paths.join(staging, MANIFEST_FILE), encode(JSON.stringify(snapshot)));
      await this.fs.writeFile(this.paths.join(staging, snapshot.status === "complete" ? COMPLETE_FILE : PARTIAL_FILE), encode(`${DWI_SNAPSHOT_SCHEMA}\n`));
      const verified = await this.classify(staging);
      if (!verified.snapshot || verified.snapshot.status !== snapshot.status) throw new Error("DWI staging snapshot did not validate.");
      if (await this.fs.exists(this.dwi)) {
        const current = await this.classify(this.dwi);
        if (current.unexpected) throw new Error("DWI cannot replace unrecognized workspace files.");
        await this.fs.delete(this.dwi);
      }
      await this.fs.rename(staging, this.dwi);
    } catch (error) {
      if (await this.fs.exists(staging)) await this.fs.delete(staging);
      throw error;
    }
  }

  private async recover(): Promise<Path> {
    const recovery = this.paths.join(this.root, `.dwi.recovered-${this.stamp()}`);
    await this.fs.rename(this.dwi, recovery);
    return recovery;
  }

  private async classify(directory: Path): Promise<{ snapshot?: DwiWorkspaceSnapshot; unexpected: boolean }> {
    const files = await this.fs.readDirectory(directory);
    const unexpected = files.some((file) => !KNOWN_FILES.has(file));
    if (unexpected || !files.includes(MANIFEST_FILE)) return { unexpected };
    try {
      const snapshot = JSON.parse(decode(await this.fs.readFile(this.paths.join(directory, MANIFEST_FILE)))) as unknown;
      assertSnapshot(snapshot);
      const marker = snapshot.status === "complete" ? COMPLETE_FILE : PARTIAL_FILE;
      const otherMarker = snapshot.status === "complete" ? PARTIAL_FILE : COMPLETE_FILE;
      if (!files.includes(marker) || files.includes(otherMarker) || decode(await this.fs.readFile(this.paths.join(directory, marker))) !== `${DWI_SNAPSHOT_SCHEMA}\n`) return { unexpected: false };
      return { snapshot, unexpected: false };
    } catch { return { unexpected: false }; }
  }
}

function assertSnapshot(value: unknown): asserts value is DwiWorkspaceSnapshot {
  if (!value || typeof value !== "object") throw new Error("DWI snapshot must be an object.");
  const snapshot = value as Partial<DwiWorkspaceSnapshot>;
  if (snapshot.schema !== DWI_SNAPSHOT_SCHEMA || (snapshot.status !== "partial" && snapshot.status !== "complete") || !["consent", "brief", "compose", "evaluate"].includes(snapshot.stage ?? "") || typeof snapshot.updatedAt !== "string") throw new Error("DWI snapshot schema is invalid.");
  if (snapshot.status === "complete" && (!snapshot.brief || !snapshot.candidate || typeof snapshot.evaluationMarkdown !== "string")) throw new Error("DWI completion snapshot is incomplete.");
}

const encode = (value: string) => new TextEncoder().encode(value);
const decode = (value: Uint8Array) => new TextDecoder().decode(value);
