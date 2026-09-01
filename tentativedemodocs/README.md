# DWI Prompt Optimizer demonstration pack

These materials explain in plain language the value already demonstrated by the working proof of concept, its clear evidence boundaries, and a responsible direction for scaling AI adoption across software delivery.

## Deliverables

- `DWI-Prompt-Optimizer-Management-Demo.pptx` — nine-slide editable management presentation with complete speaker notes.
- `DWI-Prompt-Optimizer-Management-Demo-Notes.md` — standalone presenter notes and safe-statement guide.
- `DWI-Prompt-Optimizer-Management-Brief.docx` — editable 14-page plain-language management document.
- `DWI-Prompt-Optimizer-Management-Brief.pdf` — fixed-layout 14-page version of the management document.
- `DWI-Prompt-Optimizer-Management-Brief.md` — reviewable source for the management document.
- `SHA256SUMS` — integrity hashes for the five final deliverables.

## Value demonstrated today

DWI starts with project facts that the developer has reviewed and approved. Prompt Optimizer then helps describe the task, shows the sources and assumptions used, highlights important missing information, prepares a local draft for review, saves work, and can reset the current task without deleting approved project knowledge. Core repository, build, package, and activation/open checks have also been repeated by exact-commit GitHub-hosted CI.

The consolidated pack is designed to support a focused four-day management proof of concept using the existing product and evidence rather than restart a four-month discovery exercise. This is a sponsor planning estimate, not a production-delivery benchmark.

## Phase 4 governance finding

Phase 4 exposed a clear decision-governance failure. The owner approved maximum calls, no retries, and monetary ceilings. During contract preparation by the AI assistant, 20,000 aggregate, 120,000 evaluation, and 12,000 per-completion token ceilings were added without explicit owner approval. The successful readiness response reported 14,531 tokens and crossed the unapproved 12,000 ceiling, so the budget control closed the run before any business task or quality comparison. The check happened after the response, so it could stop later calls but not the first call’s use. The approved dollar ceilings were documented, but available pricing and billing data could not enforce or prove actual cost.

The stop control worked and the evidence was preserved. The earlier decision and authorization process failed. Phase 4 is deliberately frozen with no retry and no ceiling change while DWI audits every pivotal limit, default, multiplier, exception, fallback, routing choice, data rule, scoring threshold, and phase gate. Prompt quality remains unmeasured because the comparison never began.

## Future direction

A future optional connection to the project-management system could use approved task details to suggest a clear, adaptive AI usage allowance. A declarative file may record an approved rule, but it cannot create approval. An imperative decision layer must trace every input, default, multiplier, formula, exception, and hard limit to a named owner and approved requirement, reject missing authority before an external call, explain the calculation, and reconcile planned and observed use.

Outcome-only feedback could help improve tools, training, and delivery practices without copying prompts, code, or project content and without ranking employees. These future features are not built today, and an adaptive allowance would never authorize spending or external AI use.

This pack does not claim production readiness, merge to main, release, project-management integration, management reporting deployment, employee monitoring, or external AI authorization.
