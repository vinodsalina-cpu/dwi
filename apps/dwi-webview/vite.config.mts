import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({ root, plugins: [react()], base: "./", build: { outDir: "dist", emptyOutDir: true, sourcemap: false }, resolve: { alias: { "@platform/dwi-core": path.resolve(root, "../../packages/dwi-core/src/index.ts") } } });
