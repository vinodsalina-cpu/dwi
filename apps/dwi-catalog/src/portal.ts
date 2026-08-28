export const portalHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <title>DWI Project Catalog</title>
    <link rel="stylesheet" href="/assets/portal.css">
    <script src="/assets/portal.js" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#catalog-content">Skip to project catalog</a>
    <header class="shell page-header">
      <div class="heading">
        <p class="eyebrow">DWI Catalog</p>
        <h1>Project intelligence</h1>
        <p class="lede">Approved snapshots, evidence coverage, and unresolved metadata.</p>
      </div>
      <form id="auth" class="auth-panel" aria-label="Catalog authentication">
        <label for="token">Catalog token</label>
        <div class="auth-controls">
          <input
            id="token"
            name="token"
            type="password"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            aria-describedby="token-help status"
            required
          >
          <button id="load-projects" type="submit">Load projects</button>
        </div>
        <p id="token-help" class="field-help">Used for this request only; it is not saved by the portal.</p>
      </form>
    </header>
    <main id="catalog-content" class="shell" tabindex="-1">
      <div class="catalog-heading">
        <div>
          <h2>Projects</h2>
          <p id="status" class="status" role="status" aria-live="polite">Enter a catalog token to load projects.</p>
        </div>
      </div>
      <div id="empty-state" class="empty-state">
        <strong>No catalog data loaded</strong>
        <span>Authenticate above to inspect the current project snapshots.</span>
      </div>
      <div id="project-table" class="table-region" hidden>
        <table>
          <caption class="sr-only">Available DWI project snapshots</caption>
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Namespace</th>
              <th scope="col">Status</th>
              <th scope="col" class="numeric">Evidence</th>
              <th scope="col" class="numeric">Unresolved</th>
              <th scope="col">Generated</th>
            </tr>
          </thead>
          <tbody id="projects"></tbody>
        </table>
      </div>
    </main>
  </body>
</html>`;

export const portalCss = `
:root {
  color-scheme: light dark;
  font: 14px/1.45 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --page: #f7f8fa;
  --surface: #ffffff;
  --surface-subtle: #f1f3f6;
  --text: #1d2430;
  --muted: #5b6574;
  --border: #d8dde5;
  --accent: #2457d6;
  --accent-hover: #1946b8;
  --accent-text: #ffffff;
  --focus: #0b6fff;
  --danger: #b42318;
  --danger-surface: #fff0ee;
  --success: #137333;
  --success-surface: #eaf7ed;
  --warning: #8a5a00;
  --warning-surface: #fff4d6;
  --shadow: 0 1px 2px rgb(20 30 45 / 8%);
}

@media (prefers-color-scheme: dark) {
  :root {
    --page: #11151b;
    --surface: #191f27;
    --surface-subtle: #222a34;
    --text: #eef2f7;
    --muted: #aab4c2;
    --border: #35404e;
    --accent: #7ba2ff;
    --accent-hover: #96b5ff;
    --accent-text: #101722;
    --focus: #8ab4ff;
    --danger: #ffb4ab;
    --danger-surface: #3b2020;
    --success: #8bd59d;
    --success-surface: #173624;
    --warning: #f3ca72;
    --warning-surface: #3a301a;
    --shadow: 0 1px 2px rgb(0 0 0 / 30%);
  }
}

* { box-sizing: border-box; }

html { min-width: 280px; background: var(--page); color: var(--text); }

body { margin: 0; min-height: 100vh; background: var(--page); color: var(--text); }

button, input { font: inherit; }

button, input {
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

input {
  width: min(280px, 100%);
  padding: 7px 10px;
  background: var(--surface);
  color: var(--text);
}

input[aria-invalid="true"] { border-color: var(--danger); }

button {
  padding: 7px 13px;
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-text);
  cursor: pointer;
  font-weight: 650;
  white-space: nowrap;
}

button:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
button:disabled { cursor: wait; opacity: .68; }

:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

.skip-link {
  position: fixed;
  z-index: 10;
  top: 8px;
  left: 8px;
  padding: 8px 10px;
  border-radius: 5px;
  background: var(--surface);
  color: var(--text);
  transform: translateY(-150%);
}

.skip-link:focus { transform: translateY(0); }

.shell { width: min(1080px, calc(100% - 32px)); margin-inline: auto; }

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding-block: 22px 18px;
}

.heading { min-width: 0; }

.eyebrow {
  margin: 0 0 3px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: .09em;
  text-transform: uppercase;
}

h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 4px; font-size: clamp(22px, 3vw, 29px); line-height: 1.15; }
h2 { margin-bottom: 2px; font-size: 16px; }
.lede, .status, .field-help { color: var(--muted); }
.lede { margin-bottom: 0; }

.auth-panel { flex: 0 1 390px; min-width: 300px; }
.auth-panel > label { display: block; margin-bottom: 5px; font-size: 12px; font-weight: 700; }
.auth-controls { display: flex; align-items: stretch; gap: 7px; }
.auth-controls input { flex: 1 1 auto; min-width: 120px; }
.field-help { margin: 4px 0 0; font-size: 11px; }

main { padding-bottom: 32px; }

.catalog-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0 10px;
  border-top: 1px solid var(--border);
}

.status { min-height: 20px; margin-bottom: 0; }
.status[data-tone="error"] { color: var(--danger); }

.empty-state {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 18px;
  border: 1px dashed var(--border);
  border-radius: 7px;
  background: var(--surface-subtle);
  color: var(--muted);
}

.empty-state strong { color: var(--text); }

.table-region {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

table { width: 100%; border-collapse: collapse; }
th, td { padding: 9px 11px; text-align: left; border-bottom: 1px solid var(--border); vertical-align: middle; }
th { background: var(--surface-subtle); color: var(--muted); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: var(--surface-subtle); }
td:first-child { max-width: 290px; font-weight: 650; overflow-wrap: anywhere; }
td:nth-child(2) { max-width: 230px; color: var(--muted); overflow-wrap: anywhere; }
.numeric { text-align: right; font-variant-numeric: tabular-nums; }

.status-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-subtle);
  font-size: 12px;
  font-weight: 700;
  text-transform: capitalize;
}

.status-badge[data-status="current"] { background: var(--success-surface); color: var(--success); }
.status-badge[data-status="partial"] { background: var(--warning-surface); color: var(--warning); }
.status-badge[data-status="conflict"],
.status-badge[data-status="unsupported"] { background: var(--danger-surface); color: var(--danger); }

time { white-space: nowrap; color: var(--muted); font-size: 12px; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

[hidden] { display: none !important; }

@media (max-width: 700px) {
  .shell { width: min(100% - 24px, 1080px); }
  .page-header { align-items: stretch; flex-direction: column; gap: 15px; padding-block: 16px 13px; }
  .auth-panel { flex-basis: auto; min-width: 0; }
  .catalog-heading { padding-top: 12px; }
  .table-region { overflow: visible; border: 0; background: transparent; box-shadow: none; }
  table, tbody, tr, td { display: block; width: 100%; }
  thead { display: none; }
  tbody { display: grid; gap: 8px; }
  tbody tr { padding: 8px 10px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface); box-shadow: var(--shadow); }
  tbody tr:hover { background: var(--surface); }
  td, tbody tr:last-child td { display: grid; grid-template-columns: minmax(88px, .7fr) minmax(0, 1.3fr); gap: 10px; max-width: none !important; padding: 4px 0; border: 0; text-align: left !important; }
  td::before { content: attr(data-label); color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }
  td:first-child { padding-top: 2px; }
  td:last-child { padding-bottom: 2px; }
}

@media (max-width: 420px) {
  .auth-controls { align-items: stretch; flex-direction: column; }
  .auth-controls input { width: 100%; }
  .auth-controls button { width: 100%; }
}
`;

export const portalJavaScript = `
(() => {
  "use strict";

  const form = document.querySelector("#auth");
  const token = document.querySelector("#token");
  const button = document.querySelector("#load-projects");
  const main = document.querySelector("#catalog-content");
  const status = document.querySelector("#status");
  const empty = document.querySelector("#empty-state");
  const table = document.querySelector("#project-table");
  const rows = document.querySelector("#projects");

  const labels = ["Project", "Namespace", "Status", "Evidence", "Unresolved", "Generated"];
  const knownStatuses = new Set(["current", "partial", "conflict", "unsupported"]);

  function setMessage(message, tone) {
    status.textContent = message;
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  }

  function showEmpty(title, detail) {
    empty.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = title;
    const span = document.createElement("span");
    span.textContent = detail;
    empty.append(strong, span);
    empty.hidden = false;
    table.hidden = true;
  }

  function renderStatus(value) {
    const badge = document.createElement("span");
    badge.className = "status-badge";
    badge.dataset.status = knownStatuses.has(value) ? value : "unsupported";
    badge.textContent = value;
    return badge;
  }

  function renderGenerated(value) {
    const time = document.createElement("time");
    time.dateTime = value;
    const parsed = Date.parse(value);
    time.textContent = Number.isNaN(parsed)
      ? value
      : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(parsed);
    time.title = value;
    return time;
  }

  function renderProjects(projects) {
    rows.replaceChildren();
    for (const project of projects) {
      const tr = document.createElement("tr");
      const values = [
        project.name,
        project.namespace,
        renderStatus(String(project.status)),
        project.evidenceCount,
        project.unresolvedCount,
        renderGenerated(String(project.generatedAt)),
      ];
      values.forEach((value, index) => {
        const td = document.createElement("td");
        td.dataset.label = labels[index];
        if (index === 3 || index === 4) td.className = "numeric";
        if (value instanceof Node) td.append(value);
        else td.textContent = String(value);
        tr.append(td);
      });
      rows.append(tr);
    }
    empty.hidden = true;
    table.hidden = false;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const credential = token.value.trim();
    if (!credential) {
      token.setAttribute("aria-invalid", "true");
      showEmpty("Authentication required", "Enter a catalog token before loading projects.");
      setMessage("A catalog token is required.", "error");
      token.focus();
      return;
    }

    button.disabled = true;
    token.removeAttribute("aria-invalid");
    main.setAttribute("aria-busy", "true");
    button.textContent = "Loading…";
    rows.replaceChildren();
    table.hidden = true;
    empty.hidden = true;
    setMessage("Loading project snapshots…");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    let authenticationRejected = false;
    try {
      const response = await fetch("/v1/projects", {
        headers: { Authorization: "Bearer " + credential },
        signal: controller.signal,
      });
      if (response.status === 401) {
        authenticationRejected = true;
        token.setAttribute("aria-invalid", "true");
        throw new Error("The catalog token was not accepted.");
      }
      if (!response.ok) throw new Error("The catalog could not load projects (HTTP " + response.status + ").");
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.projects)) throw new Error("The catalog returned an invalid response.");

      if (payload.projects.length === 0) {
        showEmpty("No project snapshots", "Publish a DWI snapshot to make it available here.");
        setMessage("Catalog connected · 0 projects");
      } else {
        renderProjects(payload.projects);
        setMessage("Catalog connected · " + payload.projects.length + (payload.projects.length === 1 ? " project" : " projects"));
      }
      button.textContent = "Refresh";
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "The catalog request timed out. Try again."
        : error instanceof Error ? error.message : "The catalog request failed.";
      showEmpty("Projects unavailable", "Check the token and catalog service, then try again.");
      setMessage(message, "error");
      button.textContent = "Try again";
      if (authenticationRejected) token.focus();
    } finally {
      window.clearTimeout(timeout);
      main.removeAttribute("aria-busy");
      button.disabled = false;
    }
  });
})();
`;
