const assert = require('node:assert/strict');
const vscode = require('vscode');

const smokePhase = process.env.DWI_SMOKE_PHASE || 'workspace';
const debugPort = Number(process.env.DWI_SMOKE_DEBUG_PORT || '9333');

async function debugTargets() {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
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
    if (state.surface === 'optimizer') return { target, state };
  }
  throw new Error(`Installed Prompt Optimizer webview target was not found while checking ${surface}.`);
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

async function setWebviewControl(target, selector, value) {
  const changed = await evaluateTarget(target, `(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!control) return false;
    const prototype = control instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : control instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : undefined;
    const setter = prototype && Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (!setter) return false;
    setter.call(control, ${JSON.stringify(value)});
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(changed, true, `Installed webview control ${selector} is available`);
}

async function webviewValue(target, expression) {
  return evaluateTarget(target, expression);
}

async function setCompactViewportAndTab(target) {
  const cdp = await connectCdp(target.webSocketDebuggerUrl);
  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 800, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  } finally {
    cdp.close();
  }
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
  await vscode.commands.executeCommand('dwi.openPromptOptimizer');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.ok(extension.isActive, 'DWI remains active after opening its view');
  if (smokePhase === 'no-workspace') {
    const generic = await waitForSurfaceText('optimizer', 'Open a folder to begin');
    const accessible = await webviewValue(generic.target, `(() => {
      const heading = document.querySelector('h1');
      const button = Array.from(document.querySelectorAll('button')).find((candidate) => candidate.textContent.trim().includes('Open Explorer'));
      return Boolean(heading?.textContent.includes('Open a folder to begin') && button && !button.disabled);
    })()`);
    assert.equal(accessible, true, 'No-workspace state exposes a labeled folder action');
    console.log('DWI_SMOKE_NO_WORKSPACE_OK');
    return;
  }
  let home = await waitForSurfaceText('optimizer', 'Initialize this project first');
  await clickWebviewButton(home.target, 'Open Project Initializer');
  home = await waitForSurfaceText('home', 'Check this project');
  await clickWebviewButton(home.target, 'Check this project');
  home = await waitForSurfaceText('home', 'Review and approve');
  await clickWebviewButton(home.target, 'Review and approve');
  home = await waitForSurfaceText('home', 'Confirm project brief');
  await clickWebviewButton(home.target, 'Confirm project brief');
  home = await waitForSurfaceText('optimizer', 'Shape the task');
  console.log('DWI_SMOKE_PROJECT_CONTEXT_APPROVED');
  await vscode.commands.executeCommand('dwi.open');
  home = await waitForSurfaceText('home', 'The reviewed knowledge layer is ready');
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
  const localCandidate = await webviewValue(optimizer.target, 'document.querySelector(`pre[aria-label="Generated prompt text"]`)?.textContent || ""');
  assert.ok(localCandidate.length > 0, 'Installed local candidate is captured before semantic execution');
  console.log('DWI_SMOKE_LOCAL_OPTIMIZER_SAVED');

  const loopbackBaseUrl = process.env.DWI_LOOPBACK_BASE_URL;
  assert.ok(loopbackBaseUrl?.startsWith('http://127.0.0.1:'), 'Installed semantic lane is bound to loopback');
  await clickWebviewButton(optimizer.target, 'Prompt Optimizer settings');
  let settings = await waitForSurfaceText('settings', 'LLM provider');
  await setWebviewControl(settings.target, 'select', 'openai-compatible');
  await new Promise((resolve) => setTimeout(resolve, 250));
  settings = await waitForSurfaceText('settings', 'Base URL');
  await setWebviewControl(settings.target, 'input[name="model"]', 'dwi-loopback-model');
  await setWebviewControl(settings.target, 'input[name="baseUrl"]', loopbackBaseUrl);
  await setWebviewControl(settings.target, 'input[name="apiKey"]', 'synthetic-loopback-value');
  await clickWebviewButton(settings.target, 'Check & save provider');
  settings = await waitForSurfaceText('settings', 'Connected');
  assert.match(settings.state.text, /Connected/, 'Loopback provider becomes ready only after its health response');
  console.log('DWI_SMOKE_LOOPBACK_PROVIDER_READY');

  await vscode.commands.executeCommand('dwi.openPromptOptimizer');
  optimizer = await waitForSurfaceText('optimizer', 'Review the local preview');
  await clickWebviewButton(optimizer.target, 'Rewrite with LLM');
  optimizer = await waitForSurfaceText('optimizer', 'Validated semantic enhancement');
  assert.match(optimizer.state.text, /Validated semantic execution\s*·\s*1 call/, 'Installed semantic route uses exactly one call');
  const semanticCandidate = await webviewValue(optimizer.target, 'document.querySelector(`pre[aria-label="Generated prompt text"]`)?.textContent || ""');
  assert.match(semanticCandidate, /installed loopback semantic path/, 'Installed semantic response applied one bounded section operation');
  assert.match(optimizer.state.text, /Estimated engineering token cost/, 'Installed semantic response exposes the validated projection');
  const focusBeforeTab = await webviewValue(optimizer.target, 'document.activeElement?.tagName === "H1"');
  assert.equal(focusBeforeTab, true, 'Installed semantic review moves focus to its heading');
  await setCompactViewportAndTab(optimizer.target);
  const reviewChecks = await webviewValue(optimizer.target, `(() => ({
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.querySelector('.review-card').scrollWidth <= document.querySelector('.review-card').clientWidth,
    copyNamed: Boolean(Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim().includes('Copy prompt'))),
    tabTargetNamed: Boolean(document.activeElement && /^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName) && (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent.trim()))
  }))()`);
  assert.equal(reviewChecks.noHorizontalOverflow, true, 'Installed compact review has no horizontal overflow');
  assert.equal(reviewChecks.copyNamed, true, 'Installed review exposes an accessible Copy prompt action');
  assert.equal(reviewChecks.tabTargetNamed, true, 'Installed compact review supports named keyboard focus traversal');
  console.log('DWI_SMOKE_SEMANTIC_ACCEPTED');

  await vscode.env.clipboard.writeText('');
  await clickWebviewButton(optimizer.target, 'Copy prompt');
  optimizer = await waitForSurfaceText('optimizer', 'Copied');
  assert.equal(await vscode.env.clipboard.readText(), semanticCandidate, 'Copy prompt writes the exact generated prompt');
  console.log('DWI_SMOKE_COPY_EXACT');

  await new Promise((resolve) => setTimeout(resolve, 400));
  await clickWebviewButton(optimizer.target, 'Rewrite again');
  optimizer = await waitForSurfaceText('optimizer', 'Local fallback retained');
  assert.match(optimizer.state.text, /PROVIDER_ERROR/, 'Transport failure exposes a stable fallback class');
  const fallbackCandidate = await webviewValue(optimizer.target, 'document.querySelector(`pre[aria-label="Generated prompt text"]`)?.textContent || ""');
  assert.equal(fallbackCandidate, localCandidate, 'Transport failure preserves the byte-identical deterministic candidate');
  assert.equal((await findWebview('optimizer')).state.surface, 'optimizer', 'Transport failure causes no navigation egress');
  console.log('DWI_SMOKE_SEMANTIC_FALLBACK');

  await clickWebviewButton(optimizer.target, 'Prompt Optimizer settings');
  optimizer = await waitForSurfaceText('optimizer', 'Reset Prompt Optimizer');
  await clickWebviewButton(optimizer.target, 'Reset Prompt Optimizer');
  optimizer = await waitForSurfaceText('optimizer', 'Reset prompt progress');
  await clickWebviewButton(optimizer.target, 'Reset prompt progress');
  optimizer = await waitForSurfaceText('optimizer', 'Shape the task');
  assert.doesNotMatch(optimizer.state.text, /installed smoke persistence task/, 'Reset clears installed optimizer draft');
  console.log('DWI_SMOKE_OPTIMIZER_RESET');

  await clickWebviewButton(optimizer.target, 'Project Meta Context');
  optimizer = await waitForSurfaceText('optimizer', 'Project metadata is ready');
  console.log('DWI_SMOKE_PROJECT_CONTEXT_RETAINED');

  console.log('DWI_SMOKE_PROMPT_OPTIMIZER_OPEN_OK');
}

module.exports = { run };
