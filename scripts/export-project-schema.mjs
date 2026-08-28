import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DWI_PROJECT_SNAPSHOT_JSON_SCHEMA } from "../packages/dwi-core/dist/index.js";

const target = fileURLToPath(new URL("../docs/project-snapshot.schema.json", import.meta.url));
await writeFile(target, `${JSON.stringify(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA, null, 2)}\n`);
process.stdout.write(`${target}\n`);
