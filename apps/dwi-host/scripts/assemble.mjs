import { cp, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("..", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));
const dist = join(app, "dist");
async function runtime(path, name) {
  const source = join(root, path);
  const target = join(dist, "node_modules", ...name.split("/"));
  await rm(target, { recursive: true, force: true });
  await mkdir(join(target, "dist"), { recursive: true });
  await writeFile(join(target, "package.json"), await readFile(join(source, "package.json")));
  await cp(join(source, "dist"), join(target, "dist"), {
    recursive: true,
    filter: (entry) => !entry.endsWith(".d.ts") && !entry.endsWith(".d.ts.map") && !entry.endsWith(".tsbuildinfo")
  });
}
async function asset(name) {
  const source = join(root, "dist/apps/dwi-webview", name);
  const target = join(dist, name);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}
async function prune(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await prune(path);
    else if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.ts.map") || entry.name.endsWith(".tsbuildinfo")) await rm(path, { force: true });
  }
}
await Promise.all([
  runtime("packages/dwi-core", "@platform/dwi-core"),
  runtime("packages/domain/prompt-optimizer", "@platform/domain-prompt-optimizer"),
  runtime("packages/domain/workspace", "@platform/domain-workspace"),
  asset("dwi-webview.js"),
  asset("dwi-webview.css")
]);
await prune(dist);
