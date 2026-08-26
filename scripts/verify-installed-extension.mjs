import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { mkdtemp, mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const vsix = join(root, 'apps/dwi-host/developer-work-intelligence-0.1.0.vsix');
const sandbox = await mkdtemp(join(tmpdir(), 'dwi-vscode-'));
const extensionsDir = join(sandbox, 'extensions');
const userDataDir = join(sandbox, 'user-data');
const workspaceDir = join(sandbox, 'workspace');
await Promise.all([mkdir(extensionsDir), mkdir(userDataDir), mkdir(workspaceDir)]);

await writeFile(join(workspaceDir, 'package.json'), JSON.stringify({
  name: 'dwi-smoke-workspace',
  private: true,
  packageManager: 'pnpm@11.17.0',
  scripts: { build: 'tsc -p tsconfig.json', test: 'vitest run' },
  devDependencies: { typescript: '^5.9.3', vitest: '^4.1.10' }
}, null, 2));
await writeFile(join(workspaceDir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' },
  include: ['src']
}, null, 2));
await mkdir(join(workspaceDir, 'src'));
await writeFile(join(workspaceDir, 'src/index.ts'), 'export const answer = 42;\n');
await writeFile(join(workspaceDir, 'README.md'), '# DWI smoke workspace\nA small TypeScript workspace used to verify packaged DWI activation.\n');

const vscodeExecutablePath = await downloadAndUnzipVSCode('1.134.0');
const vscodeCliPath = process.platform === 'win32'
  ? vscodeExecutablePath
  : join(dirname(vscodeExecutablePath), 'bin', 'code');
const ciElectronArgs = process.platform === 'linux' && process.env.CI === 'true' ? ['--no-sandbox'] : [];

console.log('DWI_SMOKE_INSTALL_BEGIN');
const install = spawnSync(vscodeCliPath, [
  ...ciElectronArgs,
  '--install-extension', vsix,
  '--force',
  '--extensions-dir', extensionsDir,
  '--user-data-dir', userDataDir
], { stdio: 'inherit', timeout: 120000, killSignal: 'SIGKILL' });
if (install.error) throw install.error;
if (install.status !== 0) throw new Error(`VSIX installation failed with status ${install.status}, signal ${install.signal}`);
console.log('DWI_SMOKE_INSTALL_OK');

const installed = (await readdir(extensionsDir)).find((name) => name.startsWith('dwi-poc.developer-work-intelligence-'));
if (!installed) throw new Error('Installed DWI extension directory was not found.');

await runTests({
  vscodeExecutablePath,
  extensionDevelopmentPath: join(extensionsDir, installed),
  extensionTestsPath: join(root, 'tests/extension-host/index.cjs'),
  launchArgs: [workspaceDir, ...ciElectronArgs, '--extensions-dir', extensionsDir, '--user-data-dir', userDataDir, '--disable-workspace-trust']
});
console.log('DWI_SMOKE_EXTENSION_HOST_OK');
