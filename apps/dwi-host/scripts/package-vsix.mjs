import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createVSIX } from "@vscode/vsce";

const app = fileURLToPath(new URL("..", import.meta.url));
const stage = await mkdtemp(join(tmpdir(), "dwi-vsix-"));

try {
  const manifest = JSON.parse(await readFile(join(app, "package.json"), "utf8"));
  manifest.name = "developer-work-intelligence";
  delete manifest.scripts;
  delete manifest.dependencies;
  delete manifest.devDependencies;

  const packageBase = `${manifest.name}-${manifest.version}`;
  const packagePath = join(app, `${packageBase}.vsix`);
  await writeFile(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(
    join(stage, "README.md"),
    "# Prompt Optimizer\n\nConsent-based, project-aware prompt optimization. Project initialization and deterministic previews stay local; an LLM is contacted only through the explicit rewrite action after provider configuration.\n",
  );
  await mkdir(join(stage, "media"));
  await cp(join(app, "media"), join(stage, "media"), { recursive: true });
  await cp(join(app, "dist"), join(stage, "dist"), { recursive: true });
  await createVSIX({ cwd: stage, packagePath, dependencies: false });

  const bytes = await readFile(packagePath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sourceCommit = execFileSync("git", ["-C", app, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const trackedSourceClean = spawnSync("git", ["-C", app, "diff", "--quiet", "HEAD", "--"]).status === 0;
  const repositoryRoot = execFileSync("git", ["-C", app, "rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const evidenceDirectory = join(repositoryRoot, "artifacts", "vsix");
  const evidencePath = join(evidenceDirectory, `${packageBase}.evidence.json`);
  await mkdir(evidenceDirectory, { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify({
    schemaVersion: "dwi.vsix-evidence.v1",
    packagePath,
    packageName: manifest.name,
    packageVersion: manifest.version,
    extensionIdentity: `${manifest.publisher}.${manifest.name}@${manifest.version}`,
    sourceCommit,
    trackedSourceClean,
    sha256,
    bytes: (await stat(packagePath)).size,
  }, null, 2)}\n`);
  console.log(`DWI_VSIX_PATH=${packagePath}`);
  console.log(`DWI_VSIX_SOURCE_COMMIT=${sourceCommit}`);
  console.log(`DWI_VSIX_TRACKED_SOURCE_CLEAN=${trackedSourceClean}`);
  console.log(`DWI_VSIX_SHA256=${sha256}`);
  console.log(`DWI_VSIX_EVIDENCE=${evidencePath}`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
