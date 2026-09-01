# DWI Prompt Optimizer — Plain-Language Presenter Notes

## Main message

DWI gives developers a safer and more consistent way to prepare AI-assisted work. It starts from project facts the developer has reviewed and approved, asks for clear task details, shows sources and assumptions, highlights important missing information, and keeps the decision with the developer. The structured workflow, safety controls, persistence, packaging, and core engineering checks are demonstrated; GitHub-hosted CI has independently repeated the repository checks.

The project-management connection, adaptive AI usage allowances, and group-level outcome feedback are future ideas. They are not built today.

Phase 4 exposed a clear decision-governance failure. The human approver approved calls, no retries, and monetary ceilings, but the contract prepared by the AI assistant added token ceilings that were never explicitly approved. One of those numbers became a decisive gate. The stop control worked; the earlier policy-authoring and authorization process did not.

## Slide guidance

### 1. A safer, more consistent way to use AI

Open with the business outcome. DWI aims to reduce repeated setup, uneven results, and unclear control while keeping the developer responsible for the final decision.

### 2. The management challenge

The problem is not only prompt wording. Delivery groups repeat project background, get uneven results, have no common way to plan AI allowances, and collect activity counts that do not show whether AI helped.

### 3. A simple way to prepare work

Explain the four steps in everyday language:

1. Reuse approved project facts.
2. Describe the work clearly.
3. Show sources, assumptions, and what is missing.
4. Let the developer check, correct, and save the result.

DWI can show important missing information today. The guided one-question answer or skip step is not finished.

### 4. A simple example

A polished generic answer can still miss local deployment rules or assume the wrong level of risk. Approved project facts make the result easier to trust and review.

### 5. Current benefits

Emphasize less setup time, fewer missed requirements, lower mental effort, easier review, shared understanding, and developer control. These benefits stand on their own. Phase 4 must still be named as a governance failure; live-AI quality remains unmeasured because the comparison never began.

### 6. What leaders can see now

Show only current behavior: approved project facts, clear task details, visible sources and assumptions, important missing information, a local draft, save, and reset of one task without deleting project knowledge.

### 7. Future direction

Define each future term when it first appears:

- A **project-management system** is the tool holding planned tasks, priority, risk, and timing.
- An **adaptive AI allowance** is a planned cap based on approved task and project needs, sprint capacity, expected output, and fixed service overhead. It stays inside hard privacy, spending, and call limits. It may also be called a token budget.
- A **decision provenance record** names the approved requirement, human approver, calculation, version, test, and rollback behind a pivotal rule.
- **Outcome-only feedback** records whether the workflow helped without copying prompts, output, code, project content, file paths, or employee names.

The allowance never approves spending or external AI use. A declarative file can record an approved rule, but it cannot create approval. An imperative policy check must reject missing authority before execution. Adaptive means planned for the work—not a number DWI can raise after seeing a result. The developer still reviews the result. Group-level feedback improves guidance, training, and delivery processes; it must never rank employees.

### 8. Who this helps

- Developers get clearer daily work.
- Delivery leads see shared gaps and handoff patterns.
- Software delivery operations see delays, fallback use, and adherence to agreed allowances.
- Management and the AI Center of Excellence see useful adoption, training needs, and overall capacity.

Report by workflow or group. Never copy work content, rank people, or use feedback for performance scoring.

### 9. Learn in stages

The next decision is not production rollout. The proposed sequence is:

1. Try the current local demo.
2. Finish the guided question and repeat the restart check on the same version.
3. Audit every pivotal limit, default, multiplier, exception, fallback, and approval claim.
4. Build and dry-run an approval-led decision mechanism that cannot make an unapproved number executable.
5. Consider one small controlled pilot.

## Safe statements

- Phase 5 proof-of-concept implementation and the Phase 6 local proof-of-concept qualification matrix passed; the functional branch is published, and exact-commit GitHub CI passed.
- DWI currently starts from project facts the developer has reviewed and approved.
- The current local journey can prepare, review, save, and reset task work without requiring external AI use.
- DWI can show important missing information.
- AI usage figures are estimates, not bills.
- Phase 4 exposed a clear decision-governance failure; prompt quality remains unmeasured because the comparison never began.

## Boundaries to state clearly

- The guided one-question answer and application step is incomplete.
- The packaged restart, resume, reset, and project-context preservation journey has passed. A later automated repeat was blocked because macOS automation could not reach the consent window; this was not a product-flow failure or a new pass.
- The human approver approved maximum calls, no retries, and monetary ceilings. The contract prepared by the AI assistant separately introduced 20,000 aggregate, 120,000 evaluation, and 12,000 per-completion token ceilings without explicit approval from the human approver.
- The successful readiness response reported 14,531 tokens and crossed the unapproved 12,000 ceiling. The budget control then closed the run before any business task, optimized output, or quality comparison. Fail-closed enforcement worked; the policy-authoring and approval process failed.
- The token check happened after the response, so it could stop later calls but not the first call’s use. The approved dollar ceilings were recorded, but available pricing and billing data could not enforce or prove actual cost.
- Phase 4 is deliberately frozen. The human approver did not authorize a retry or ceiling increase, and the AI assistant did not perform either action. The evidence remains retained so the failure cannot be tuned into a pass.
- Before Phase 4 resumes, audit every decision-bearing limit, default, multiplier, exception, fallback, routing choice, data rule, scoring threshold, and phase gate. Missing approval must stop execution before an external call.
- The future mechanism must be approval-led and imperative in decision: derive an adaptive allowance from approved inputs, explain it, and keep privacy, spending, and maximum-call limits fixed.
- Project-management integration, adaptive task allowances, and management reporting are future ideas.
- No production, merge-to-main, tag, release, external-AI authorization, or employee-monitoring claim is implied.

## Recommended question

Is the current workflow useful enough to justify a small, controlled dry-run of the future project-management, AI-limit, and feedback model?
