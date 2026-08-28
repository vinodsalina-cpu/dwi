import { cp, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const app = fileURLToPath(new URL("..", import.meta.url));
const root = fileURLToPath(new URL("../../..", import.meta.url));
const dist = join(app, "dist");
const hostRequire = createRequire(join(app, "package.json"));
const coreRequire = createRequire(join(root, "packages/dwi-core/package.json"));
const omittedRuntimeDirectories = new Set([
  ".cache",
  ".github",
  "benchmark",
  "benchmarks",
  "coverage",
  "docs",
  "example",
  "examples",
  "spec",
  "src",
  "test",
  "tests",
]);
function omittedRuntimeFile(name) {
  return name.endsWith(".map") ||
    name.endsWith(".ts") ||
    name.endsWith(".cts") ||
    name.endsWith(".mts") ||
    /(?:^|\.)((?:spec|test))\.[cm]?js$/i.test(name) ||
    /^(?:tsconfig|eslint|vitest|jest|rollup|webpack)(?:\.|$)/i.test(name) ||
    name.startsWith(".eslint") ||
    name.startsWith(".prettier") ||
    name === ".nycrc";
}
function externalRuntimeFilter(source, entry) {
  const path = relative(source, entry);
  if (!path) return true;
  const segments = path.split(sep);
  if (segments.includes("node_modules")) return false;
  if (segments.some((segment) => omittedRuntimeDirectories.has(segment))) return false;
  return !omittedRuntimeFile(segments.at(-1));
}
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
async function externalRuntime(name, ownerRequire, targetRoot = join(dist, "node_modules")) {
  const packageJson = ownerRequire.resolve(`${name}/package.json`);
  const source = dirname(packageJson);
  const target = join(targetRoot, ...name.split("/"));
  await rm(target, { recursive: true, force: true });
  await cp(source, target, {
    recursive: true,
    filter: (entry) => externalRuntimeFilter(source, entry),
  });
  const manifest = JSON.parse(await readFile(packageJson, "utf8"));
  const dependencyRequire = createRequire(packageJson);
  for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
    await externalRuntime(dependency, dependencyRequire, join(target, "node_modules"));
  }
}
async function prune(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (omittedRuntimeDirectories.has(entry.name)) await rm(path, { recursive: true, force: true });
      else await prune(path);
    } else if (omittedRuntimeFile(entry.name) || entry.name.endsWith(".tsbuildinfo")) {
      await rm(path, { force: true });
    }
  }
}
await Promise.all([
  runtime("packages/dwi-core", "@platform/dwi-core"),
  runtime("packages/domain/prompt-optimizer", "@platform/domain-prompt-optimizer"),
  runtime("packages/domain/workspace", "@platform/domain-workspace"),
  externalRuntime("ajv", coreRequire),
  externalRuntime("yaml", hostRequire),
  asset("dwi-webview.js"),
  asset("dwi-webview.css")
]);
await prune(dist);
