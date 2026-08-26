import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const host = path.resolve(root, "apps/dwi-host");
const webview = path.resolve(root, "apps/dwi-webview/dist");
await mkdir(path.resolve(host, "dist/webview"), { recursive: true });
await cp(webview, path.resolve(host, "dist/webview"), { recursive: true });
await mkdir(path.resolve(host, "dist/media"), { recursive: true });
await cp(path.resolve(host, "media"), path.resolve(host, "dist/media"), { recursive: true });
