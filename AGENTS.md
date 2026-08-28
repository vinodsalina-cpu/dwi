# DWI product direction

Treat DWI as a post-login project-initialization experience. Its first essential job is to establish a persistent, consent-based knowledge layer for the active project: identify the project root, collect only the bounded evidence needed for a useful project brief, let the developer review and correct that brief, and persist the approved initialization state for later prompt work.

Every DWI-related design, implementation, mock, test fixture, and documentation change must preserve and make this initialization journey explicit. Do not present DWI as a generic prompt editor or a collection of disconnected tools. The prompt workflow and reusable assets build on the initialized project knowledge layer.

Use the approved standalone HTML mock at `mockups/dwi-workflow-redesign/index.html` as the current visual interaction reference when it applies. Keep the UI focused: show only what a developer needs for the current step, and place supporting or internal detail behind an accessible disclosure or information control.
