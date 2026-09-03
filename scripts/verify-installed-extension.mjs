import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const vsix = join(root, 'apps/dwi-host/developer-work-intelligence-0.1.0.vsix');
const version = process.env.DWI_VSCODE_VERSION ?? '1.134.0';
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid DWI_VSCODE_VERSION: ${version}`);
const sandbox = await mkdtemp(join(tmpdir(), 'dwi-vscode-'));
let loopback;

function command(executable, args) {
  const result = spawnSync(executable, args, { stdio: 'inherit', timeout: 120000, killSignal: 'SIGKILL' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} failed with status ${result.status}, signal ${result.signal}`);
}

async function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', rejectPort);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function startLoopback() {
  const child = spawn(process.execPath, [join(root, 'scripts/loopback-openai-server.mjs')], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  const ready = await new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error('Loopback provider did not start.')), 10000);
    child.once('error', rejectReady);
    child.on('message', (message) => {
      if (message?.type === 'ready') {
        clearTimeout(timer);
        resolveReady(message);
      }
    });
  });
  return { child, baseUrl: `http://127.0.0.1:${ready.port}/v1` };
}

try {
  const extensionsDir = join(sandbox, 'extensions');
  const userDataDir = join(sandbox, 'user-data');
  const workspaceDir = join(sandbox, 'workspace');
  await Promise.all([mkdir(extensionsDir), mkdir(userDataDir), mkdir(workspaceDir)]);
  await writeFile(join(workspaceDir, 'package.json'), JSON.stringify({
    name: 'dwi-smoke-workspace',
    private: true,
    packageManager: 'pnpm@11.17.0',
    scripts: { build: 'tsc -p tsconfig.json', test: 'vitest run' },
    devDependencies: { typescript: '^5.9.3', vitest: '^4.1.10' },
  }, null, 2));
  await writeFile(join(workspaceDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' }, include: ['src'],
  }, null, 2));
  await mkdir(join(workspaceDir, 'src'));
  await writeFile(join(workspaceDir, 'src/index.ts'), 'export const answer = 42;\n');
  await writeFile(join(workspaceDir, 'README.md'), '# DWI smoke workspace\nA small TypeScript workspace used to verify packaged DWI activation.\n');

  const downloaded = process.env.DWI_VSCODE_EXECUTABLE_PATH ?? await downloadAndUnzipVSCode(version);
  const vscodeExecutablePath = process.platform === 'darwin' ? join(dirname(downloaded), 'Code') : downloaded;
  const vscodeCliPath = process.platform === 'win32'
    ? vscodeExecutablePath
    : process.platform === 'darwin'
      ? join(dirname(dirname(vscodeExecutablePath)), 'Resources', 'app', 'bin', 'code')
      : join(dirname(vscodeExecutablePath), 'bin', 'code');
  const ciElectronArgs = process.platform === 'linux' && process.env.CI === 'true' ? ['--no-sandbox'] : [];
  const installArgs = ['--extensions-dir', extensionsDir, '--user-data-dir', userDataDir];

  command(vscodeCliPath, [...ciElectronArgs, '--list-extensions', ...installArgs]);
  if ((await readdir(extensionsDir)).some((name) => name.startsWith('dwi-poc.developer-work-intelligence-'))) {
    throw new Error('DWI unexpectedly existed in the disposable extensions directory.');
  }
  console.log('DWI_SMOKE_ABSENCE_OK');
  command(vscodeCliPath, [...ciElectronArgs, '--install-extension', vsix, '--force', ...installArgs]);
  console.log('DWI_SMOKE_INSTALL_OK');
  command(vscodeCliPath, [...ciElectronArgs, '--uninstall-extension', 'dwi-poc.developer-work-intelligence', ...installArgs]);
  if ((await readdir(extensionsDir)).some((name) => name.startsWith('dwi-poc.developer-work-intelligence-'))) {
    throw new Error('DWI remained in the disposable extensions directory after uninstall.');
  }
  console.log('DWI_SMOKE_UNINSTALL_OK');
  command(vscodeCliPath, [...ciElectronArgs, '--install-extension', vsix, '--force', ...installArgs]);
  console.log('DWI_SMOKE_REINSTALL_OK');

  const installedName = (await readdir(extensionsDir)).find((name) => name.startsWith('dwi-poc.developer-work-intelligence-'));
  if (!installedName) throw new Error('Installed DWI extension directory was not found.');
  const installed = join(extensionsDir, installedName);

  const commonEnvironment = { ...process.env, DWI_PACKAGED_SMOKE: '1' };
  const noWorkspacePort = await freePort();
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: installed,
    extensionTestsPath: join(root, 'tests/extension-host/index.cjs'),
    launchArgs: [...ciElectronArgs, `--remote-debugging-port=${noWorkspacePort}`, '--extensions-dir', extensionsDir, '--user-data-dir', userDataDir, '--disable-workspace-trust'],
    extensionTestsEnv: { ...commonEnvironment, DWI_SMOKE_PHASE: 'no-workspace', DWI_SMOKE_DEBUG_PORT: String(noWorkspacePort) },
  });
  console.log('DWI_SMOKE_NO_WORKSPACE_HOST_OK');

  loopback = await startLoopback();
  const workspacePort = await freePort();
  await runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: installed,
    extensionTestsPath: join(root, 'tests/extension-host/index.cjs'),
    launchArgs: [workspaceDir, ...ciElectronArgs, `--remote-debugging-port=${workspacePort}`, '--extensions-dir', extensionsDir, '--user-data-dir', userDataDir, '--disable-workspace-trust'],
    extensionTestsEnv: { ...commonEnvironment, DWI_SMOKE_PHASE: 'workspace', DWI_SMOKE_DEBUG_PORT: String(workspacePort), DWI_LOOPBACK_BASE_URL: loopback.baseUrl },
  });
  if (loopback.child.exitCode === null) {
    await new Promise((resolveExit, rejectExit) => {
      const timer = setTimeout(() => rejectExit(new Error('Loopback provider did not stop after the semantic response.')), 5000);
      loopback.child.once('exit', (code) => {
        clearTimeout(timer);
        code === 0 ? resolveExit() : rejectExit(new Error(`Loopback provider exited with ${code}.`));
      });
    });
  } else if (loopback.child.exitCode !== 0) {
    throw new Error(`Loopback provider exited with ${loopback.child.exitCode}.`);
  }
  console.log('DWI_SMOKE_LOOPBACK_OUT_OF_PROCESS_OK');
  console.log(`DWI_SMOKE_VSCODE_VERSION=${version}`);
  console.log('DWI_SMOKE_EXTENSION_HOST_OK');
} finally {
  if (loopback?.child && loopback.child.exitCode === null) loopback.child.kill('SIGTERM');
  await rm(sandbox, { recursive: true, force: true });
  console.log('DWI_SMOKE_CLEANUP_OK');
}
