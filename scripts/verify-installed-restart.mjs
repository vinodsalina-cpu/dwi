import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const vsix = join(root, 'apps/dwi-host/developer-work-intelligence-0.1.0.vsix');
// Keep the portable profile path short enough for VS Code's Unix IPC socket.
const sandbox = await mkdtemp(join('/tmp', 'dwi-vscode-restart-'));
let liveChild;
try {
const extensionsDir = join(sandbox, 'extensions');
const userDataDir = join(sandbox, 'user-data');
const portableDir = join(sandbox, 'portable');
const workspaceDir = join(sandbox, 'dwi-restart-workspace');
const workspaceWindowTitle = 'dwi-restart-workspace';
await Promise.all([mkdir(extensionsDir), mkdir(userDataDir), mkdir(portableDir), mkdir(workspaceDir)]);
await mkdir(join(workspaceDir, 'src'));
await writeFile(join(workspaceDir, 'package.json'), JSON.stringify({
  name: 'dwi-restart-workspace',
  private: true,
  packageManager: 'pnpm@11.17.0',
  scripts: { build: 'tsc -p tsconfig.json', test: 'vitest run' },
  devDependencies: { typescript: '^5.9.3', vitest: '^4.1.10' },
}, null, 2));
await writeFile(join(workspaceDir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' },
  include: ['src'],
}, null, 2));
await writeFile(join(workspaceDir, 'src/index.ts'), 'export const answer = 42;\n');
await writeFile(join(workspaceDir, 'README.md'), '# DWI restart smoke workspace\n');
const downloadedExecutablePath = await downloadAndUnzipVSCode('1.134.0');
const vscodeExecutablePath = process.platform === 'darwin'
  ? join(dirname(downloadedExecutablePath), 'Code')
  : downloadedExecutablePath;
const vscodeCliPath = process.platform === 'win32'
  ? vscodeExecutablePath
  : process.platform === 'darwin'
    ? join(dirname(dirname(vscodeExecutablePath)), 'Resources', 'app', 'bin', 'code')
    : join(dirname(vscodeExecutablePath), 'bin', 'code');
const ciElectronArgs = process.platform === 'linux' && process.env.CI === 'true' ? ['--no-sandbox'] : [];

const install = spawnSync(vscodeCliPath, [
  ...ciElectronArgs,
  '--install-extension', vsix,
  '--force',
  '--extensions-dir', extensionsDir,
  '--user-data-dir', userDataDir,
], { stdio: 'inherit', timeout: 120000, killSignal: 'SIGKILL' });
if (install.error) throw install.error;
if (install.status !== 0) throw new Error(`VSIX installation failed with status ${install.status}, signal ${install.signal}`);
const installed = (await readdir(extensionsDir)).find((name) => name.startsWith('dwi-poc.developer-work-intelligence-'));
if (!installed) throw new Error('Installed DWI extension directory was not found.');

function sleep(ms) { return new Promise((resolveSleep) => setTimeout(resolveSleep, ms)); }

async function listTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) throw new Error(`CDP endpoint returned ${response.status}`);
  return response.json();
}

async function waitForMainTarget(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const target = (await listTargets(port)).find(({ type, url }) => type === 'page' && url.includes('workbench.html'));
      if (target) return target;
    } catch {}
    await sleep(100);
  }
  throw new Error(`VS Code workbench did not expose a CDP target on port ${port}.`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  async open() {
    await new Promise((resolveOpen, rejectOpen) => {
      this.socket.addEventListener('open', resolveOpen, { once: true });
      this.socket.addEventListener('error', rejectOpen, { once: true });
    });
  }
  send(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolveSend, rejectSend) => {
      this.pending.set(id, { resolve: resolveSend, reject: rejectSend });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function evaluateMain(target, expression) {
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.open();
  try {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  } finally {
    cdp.close();
  }
}

async function evaluateWebview(target, expression) {
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.open();
  try {
    await cdp.send('Page.enable');
    const tree = await cdp.send('Page.getFrameTree');
    const frameId = tree.frameTree.childFrames?.[0]?.frame?.id ?? tree.frameTree.frame.id;
    const world = await cdp.send('Page.createIsolatedWorld', { frameId, worldName: 'dwi-restart-smoke', grantUniveralAccess: true });
    const result = await cdp.send('Runtime.evaluate', { expression, contextId: world.executionContextId, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  } finally {
    cdp.close();
  }
}

async function clickMainButton(target, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const clicked = await evaluateMain(target, `(() => { const label = ${JSON.stringify(label)}; const button = Array.from(document.querySelectorAll('button,[role="button"]')).find((candidate) => candidate.textContent.trim().includes(label) || candidate.getAttribute('aria-label') === label); if (!button) return false; button.click(); return true; })()`);
    if (clicked) return;
    await sleep(100);
  }
  const labels = await evaluateMain(target, 'Array.from(document.querySelectorAll("button,[role=button]"), (candidate) => candidate.getAttribute("aria-label") || candidate.textContent.trim()).filter(Boolean).slice(0, 80)');
  throw new Error(`VS Code workbench button ${label} was not available. Visible labels: ${JSON.stringify(labels)}`);
}

async function sendMainInput(target, events) {
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.open();
  try {
    for (const event of events) await cdp.send('Input.dispatchKeyEvent', event);
  } finally {
    cdp.close();
  }
}

function keyEvents(text) {
  return [...text].flatMap((character) => {
    const code = character === ' ' ? 'Space' : `Key${character.toUpperCase()}`;
    const key = character === ' ' ? ' ' : character;
    return [
      { type: 'keyDown', text: character, key, code },
      { type: 'keyUp', key, code },
    ];
  });
}

async function runMainCommand(target, commandText) {
  // Prefixing Quick Access with `>` switches it to the command picker even
  // when the profile last used file search.
  await clickMainButton(target, 'Open Quick Access');
  await sleep(500);
  await sendMainInput(target, keyEvents(`> ${commandText}`));
  await sleep(500);
  await sendMainInput(target, [
    { type: 'keyDown', key: 'Enter', code: 'Enter' },
    { type: 'keyUp', key: 'Enter', code: 'Enter' },
  ]);
}

async function findWebview(port, surface) {
  const targets = (await listTargets(port)).filter(({ type, url }) => type === 'iframe' && url.startsWith('vscode-webview://'));
  for (const target of targets) {
    const state = await evaluateWebview(target, '({ text: document.body.innerText, surface: document.documentElement.dataset.dwiInitialSurface })');
    if (state.surface === 'optimizer') return { target, state };
  }
  throw new Error(`Installed Prompt Optimizer webview target was not found while checking ${surface}.`);
}

async function waitForWebview(port, surface, expected, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const found = await findWebview(port, surface);
      last = found.state.text;
      if (!expected || last.includes(expected)) return found;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Installed ${surface} webview did not contain ${JSON.stringify(expected)}. Last text: ${last.slice(0, 1000)}`);
}

async function clickWebviewButton(port, surface, label) {
  const { target } = await findWebview(port, surface);
  const clicked = await evaluateWebview(target, `(() => { const label = ${JSON.stringify(label)}; const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent.trim().includes(label) || candidate.getAttribute('aria-label') === label); if (!button) return false; button.click(); return true; })()`);
  if (!clicked) throw new Error(`Installed ${surface} webview button ${label} was not available.`);
}

async function setWebviewTextarea(port, surface, label, value) {
  const { target } = await findWebview(port, surface);
  const changed = await evaluateWebview(target, `(() => { const textarea = document.querySelector('textarea[aria-label=${JSON.stringify(label)}]'); if (!textarea) return false; const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; setter.call(textarea, ${JSON.stringify(value)}); textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
  if (!changed) throw new Error(`Installed ${surface} textarea ${label} was not available.`);
}

function descendants(pid) {
  try {
    const children = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean).map(Number);
    return children.flatMap((child) => [...descendants(child), child]);
  } catch { return []; }
}

function clickNativeButton(label) {
  if (process.platform !== 'darwin') throw new Error('The installed restart verifier requires macOS native modal automation.');
  const script = [
    'tell application "System Events"',
    'set wanted to ' + JSON.stringify(label),
    'repeat 100 times',
    'repeat with p in (every application process whose name is "Code")',
    'try',
    'repeat with w in (every window of p)',
    'if (name of w as text) is ' + JSON.stringify(workspaceWindowTitle) + ' then',
    'repeat with s in (every sheet of w)',
    'try',
    'click button wanted of s',
    'return "clicked"',
    'end try',
    'end repeat',
    'end if',
    'end repeat',
    'end try',
    'end repeat',
    'delay 0.1',
    'end repeat',
    'return "not-found"',
    'end tell',
  ];
  const result = spawnSync('osascript', script.flatMap((line) => ['-e', line]), { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout.includes('clicked')) {
    throw new Error(`Native VS Code confirmation ${JSON.stringify(label)} was not available: ${result.stderr || result.stdout}`);
  }
}

async function stopCode(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    if (liveChild === child) liveChild = undefined;
    return;
  }
  try { process.kill(child.pid, 'SIGTERM'); } catch {}
  const exited = await new Promise((resolveExit) => {
    const timer = setTimeout(() => resolveExit(false), 15000);
    child.once('exit', () => { clearTimeout(timer); resolveExit(true); });
  });
  if (exited) {
    if (liveChild === child) liveChild = undefined;
    return;
  }
  const pids = [...descendants(child.pid), child.pid];
  for (const pid of pids.reverse()) {
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
  if (child.exitCode === null && child.signalCode === null) await new Promise((resolveExit) => child.once('exit', resolveExit));
  if (liveChild === child) liveChild = undefined;
}

async function launchCode(port) {
  const environment = { ...process.env, VSCODE_PORTABLE: portableDir };
  delete environment.DWI_PACKAGED_SMOKE;
  delete environment.DWI_SMOKE_PHASE;
  const child = spawn(vscodeExecutablePath, [
    workspaceDir,
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    ...ciElectronArgs,
    `--remote-debugging-port=${port}`,
    '--extensions-dir', extensionsDir,
    '--user-data-dir', userDataDir,
    '--disable-workspace-trust',
  ], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (data) => process.stderr.write(String(data)));
  child.stderr.on('data', (data) => process.stderr.write(String(data)));
  child.on('error', (error) => { throw error; });
  liveChild = child;
  const target = await waitForMainTarget(port);
  return { child, target };
}

  console.log('DWI_SMOKE_RESTART_INSTALL_OK');
  let port = 9461;
  let optimizer;
  let session = await launchCode(port++);
  try {
  await runMainCommand(session.target, 'Open Prompt Optimizer');
  await waitForWebview(port - 1, 'optimizer', 'Initialize this project first');
  await clickWebviewButton(port - 1, 'optimizer', 'Open Project Initializer');
  await waitForWebview(port - 1, 'home', 'Check this project');
  await clickWebviewButton(port - 1, 'home', 'Check this project');
  clickNativeButton('Allow bounded check');
  await waitForWebview(port - 1, 'home', 'Review and approve');
  await clickWebviewButton(port - 1, 'home', 'Review and approve');
  clickNativeButton('Approve project details');
  await waitForWebview(port - 1, 'home', 'Confirm project brief');
  await clickWebviewButton(port - 1, 'home', 'Confirm project brief');
  await waitForWebview(port - 1, 'optimizer', 'Shape the task');
  console.log('DWI_SMOKE_RESTART_PROJECT_READY');
  await runMainCommand(session.target, 'Open Prompt Optimizer');
  await waitForWebview(port - 1, 'optimizer', 'Shape the task');
  await setWebviewTextarea(port - 1, 'optimizer', 'Task to optimize', 'installed restart persistence task');
  await clickWebviewButton(port - 1, 'optimizer', 'Continue to resolve');
  optimizer = await waitForWebview(port - 1, 'optimizer', 'Confirm the local interpretation');
  if (!/Local deterministic[\s\S]*Provider[\s\S]*Not required/.test(optimizer.state.text)) throw new Error('Installed restart seed did not produce a provider-free local candidate.');
  await clickWebviewButton(port - 1, 'optimizer', 'Continue to review');
  await waitForWebview(port - 1, 'optimizer', 'Review the local preview');
  await clickWebviewButton(port - 1, 'optimizer', 'Save to recents');
  await waitForWebview(port - 1, 'optimizer', 'Saved to recent prompts.');
  console.log('DWI_SMOKE_RESTART_SEED_OK');
  } finally {
    await stopCode(session.child);
  }

  session = await launchCode(port++);
  try {
  await runMainCommand(session.target, 'Open Prompt Optimizer');
  await waitForWebview(port - 1, 'optimizer', 'installed restart persistence task');
  await clickWebviewButton(port - 1, 'optimizer', 'Project Meta Context');
  await waitForWebview(port - 1, 'optimizer', 'Project metadata is ready');
  console.log('DWI_SMOKE_RESTART_CONTEXT_RESTORED');
  await clickWebviewButton(port - 1, 'optimizer', 'Prompt Optimizer');
  optimizer = await waitForWebview(port - 1, 'optimizer', 'installed restart persistence task');
  if (!/Review the local preview/.test(optimizer.state.text)) throw new Error('Installed optimizer did not resume its saved review after restart.');
  console.log('DWI_SMOKE_RESTART_SESSION_RESTORED');
  await clickWebviewButton(port - 1, 'optimizer', 'Prompt Optimizer settings');
  await waitForWebview(port - 1, 'optimizer', 'Reset Prompt Optimizer');
  await clickWebviewButton(port - 1, 'optimizer', 'Reset Prompt Optimizer');
  await waitForWebview(port - 1, 'optimizer', 'Reset prompt progress');
  await clickWebviewButton(port - 1, 'optimizer', 'Reset prompt progress');
  optimizer = await waitForWebview(port - 1, 'optimizer', 'Shape the task');
  if (optimizer.state.text.includes('installed restart persistence task')) throw new Error('Installed optimizer reset retained the draft.');
  console.log('DWI_SMOKE_RESTART_RESET_OK');
  } finally {
    await stopCode(session.child);
  }

  session = await launchCode(port++);
  try {
  await runMainCommand(session.target, 'Open Prompt Optimizer');
  optimizer = await waitForWebview(port - 1, 'optimizer', 'Shape the task');
  if (/installed restart persistence task|Review the local preview|Confirm the local interpretation/.test(optimizer.state.text)) throw new Error('Optimizer reset did not persist after the second restart.');
  console.log('DWI_SMOKE_RESTART_RESET_PERSISTED');
  } finally {
    await stopCode(session.child);
  }
  console.log('DWI_SMOKE_RESTART_EXTENSION_OK');
} finally {
  if (liveChild) await stopCode(liveChild);
  if (process.env.DWI_KEEP_RESTART_SANDBOX === '1') {
    console.error(`DWI_SMOKE_RESTART_SANDBOX_KEPT=${sandbox}`);
  } else {
    await rm(sandbox, { recursive: true, force: true });
  }
}
