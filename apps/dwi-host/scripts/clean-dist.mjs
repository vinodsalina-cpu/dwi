import { mkdir, rm } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../dist", import.meta.url));
const app = dirname(dirname(fileURLToPath(import.meta.url)));
if (basename(target) !== "dist" || dirname(target) !== app) {
  throw new Error(`Refusing to clean unexpected host output path: ${target}`);
}
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
