# DWI Prompt Optimizer

## Management Brief, Current Evidence, and Future Direction

**Plain-language purpose:** what works today, where the limits are, and how DWI could later support responsible AI adoption

**Evidence date:** 1 September 2026

**Audience:** business, engineering, delivery, operations, and AI leadership

**Product evidence version:** `5088dbf6e5fdeea2415b991c429de8e5229d7a7b`

**Status:** local proof of concept; future ideas are clearly marked and are not built yet

> **Important boundary.** This document does not claim production readiness, live external-AI output quality, release approval, project-management integration, or a deployed management reporting system.

<!-- pagebreak -->

## Executive summary

DWI helps developers give AI the right project background before asking it to do work. After login, it gathers a limited set of project facts with the developer’s consent, shows those facts for review and correction, and saves only the approved project summary. Prompt Optimizer then reuses that approved knowledge for later tasks. It is more than a generic prompt editor.

The current local proof of concept provides a consistent journey: review approved project facts, describe the work, see sources and assumptions, identify important missing information, prepare a local draft, review it, save it, or reset the current task without deleting approved project knowledge. Engineering checks passed on the recorded implementation version, including 421 tests, type checks, packaging, local installed checks, narrow-screen review, and successful continuous-integration checks.

Three limits must remain clear:

- DWI can show an important unanswered question, but the guided one-question-at-a-time answer step is not finished.
- The latest automated restart check could not run because macOS automation could not reach the consent window. This is not evidence of a product failure, but it is also not a new pass. Earlier restart evidence remains available.
- Phase 4 testing of result quality from a live external AI service remains blocked because the agreed 12,000-token usage limit was exceeded. No retry was made.

The future opportunity is to connect approved task information from a project-management system to DWI. Agreed rules could turn task priority, risk, and complexity into a clear AI usage limit. DWI’s internal prompt-building engine could use that limit when deciding how much approved context to include. Separately, outcome-only feedback—such as helpful or not helpful, corrected, saved, reset, time taken, and limit adherence—could be grouped for management insight without copying prompts, generated output, code, project content, file paths, or employee names.

These future features are not built today. A usage limit would never authorize spending or external AI use, and feedback would improve tools, training, and delivery practices—not rank or monitor individual employees.

### Recommendation

Demonstrate the current proof of concept with representative work, finish the guided clarification and restart checks, agree the privacy and spending guardrails, run the proposed allocation in dry-run mode, and only then consider one small controlled pilot.

<!-- pagebreak -->

## 1. The management challenge

AI use can spread quickly while each team develops its own habits. Without a shared approach, the organization may see more activity without knowing whether work is becoming faster, clearer, safer, or easier to review.

### Four common problems

| Problem | What it means in everyday work | Why leaders should care |
|---|---|---|
| Repeated setup | Developers explain the same project background again for each task and tool | Time is lost and the same facts are described differently |
| Uneven results | Important rules, risks, and assumptions may be missing | Polished-looking work can still create review effort or rework |
| Unclear AI effort | Priority and complexity are not linked to an agreed usage limit | AI capacity and cost are harder to plan and explain |
| Little useful feedback | Usage counts show activity, not whether AI actually helped | Leaders cannot target training, tools, or process improvements confidently |

### The opportunity

DWI offers one clear way of working from approved project knowledge to a reviewed result. The aim is not to remove human judgment. The aim is to give developers a better starting point, make assumptions visible, and keep decisions with the developer.

This creates a possible foundation for responsible growth later: project priority can inform a clear limit, work remains reviewable, and privacy-safe outcome information can help improve the system.

<!-- pagebreak -->

## 2. What DWI does today

### Start with project knowledge the developer approves

DWI begins after login with a limited project check. The developer is told what will be inspected and gives consent. DWI prepares a short project summary, and the developer can review, correct, and approve it.

That approved project summary is saved for later work. In the product it is called **Project Meta Context**. In plain terms, it is the agreed set of project facts that later tasks may reuse.

### The current journey

| Step | What the developer does | What DWI contributes |
|---|---|---|
| 1. Review project facts | Checks and approves the project summary | Reuses bounded project knowledge instead of starting from nothing |
| 2. Describe the task | Enters the task, expected result, and importance | Gives each AI-assisted task a consistent starting form |
| 3. See what is known | Reviews sources, assumptions, and missing information | Shows where information came from and where an answer is still needed |
| 4. Prepare a local draft | Moves through the local preparation steps | Produces a rule-based draft without requiring an external AI service |
| 5. Review and decide | Corrects, saves, copies, or rejects the work | Keeps the final decision with the developer |
| 6. Reset one task | Clears the current task when needed | Keeps the approved project facts for the next task |

### What works today and what does not

| Available in the local proof of concept | Not available or not proven today |
|---|---|
| Approved project summary | Production-wide rollout |
| Clear task and importance fields | Finished guided question-and-answer step |
| Visible sources and assumptions | Proven quality improvement from a live external AI service |
| Important missing information shown | Project-management system connection |
| Local rule-based draft and review | Automatic task-based AI usage limits |
| Saved work and safe task reset | Management dashboards or group reporting |

<!-- pagebreak -->

## 3. Benefits for people and delivery

### Benefits visible in the local proof of concept

- **Less setup time:** approved project knowledge can be reused instead of explained again.
- **Fewer missed requirements:** known rules and constraints stay visible while work is prepared.
- **Less mental effort:** developers spend less time searching, repeating, and tracking information across tools.
- **Easier review:** sources, assumptions, and decisions are simpler to check.
- **Shared understanding:** teams can begin from the same approved project facts.
- **Developer control:** the developer reviews, corrects, saves, or resets the work.

### Value at each level

| Level | Main benefit | Decision supported |
|---|---|---|
| Developer | Clearer day-to-day work with less repeated setup | Which support helps this task |
| Team lead | More consistent handoffs and fewer recurring knowledge gaps | Which shared knowledge or team practice needs improvement |
| Software delivery operations | Better view of delays, fallback use, and process friction | Which delivery or platform problem to fix first |
| Management and AI Center of Excellence | Better view of useful adoption, training needs, and overall capacity | Where to invest, expand, constrain, or stop |

### Why this is different from measuring usage alone

More prompts or more AI activity do not automatically mean more value. High activity may indicate repeated attempts, confusion, or poor results. Management should look at usefulness, correction effort, time to a usable draft, safe fallback, and adherence to agreed limits—not just volume.

<!-- pagebreak -->

## 4. What remains unfinished

### 4.1 The guided question step

DWI can identify important missing information and show a material question. The next user-facing step is not complete: ask one short question, let the developer answer or skip it, apply the answer only to the current task, and avoid using an old answer after the task or project facts change.

This should be finished before future project-management data is allowed to change how much context DWI uses.

### 4.2 The latest restart check

Earlier testing showed that approved project facts and saved task work could survive a restart, and that resetting one task did not remove approved project knowledge.

The latest repeat of this check could not begin because macOS automation could not see the consent window in the temporary test copy of VS Code. Three attempts stopped before testing the product flow. This is a test-automation problem, not proof of a product failure, but it is also not a new pass for the latest version.

### 4.3 Live external-AI output quality

The local product and its safety checks do not prove that an external AI service improves the result. The one approved readiness call used 14,531 AI usage units, often called **tokens**, against an agreed limit of 12,000.

The process stopped safely. No quality test followed, no comparison benchmark ran, and no retry was made. A future attempt would need separate approval covering the external service, information that may be sent, retention, maximum calls, and cost.

### 4.4 Production and release

The proof of concept is not a production release. It has not been merged to the main branch, tagged as a baseline, released through a marketplace, or approved for broad rollout.

<!-- pagebreak -->

## 5. Future direction: project-management data, clear AI limits, and safe feedback

These ideas describe a possible next stage. They are not built into the current product.

### 5.1 Optional project-management connection

A future connection to a project-management system could provide a small approved set of task details:

- task or work-item reference;
- delivery period or sprint;
- type of work;
- priority;
- risk or importance;
- broad complexity band;
- delivery stage;
- version of the approved company rule.

DWI should still work when this connection is unavailable. The project-management system should not become a required dependency for the basic local journey.

### 5.2 Clear AI usage limit

Agreed company rules could turn approved task details into a clear usage limit. This is sometimes called a **token budget**, because tokens are the units used to measure AI input and output.

The limit could help DWI decide how much approved project context to include and how deeply to prepare the task. The order of control should remain simple:

`Consent and privacy → hard safety limits → company rules → task limit → DWI prepares the work → explicit external-AI action → developer review`

The usage limit must never:

- approve spending;
- approve external AI use;
- raise a hard safety limit;
- send information without a clear user action;
- replace developer review.

### 5.3 Outcome-only feedback

Future feedback could record simple outcomes without copying the work itself:

- helpful, mixed, or not helpful;
- saved, reused, corrected, reset, or abandoned;
- type of correction, without the text;
- missing question answered or skipped;
- local fallback used;
- broad time band;
- estimated and observed AI usage where available;
- stayed within the agreed limit or stopped safely.

This feedback could help improve guidance, training, budgets, and delivery processes. It must not copy prompts, generated results, code, project content, file paths, free-text notes, or employee names.

### 5.4 The future improvement loop

`Approved task details → agreed company rule → clear AI usage limit → DWI prepares work → developer decision → outcome-only feedback → group-level improvement`

The loop should advise people. It should not automatically change safety rules or score an employee.

<!-- pagebreak -->

## 6. Management goals and useful measures

| Management goal | Useful information | Decision it supports |
|---|---|---|
| Useful AI adoption | Helpful outcomes, save or reuse, correction type, workflow coverage | Where AI helps and where training or redesign is needed |
| Predictable AI capacity and cost | Usage limit, observed use, limit adherence, time band | Capacity planning, budget bands, and exception rules |
| Better delivery quality | Missing-information rate, correction patterns, rework, fallback | Which workflow stages need better context or checks |
| More consistent knowledge | Reuse of approved project facts, recurring missing-information categories | Which project knowledge or guidance needs improvement |
| Responsible control | Consent state, rule version, safe-stop reason, explicit action | Whether safeguards are working as intended |
| Better developer experience | Usefulness, correction burden, reset or abandon outcome | Tool, training, and support priorities |

### Recommended measures for a small pilot

- use of approved project knowledge;
- time to a developer-usable first draft;
- important missing information found and resolved;
- accepted, corrected, abandoned, or reset outcome;
- avoidable rework category;
- fallback and failure rate;
- difference between estimated and observed AI usage;
- percentage of work staying within the agreed limit;
- usefulness by workflow or group;
- opt-out and deletion requests handled correctly.

Each measure should answer a real decision. If no decision would change, the organization should not collect the data.

<!-- pagebreak -->

## 7. Privacy, employee trust, and spending safeguards

### Non-negotiable rules

- DWI continues to work without a project-management or reporting service.
- The developer approves project facts before they are reused.
- Moving through the local steps does not call an external AI service.
- An AI usage limit is a cap, not permission to spend or transmit information.
- Hard privacy and safety limits always take priority over task urgency.
- The developer reviews the result and decides what to keep.
- Raw prompts, generated results, code, project files, paths, and free-text notes stay out of management reporting.
- Reports are grouped by workflow or a sufficiently large group, not by named person.
- Individual ranking, performance scoring, and disciplinary use are prohibited.
- People can understand the data collected, its purpose, retention, access, and deletion rules.

### Information handling in plain language

| Information | Example | Default handling |
|---|---|---|
| Approved project facts | Reviewed project summary | Kept with the local project; not copied into management reporting |
| Task content | Prompt, source text, generated draft | Kept local to the task; excluded from reusable reporting |
| Optional written feedback | Developer’s free-text note | Local unless the developer separately chooses to share it |
| Outcome-only feedback | Helpful, saved, corrected, time band | May be grouped only under a reviewed privacy agreement |
| Project-management details | Priority, risk, delivery stage | Keep to the minimum fields needed for the agreed rule |
| Company rule | Version, limit, reason | Recorded so the decision can be explained and rolled back |

### Employee-trust rule

The feedback loop exists to improve the product, training, project knowledge, and software delivery. It is not a measure of individual developer productivity.

<!-- pagebreak -->

## 8. Recommended path from demo to small pilot

### Stage 1 — Try the current local demo

- use representative developer work;
- look for clearer tasks, reused project facts, fewer omissions, and easier review;
- collect local qualitative feedback without centralizing raw content;
- decide whether the idea is useful enough to continue.

### Stage 2 — Finish the core experience

- complete the guided one-question answer or skip step;
- ensure an old answer cannot affect a changed task;
- repeat the restart, resume, and reset journey on the same version;
- record the exact product version and result.

### Stage 3 — Agree the guardrails

- choose one target workflow;
- define the minimum project-management fields;
- agree the AI usage limits, priority order, exceptions, and stop switch;
- agree what outcome information may be collected;
- agree retention, access, grouping, deletion, and opt-out rules;
- choose success and stop measures before the pilot.

### Stage 4 — Run a dry-run

- calculate suggested limits without changing real work;
- test missing or old project-management data;
- test urgent tasks that conflict with a hard limit;
- confirm the dry-run cannot approve spending or call an external AI service;
- check that every suggested limit is understandable.

### Stage 5 — Consider one small controlled pilot

- use one workflow, one group, one rule version, one time period, and one agreed maximum;
- keep external AI use explicit and human review mandatory;
- stop on a privacy, safety, or spending-rule breach;
- decide whether to improve, expand, constrain, or stop.

<!-- pagebreak -->

## 9. Management decision

### Decision requested now

Experience the current local proof of concept and decide whether it is useful enough to justify completing the core experience and designing a small dry-run.

### Decisions not requested now

- production rollout;
- release or marketplace publication;
- live external-AI quality testing;
- permission to spend or transmit project information;
- project-management system integration;
- management reporting deployment;
- employee monitoring;
- merge to the main branch or product baseline approval.

### Questions for the meeting

1. Does starting from approved project knowledge solve a meaningful delivery problem?
2. Which one workflow would provide the clearest, lowest-risk demonstration?
3. Which outcomes would prove usefulness beyond simple activity counts?
4. Which privacy, employee-trust, and spending rules are non-negotiable?
5. Who should own the dry-run decision and the stop decision?

### Recommended management question

> Is the current workflow useful enough to justify a small, controlled dry-run of the future project-management, AI-limit, and feedback model?

<!-- pagebreak -->

## Appendix A — Engineering evidence and exact version

This appendix records the main evidence without changing the plain-language management claim.

| Evidence item | Recorded result |
|---|---|
| Product evidence version | `5088dbf6e5fdeea2415b991c429de8e5229d7a7b` |
| Repository checks | 421 passed: 104 prompt optimizer, 31 workspace, 66 core, 16 catalog, 172 host, and 32 webview |
| Type checks | All six package checks passed |
| Schema check | No unexpected change |
| Build and package | Passed |
| Package contents | 387 files; 684,130 bytes |
| Package SHA-256 | `954ce0102754b79f7b3503bfe0c9053ba30ae21ab95177cc55d28c7643d2567b` |
| Installed local flow | Passed for the recorded same-process journey |
| Narrow-screen review | 360 × 640 review rendered without horizontal overflow |
| Exact-version CI | Verify DWI passed for the recorded implementation version |

### Restart evidence boundary

An earlier version passed the full restart, resume, and reset journey. The latest repeat was blocked before product checks because macOS automation could not see the consent window. The earlier result remains valid for its version; the latest version still needs its own fresh result.

### Live external-AI quality boundary

One approved readiness call reported 14,531 tokens against an agreed 12,000 limit. The process stopped safely. Quality calibration and the controlled comparison did not start, and no retry was made.

<!-- pagebreak -->

## Appendix B — Key risks and work still to do

| Risk or unfinished work | Why it matters | What closes it |
|---|---|---|
| Guided answer step is incomplete | DWI can show a question but cannot finish the simple answer journey | Build and test answer, skip, safe use, and old-answer protection |
| Latest restart result is missing | Earlier evidence cannot automatically prove the latest version | Repeat the full journey on the same exact version |
| Live external-AI quality is unknown | Local checks cannot prove quality, cost, or time with a real service | Obtain a new approved test agreement and run controlled checks |
| Project-management data could become hidden authority | Urgency might improperly affect privacy, safety, or availability | Keep fields minimal, make the link optional, and stop safely on bad data |
| AI usage limit could be mistaken for permission | Priority might trigger unauthorized spend or data sharing | Enforce the control order and require explicit external-AI action |
| Feedback could become employee monitoring | Trust can be lost and activity may be mistaken for productivity | Exclude content and names, use minimum group sizes, and prohibit ranking |
| Usage estimates may be mistaken for bills | Management decisions could use inaccurate cost information | Label estimates, show uncertainty, and compare with observed use later |
| Activity counts may become the goal | More usage can hide poor outcomes or repeated attempts | Measure usefulness, correction, time, limits, and safe fallback together |

<!-- pagebreak -->

## Appendix C — Plain-English glossary

| Term | Plain-English meaning |
|---|---|
| Project Meta Context | The short project summary the developer has reviewed and approved |
| Proof of concept | A working local demonstration used to test value and controls before wider use |
| Project-management system | The tool that holds planned tasks, priorities, delivery periods, and work status |
| Token | A unit used to measure AI input and output; it helps estimate usage, not necessarily the final bill |
| AI usage limit | A clear cap on how much AI input and output may be used for a task |
| Local rule-based draft | A draft prepared by DWI without calling an external AI service |
| External AI service | The separately configured AI system used only after an explicit disclosed action |
| Fallback | Continuing safely with the local draft when an external AI action fails or is unavailable |
| Outcome-only feedback | Simple result information that does not copy prompts, output, code, or project content |
| Controlled comparison | A fixed test used to check whether the external-AI improvement is genuinely better |
| Exact-version evidence | A test result that belongs only to the exact product version that produced it |

---

**Final boundary:** current local capabilities and future ideas are intentionally separated. Future project-management, AI-limit, and management-feedback features require their own design, approval, implementation, privacy review, and evidence.
