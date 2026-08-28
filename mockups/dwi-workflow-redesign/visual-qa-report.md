# DWI Prompt Workflow Redesign — QA Report

Date: 2026-08-27

## Outcome

- Replaced the separate Project intelligence primary surface with one Prompt workflow.
- Integrated bounded project checking, review, approval, brief confirmation, prompt-content selection, generation, and evaluation into the sequence where each action is needed.
- Added a persistent four-step progress strip with a visible Reset action and a keyboard-contained confirmation.
- Kept project approval and brief confirmation host-authoritative and persisted before compilation.
- Blocked confirmation for conflicting or unsupported project details, while approved partial details can continue with explicit open questions.
- Added clear recovery routes for stale projects, missing review, invalid candidates, failed reset requests, and project-detail conflicts.
- Replaced wide module rows with compact, accessible checkbox controls and inline help.
- Moved activity, diagnostics, privacy, provider settings, and project evidence into compact secondary panels.

## Automated verification

- Host typecheck: passed.
- Webview typecheck: passed.
- Full repository suite: 245 tests passed.
- VSIX build: passed.
- Isolated VS Code install, activation, and view-open smoke test: passed.
- `git diff --check`: passed.
- Lint: not runnable because the repository scripts reference `eslint`, but ESLint is not installed in the workspace (`spawn ENOENT`).

## Visual verification

- Browser-hosted webview reviewed in dark and light themes at 240 × 500, 320 × 650, 520 × 500, and 520 × 800 pixels.
- Tested empty, loading, scanning, populated, error, longest-content, Access, Project brief, Prompt content, Review, Information, raw diagnostics, activity-detail popovers, and optional feedback.
- No document, shell, panel, or content-level horizontal overflow at any checked width.
- Primary state and action remain visible in the first normal viewport; the final Copy prompt action also remains visible at 240 × 500.
- Long project names now clamp cleanly and stack above status at compact widths; the 320 × 650 longest-content fixture keeps Confirm project brief in view.
- Activity-detail and feedback Escape handling returns focus to the opener, and dialog/reset focus remains contained.
- Review outcome: **approved after fixes** for the browser-hosted webview. Installed-host chrome, theme tokens, and focus styling remain visually unassessed.

## Standalone HTML mock

- Added `index.html`, a self-contained DOM/CSS/JavaScript recreation with no external assets, build step, provider calls, or project mutations.
- Includes deterministic Access, Project brief, Prompt content, and Review stages; populated, loading, error, empty, and longest-content fixtures; 420, 320, and 240-pixel widths; and light/dark themes.
- Includes activity, diagnostics, privacy, and provider-settings panels; activity-detail, source, and module popovers; a default-collapsed raw diagnostic dump and feedback form; reset confirmation; prompt-content selection; and end-to-end stage progression.
- Responsive behavior is driven by the mock frame container, so the 420, 320, and 240-pixel controls activate the same compact reflow rules even in a wide browser. Popovers are bounded to the selected frame.
- Static DOM interaction checks passed for source-aligned recovery fixtures, nested-popover dismissal, visible-control dialog focus containment (including forward and reverse Tab routing from focused activity-detail popovers), reset and feedback focus return, feedback pressed state, Home/End tab navigation, Settings opening, and narrow-width state selection.
- Inline-script syntax, duplicate-ID, referenced-ID, whitespace, and external-resource checks passed.
- Browser-rendered replay passed in dark and light themes at the 420, 320, and 240-pixel presets. The selected frame activated the expected two- and one-column reflow, popovers stayed inside the frame, supporting controls retained visible focus, primary actions remained reachable, and the inner application and panels had no horizontal overflow.
- Review outcome: **approved after fixes** for the standalone mock.

## Package

`apps/dwi-host/developer-work-intelligence-0.1.0.vsix`

The final VSIX was also force-installed into the normal local VS Code profile. A fresh visual replay inside that installed VS Code window could not be completed because macOS was locked; the isolated extension-host smoke test and browser-rendered workflow QA both passed.

Packaging warnings remain unchanged: the extension has no LICENSE file and is not bundled, so the VSIX contains 369 files.
