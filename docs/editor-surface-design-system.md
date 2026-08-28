# DWI editor-surface design system

This is the living interaction contract for DWI's compact VS Code surface. The standalone workflow mock and `skin5(1).html` may inform density and composition; the running extension, semantic VS Code theme tokens, and this document define product behavior.

## Surface ownership

- **Home** resolves current state to one next action. With no workspace it hands off to VS Code Explorer. Before initialization it prioritizes Project Initializer. After initialization it exposes Prompt Optimizer and up to five explicitly saved prompt recents, ordered newest-first by `updatedAt`.
- **Project Initializer** owns bounded consent, local project collection, review/correction, and the persisted knowledge layer. It does not ask the user to select prompt modules.
- **Prompt Optimizer** owns the user task, template selection, automatic inclusion of reviewed project context, deterministic preview, explicit provider rewrite, review, copy, cancellation, and explicit save to recents.
- **Library** remains usable before initialization for global templates. Project-bound use must state the initialization prerequisite at the affected action.
- **Activity, Docs, and Settings** replace the content panel. Long explanations, evidence, diagnostics, and full history open in editor documents.

## State precedence

1. No workspace or invalid workspace context.
2. Recovery-required local state.
3. Initialization absent or consent invalid.
4. Project evidence collected but brief not reviewed.
5. Project initialized; show recent/relevant work and Prompt Optimizer entry.

Provider readiness never blocks Project Initializer. It gates Prompt Optimizer input and generation actions. `ready` means provider metadata is valid, the approved target was reached, and the selected model returned text.

## Provider health

The header keeps a concise Local indicator and adjacent notification bell. Badge placement is attached to the bell, severity uses VS Code semantic tokens, and the accessible label names the state. The popover is transient guidance only.

- `missing` or `unverified`: attention required; open Settings.
- `invalid-credential`: the key or its permission was rejected.
- `invalid-model`: the model is unavailable or does not support the request configuration.
- `quota`: quota, billing, or balance blocks requests.
- `rate-limit`: retry after a short delay.
- `timeout`: the provider did not respond in time.
- `connectivity`: network, DNS, TLS, proxy, or endpoint failure.
- `ready`: the model responded successfully.

Never label saved metadata as connected. Never collapse authentication, quota, invalid model, timeout, and connectivity into one generic warning.

## Layout and responsive behavior

The internal content root has a 350 px hard minimum. The outer VS Code webview is not widened. At compact widths, secondary labels collapse before controls wrap or clip. The first normal viewport exposes current context, state, and the next action. Page-level horizontal overflow is prohibited at and above 350 px.

Use VS Code typography, focus behavior, Codicon-like line icons, and `--vscode-*` semantic tokens. Avoid dashboards, nested card stacks, decorative gradients, permanent banners, and content overlays. Popovers are reserved for concise transient guidance and destructive confirmation.

## Accessibility and focus

- Every icon-only control has a programmatic name.
- Status uses text/icon/count in addition to color and is announced through `status` or `alert` only when appropriate.
- Panel replacement preserves a logical return target; Escape closes transient popovers and restores trigger focus.
- Disabled Optimizer controls explain the prerequisite through nearby visible copy and their accessible title/name.
- Results, long prompts, and disclosure content remain keyboard-scrollable with visible focus.

## Persistence and routing

Initialization remains versioned per workspace fingerprint and is migrated non-destructively. Provider credentials remain in VS Code SecretStorage; non-secret health metadata remains in extension global state. Generated rewrites are not added to recents until the user chooses **Save to recents**. Recents retain only the newest five per workspace and use their saved timestamp as the recency definition.

Webview-to-host optimizer traffic uses the `prompt-command.v2` identity envelope. Local compilation and LLM enhancement are separate commands. The host validates all messages, loads trusted project/template/provider context itself, supports cancellation, and never treats webview-supplied content as privileged state.

## Verification fixtures

Maintain deterministic coverage for no workspace, recovery, consent required, review required, initialized with no recents, initialized with recents, provider missing, invalid credential, invalid model, quota, rate limit, timeout, connectivity failure, local preview, pending/cancelled rewrite, successful rewrite, and saved recent. Inspect compact and normal widths, short/tall heights, keyboard focus, and both light and dark VS Code themes. Installed-host review is authoritative.
