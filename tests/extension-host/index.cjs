const assert = require('node:assert/strict');
const vscode = require('vscode');

async function debugTargets() {
  const response = await fetch('http://127.0.0.1:9333/json/list');
  assert.equal(response.ok, true, 'VS Code debugging endpoint is available');
  return response.json();
}

async function connectCdp(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return {
    send(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

async function evaluateTarget(target, expression) {
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  try {
    await cdp.send('Page.enable');
    const tree = await cdp.send('Page.getFrameTree');
    const frameId = tree.frameTree.childFrames?.[0]?.frame?.id ?? tree.frameTree.frame.id;
    const world = await cdp.send('Page.createIsolatedWorld', { frameId, worldName: 'dwi-installed-smoke', grantUniveralAccess: true });
    const result = await cdp.send('Runtime.evaluate', { expression, contextId: world.executionContextId, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  } finally {
    cdp.close();
  }
}

async function findWebview(surface) {
  const targets = (await debugTargets()).filter(({ type, url }) => type === 'iframe' && url.startsWith('vscode-webview://'));
  for (const target of targets) {
    const state = await evaluateTarget(target, '({ text: document.body.innerText, surface: document.documentElement.dataset.dwiInitialSurface })');
    if (state.surface === surface) return { target, state };
  }
  throw new Error(`Installed ${surface} webview target was not found.`);
}

async function clickWebviewButton(target, label) {
  const clicked = await evaluateTarget(target, `(() => { const label = ${JSON.stringify(label)}; const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent.trim().includes(label) || candidate.getAttribute('aria-label') === label); if (!button) return false; button.click(); return true; })()`);
  assert.equal(clicked, true, `Installed webview button ${label} is available`);
}

async function waitForSurfaceText(surface, expected, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const webview = await findWebview(surface);
      last = webview.state.text;
      if (last.includes(expected)) return webview;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Installed ${surface} webview did not contain ${JSON.stringify(expected)}. Last text: ${last}`);
}

async function setWebviewTextarea(target, label, value) {
  const changed = await evaluateTarget(target, `(() => {
    const textarea = document.querySelector('textarea[aria-label=${JSON.stringify(label)}]');
    if (!textarea) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, ${JSON.stringify(value)});
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(changed, true, `Installed webview textarea ${label} is available`);
}

async function run() {
  const extension = vscode.extensions.getExtension('dwi-poc.developer-work-intelligence');
  assert.ok(extension, 'DWI extension is discoverable after VSIX installation');
  await extension.activate();
  assert.equal(extension.isActive, true, 'DWI extension activates');
  console.log('DWI_SMOKE_ACTIVATED');
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('dwi.open'), 'dwi.open command is registered');
  assert.ok(commands.includes('dwi.openPromptOptimizer'), 'dwi.openPromptOptimizer command is registered');
  await vscode.commands.executeCommand('dwi.open');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.ok(extension.isActive, 'DWI remains active after opening its view');
  let home = await findWebview('home');
  await clickWebviewButton(home.target, 'Start initialization');
  home = await waitForSurfaceText('home', 'Check this project');
  await clickWebviewButton(home.target, 'Check this project');
  home = await waitForSurfaceText('home', 'Review and approve');
  await clickWebviewButton(home.target, 'Review and approve');
  home = await waitForSurfaceText('home', 'Confirm project brief');
  await clickWebviewButton(home.target, 'Confirm project brief');
  home = await waitForSurfaceText('home', 'The reviewed knowledge layer is ready');
  console.log('DWI_SMOKE_PROJECT_CONTEXT_APPROVED');
  console.log('DWI_SMOKE_OPEN_OK');
  await vscode.commands.executeCommand('dwi.openPromptOptimizer');
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.ok(extension.isActive, 'DWI remains active after opening Prompt Optimizer');
  let optimizer = await waitForSurfaceText('optimizer', 'Shape the task');
  await setWebviewTextarea(optimizer.target, 'Task to optimize', 'installed smoke persistence task');
  await clickWebviewButton(optimizer.target, 'Continue to resolve');
  optimizer = await waitForSurfaceText('optimizer', 'Confirm the local interpretation');
  assert.match(optimizer.state.text, /Local deterministic[\s\S]*Provider[\s\S]*Not required/, 'Installed resolve is provider-free and locally deterministic');
  await clickWebviewButton(optimizer.target, 'Continue to review');
  optimizer = await waitForSurfaceText('optimizer', 'Review the local preview');
  await clickWebviewButton(optimizer.target, 'Save to recents');
  optimizer = await waitForSurfaceText('optimizer', 'Saved to recent prompts.');
  console.log('DWI_SMOKE_LOCAL_OPTIMIZER_SAVED');

  await clickWebviewButton(optimizer.target, 'DWI settings');
  optimizer = await waitForSurfaceText('optimizer', 'Reset Prompt Optimizer');
  await clickWebviewButton(optimizer.target, 'Reset Prompt Optimizer');
  optimizer = await waitForSurfaceText('optimizer', 'Reset prompt progress');
  await clickWebviewButton(optimizer.target, 'Reset prompt progress');
  optimizer = await waitForSurfaceText('optimizer', 'Shape the task');
  assert.doesNotMatch(optimizer.state.text, /installed smoke persistence task/, 'Reset clears installed optimizer draft');
  console.log('DWI_SMOKE_OPTIMIZER_RESET');

  console.log('DWI_SMOKE_PROMPT_OPTIMIZER_OPEN_OK');
}

module.exports = { run };
