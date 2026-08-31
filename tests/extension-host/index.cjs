const assert = require('node:assert/strict');
const vscode = require('vscode');

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
  console.log('DWI_SMOKE_OPEN_OK');
  await vscode.commands.executeCommand('dwi.openPromptOptimizer');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.ok(extension.isActive, 'DWI remains active after opening Prompt Optimizer');
  console.log('DWI_SMOKE_PROMPT_OPTIMIZER_OPEN_OK');
}

module.exports = { run };
