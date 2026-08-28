import { once } from "node:events";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProjectSnapshot, type DwiProjectSnapshot } from "@platform/dwi-core";
import {
  createBearerTokenAuthenticator,
  createCatalogServer,
  type CatalogServerOptions,
} from "./server.js";
import { portalJavaScript } from "./portal.js";
import { EncryptedCatalogStore, catalogSnapshotHash } from "./store.js";

const SECRET = "another-secret-at-least-sixteen-bytes";
const NOW = "2026-08-26T12:00:00.000Z";
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => closeServer(server)));
});

describe("catalog HTTP API", () => {
  it("enforces roles and serves encrypted snapshots", async () => {
    const { base } = await startServer();

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get("cache-control")).toBe("no-store");

    const unauthorized = await fetch(`${base}/v1/projects`);
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toBe('Bearer realm="dwi-catalog"');

    const snapshot = approvedSnapshot("default/demo", "demo", "initial");
    expect((await putSnapshot(base, snapshot, "reader")).status).toBe(403);
    const created = await putSnapshot(base, snapshot, "writer", "*");
    expect(created.status).toBe(200);
    expect(created.headers.get("etag")).toBe(strongEtag(snapshot));

    const list = await fetch(`${base}/v1/projects`, {
      headers: { authorization: "Bearer reader" },
    });
    expect(list.status).toBe(200);
    expect((await list.json() as { projects: unknown[] }).projects).toHaveLength(1);

    const read = await fetch(`${base}/v1/projects/default%2Fdemo`, {
      headers: { authorization: "Bearer reader" },
    });
    expect(read.status).toBe(200);
    expect(read.headers.get("etag")).toBe(strongEtag(snapshot));
    expect((await read.json() as { metadata: { id: string } }).metadata.id).toBe("default/demo");
  });

  it("maps malformed requests and invalid snapshots to actionable client errors", async () => {
    const { base } = await startServer();
    const endpoint = `${base}/v1/projects/default%2Fdemo`;
    const writer = { authorization: "Bearer writer", "if-none-match": "*" };

    expect((await fetch(endpoint, { method: "PUT", headers: writer, body: "{}" })).status).toBe(415);

    const malformed = await fetch(endpoint, {
      method: "PUT",
      headers: { ...writer, "content-type": "application/json" },
      body: "{",
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ error: "invalid_json" });

    const mismatch = await fetch(endpoint, {
      method: "PUT",
      headers: { ...writer, "content-type": "application/json" },
      body: JSON.stringify({ metadata: { id: "default/other" } }),
    });
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toMatchObject({ error: "project_id_mismatch" });

    const invalidSnapshot = await fetch(endpoint, {
      method: "PUT",
      headers: { ...writer, "content-type": "application/json" },
      body: JSON.stringify({ metadata: { id: "default/demo" } }),
    });
    expect(invalidSnapshot.status).toBe(422);
    expect(await invalidSnapshot.json()).toMatchObject({ error: "invalid_snapshot" });

    const malformedId = await fetch(`${base}/v1/projects/%ZZ`, { headers: writer });
    expect(malformedId.status).toBe(400);
    expect(await malformedId.json()).toMatchObject({ error: "invalid_project_id" });

    const method = await fetch(`${base}/v1/projects`, { method: "POST", headers: writer });
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("GET");
  });

  it("requires approved snapshots and atomic HTTP write preconditions", async () => {
    const { base } = await startServer();
    const initial = approvedSnapshot("default/versioned", "versioned", "initial");
    const unapproved = createProjectSnapshot({
      metadata: { id: "default/unapproved", name: "unapproved" },
    });

    const unapprovedResponse = await putSnapshot(base, unapproved, "writer", "*");
    expect(unapprovedResponse.status).toBe(422);
    expect(await unapprovedResponse.json()).toMatchObject({ error: "snapshot_not_approved" });

    const missingPrecondition = await putSnapshot(base, initial, "writer");
    expect(missingPrecondition.status).toBe(428);
    expect(await missingPrecondition.json()).toMatchObject({ error: "precondition_required" });

    const created = await putSnapshot(base, initial, "writer", "*");
    const initialEtag = strongEtag(initial);
    expect(created.status).toBe(200);
    expect(created.headers.get("etag")).toBe(initialEtag);

    const duplicateCreate = await putSnapshot(base, initial, "writer", "*");
    expect(duplicateCreate.status).toBe(412);
    expect(duplicateCreate.headers.get("etag")).toBe(initialEtag);

    const weakMatch = await putSnapshot(base, initial, "writer", `W/${initialEtag}`);
    expect(weakMatch.status).toBe(400);
    expect(await weakMatch.json()).toMatchObject({ error: "invalid_precondition" });

    const staleMatch = await putSnapshot(
      base,
      initial,
      "writer",
      `"sha256:${"0".repeat(64)}"`,
    );
    expect(staleMatch.status).toBe(412);
    expect(staleMatch.headers.get("etag")).toBe(initialEtag);

    const candidateA = approvedSnapshot("default/versioned", "versioned", "candidate-a");
    const candidateB = approvedSnapshot("default/versioned", "versioned", "candidate-b");
    const competing = await Promise.all([
      putSnapshot(base, candidateA, "writer", initialEtag),
      putSnapshot(base, candidateB, "writer", initialEtag),
    ]);
    expect(competing.map(({ status }) => status).sort()).toEqual([200, 412]);
    const winner = competing.find(({ status }) => status === 200);
    const stale = competing.find(({ status }) => status === 412);
    expect(winner?.headers.get("etag")).toMatch(/^"sha256:[a-f0-9]{64}"$/);
    expect(stale?.headers.get("etag")).toBe(winner?.headers.get("etag"));
  });

  it("requires matching store and HTTP opt-ins for encrypted inline evidence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dwi-catalog-inline-evidence-"));
    const store = new EncryptedCatalogStore(directory, SECRET, {
      allowInlineEvidenceContent: true,
    });
    const snapshot = approvedSnapshot(
      "default/inline-evidence",
      "inline-evidence",
      "inline evidence test",
      "private-inline-evidence",
    );

    const strictServer = await startServer({ store });
    const rejected = await putSnapshot(strictServer.base, snapshot, "writer", "*");
    expect(rejected.status).toBe(422);
    expect(await rejected.json()).toMatchObject({ error: "inline_evidence_forbidden" });

    const optedInServer = await startServer({ store, allowInlineEvidenceContent: true });
    const created = await putSnapshot(optedInServer.base, snapshot, "writer", "*");
    expect(created.status).toBe(200);
    const read = await fetch(
      `${optedInServer.base}/v1/projects/${encodeURIComponent(snapshot.metadata.id)}`,
      { headers: { authorization: "Bearer reader" } },
    );
    expect(read.status).toBe(200);
    expect((await read.json() as DwiProjectSnapshot).evidence[0]?.content)
      .toBe("private-inline-evidence");
    const strictRead = await fetch(
      `${strictServer.base}/v1/projects/${encodeURIComponent(snapshot.metadata.id)}`,
      { headers: { authorization: "Bearer reader" } },
    );
    expect(strictRead.status).toBe(422);
    expect(await strictRead.json()).toMatchObject({ error: "inline_evidence_forbidden" });
    const encrypted = await readFile(
      join(directory, (await readdir(directory)).find((name) => name.endsWith(".snapshot.enc"))!),
      "utf8",
    );
    expect(encrypted).not.toContain("private-inline-evidence");
  });

  it("filters list results and protects reads and writes with project authorization", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dwi-catalog-policy-"));
    const store = new EncryptedCatalogStore(directory, SECRET);
    const visible = approvedSnapshot("default/visible", "visible", "visible");
    const hidden = approvedSnapshot("default/hidden", "hidden", "hidden");
    await store.put(visible, "seed");
    await store.put(hidden, "seed");
    const decisions: string[] = [];
    const { base } = await startServer({
      store,
      authorizeProject: (_principal, { action, projectId }) => {
        decisions.push(`${action}:${projectId}`);
        return projectId === visible.metadata.id;
      },
    });

    const list = await fetch(`${base}/v1/projects`, {
      headers: { authorization: "Bearer reader" },
    });
    expect((await list.json() as { projects: Array<{ id: string }> }).projects.map(({ id }) => id))
      .toEqual([visible.metadata.id]);

    expect((await fetch(`${base}/v1/projects/${encodeURIComponent(hidden.metadata.id)}`, {
      headers: { authorization: "Bearer reader" },
    })).status).toBe(403);
    expect((await putSnapshot(base, hidden, "writer", strongEtag(hidden))).status).toBe(403);
    expect(decisions).toEqual(expect.arrayContaining([
      `read:${visible.metadata.id}`,
      `read:${hidden.metadata.id}`,
      `write:${hidden.metadata.id}`,
    ]));
  });

  it("serves a compact portal under a strict no-inline-script content policy", async () => {
    const { base } = await startServer();

    const page = await fetch(base);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(page.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('href="/assets/portal.css"');
    expect(html).not.toContain("<style");
    expect(html).not.toMatch(/<script(?![^>]+src=)/);

    const [style, script] = await Promise.all([
      fetch(`${base}/assets/portal.css`),
      fetch(`${base}/assets/portal.js`),
    ]);
    expect(style.headers.get("content-type")).toContain("text/css");
    expect(await style.text()).toContain("@media (max-width: 420px)");
    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect(await script.text()).toContain("Projects unavailable");
    expect(() => new Function(portalJavaScript)).not.toThrow();

    const head = await fetch(base, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(Number(head.headers.get("content-length"))).toBeGreaterThan(0);
  });

  it("validates principals and sanitizes internal failures", async () => {
    const reported: unknown[] = [];
    const { base } = await startServer({
      authenticate: () => ({ id: "bad\nprincipal", role: "admin" }),
      onError: (error) => {
        reported.push(error);
        throw new Error("reporter failure");
      },
    });

    const response = await fetch(`${base}/v1/projects`, {
      headers: { authorization: "Bearer anything" },
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "authentication_configuration_error",
      message: "The catalog request failed.",
    });
    expect(reported).toHaveLength(1);
  });

  it("provides exact, constant-time-compatible bearer-token authentication", async () => {
    const token = "local-token-1234567890";
    const { base } = await startServer({ authenticate: createBearerTokenAuthenticator(token) });

    expect((await fetch(`${base}/v1/projects`, {
      headers: { authorization: `Bearer ${token}` },
    })).status).toBe(200);
    expect((await fetch(`${base}/v1/projects`, {
      headers: { authorization: `Bearer ${token}x` },
    })).status).toBe(401);
    expect((await fetch(`${base}/v1/projects`, {
      headers: { authorization: `Basic ${token}` },
    })).status).toBe(401);
    expect(() => createBearerTokenAuthenticator("short")).toThrow(/between 16 bytes/);
    expect(() => createBearerTokenAuthenticator("invalid token with spaces"))
      .toThrow(/character set/);
  });
});

async function startServer(overrides: Partial<CatalogServerOptions> = {}): Promise<{ base: string }> {
  const directory = await mkdtemp(join(tmpdir(), "dwi-catalog-http-"));
  const server = createCatalogServer({
    store: new EncryptedCatalogStore(directory, SECRET),
    authenticate: (request) => {
      if (request.headers.authorization === "Bearer writer") return { id: "writer", role: "writer" };
      if (request.headers.authorization === "Bearer reader") return { id: "reader", role: "reader" };
      return undefined;
    },
    ...overrides,
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Catalog server address is missing.");
  return { base: `http://127.0.0.1:${address.port}` };
}

async function putSnapshot(
  base: string,
  snapshot: DwiProjectSnapshot,
  token: string,
  precondition?: "*" | string,
): Promise<Response> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
  if (precondition === "*") headers["if-none-match"] = "*";
  else if (precondition !== undefined) headers["if-match"] = precondition;
  return fetch(`${base}/v1/projects/${encodeURIComponent(snapshot.metadata.id)}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(snapshot),
  });
}

function approvedSnapshot(
  id: string,
  name: string,
  description: string,
  inlineEvidenceContent?: string,
): DwiProjectSnapshot {
  return createProjectSnapshot({
    metadata: {
      id,
      name,
      revision: { generatedAt: NOW },
      review: { state: "approved", reviewedAt: NOW, reviewedBy: "catalog-test" },
    },
    spec: { identity: { description } },
    evidence: inlineEvidenceContent === undefined ? [] : [
      {
        id: "inline-evidence",
        kind: "manifest",
        relativePath: "package.json",
        content: inlineEvidenceContent,
        collectedAt: NOW,
        redactions: [],
      },
    ],
  });
}

function strongEtag(snapshot: DwiProjectSnapshot): string {
  return `"${catalogSnapshotHash(snapshot)}"`;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}
