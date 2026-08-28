import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DwiProjectSnapshot } from "@platform/dwi-core";
import { portalCss, portalHtml, portalJavaScript } from "./portal.js";
import {
  CatalogStoreError,
  EncryptedCatalogStore,
  catalogSnapshotHash,
  snapshotContainsInlineEvidenceContent,
  type CatalogProjectSummary,
  type CatalogWritePrecondition,
} from "./store.js";

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_BEARER_TOKEN_BYTES = 4 * 1024;
const PROJECT_ID_MAX_LENGTH = 512;

export type CatalogRole = "reader" | "writer" | "admin";

export interface CatalogPrincipal {
  id: string;
  role: CatalogRole;
}

export interface CatalogProjectAuthorization {
  action: "read" | "write";
  projectId: string;
}

export interface CatalogServerOptions {
  store: EncryptedCatalogStore;
  authenticate(
    request: IncomingMessage,
  ): Promise<CatalogPrincipal | undefined> | CatalogPrincipal | undefined;
  /**
   * Optional additional project-level policy. Denied projects are omitted from
   * lists and return 403 on direct reads or writes. Role checks still apply.
   */
  authorizeProject?(
    principal: CatalogPrincipal,
    authorization: CatalogProjectAuthorization,
  ): Promise<boolean> | boolean;
  /**
   * Must be explicitly enabled alongside the matching store option before the
   * HTTP API will accept or return inline evidence content.
   */
  allowInlineEvidenceContent?: boolean;
  onError?(error: unknown, request: IncomingMessage): void;
}

class CatalogHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = "CatalogHttpError";
  }
}

export function createCatalogServer(options: CatalogServerOptions) {
  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    try {
      await route(request, response, options, requestId);
    } catch (error) {
      handleError(error, request, response, options, requestId);
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 50;
  return server;
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  options: CatalogServerOptions,
  requestId: string,
): Promise<void> {
  let url: URL;
  try {
    url = new URL(request.url ?? "/", "http://127.0.0.1");
  } catch {
    throw new CatalogHttpError(400, "invalid_url", "The request URL is invalid.");
  }

  if (url.pathname === "/health") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed(response, ["GET", "HEAD"], requestId);
    }
    return json(response, 200, { ok: true }, requestId, request.method === "HEAD");
  }

  if (url.pathname === "/") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed(response, ["GET", "HEAD"], requestId);
    }
    return text(
      response,
      200,
      "text/html; charset=utf-8",
      portalHtml,
      requestId,
      request.method === "HEAD",
      { "content-security-policy": portalContentSecurityPolicy() },
    );
  }

  if (url.pathname === "/assets/portal.css" || url.pathname === "/assets/portal.js") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed(response, ["GET", "HEAD"], requestId);
    }
    const javascript = url.pathname.endsWith(".js");
    return text(
      response,
      200,
      javascript ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8",
      javascript ? portalJavaScript : portalCss,
      requestId,
      request.method === "HEAD",
    );
  }

  if (!url.pathname.startsWith("/v1/")) {
    return json(response, 404, { error: "not_found" }, requestId);
  }

  const principal = await options.authenticate(request);
  if (!principal) {
    return json(
      response,
      401,
      { error: "unauthorized", message: "A valid bearer token is required." },
      requestId,
      false,
      { "www-authenticate": 'Bearer realm="dwi-catalog"' },
    );
  }
  if (!isCatalogPrincipal(principal)) {
    throw new CatalogHttpError(
      500,
      "authentication_configuration_error",
      "The catalog authenticator returned an invalid principal.",
    );
  }

  if (url.pathname === "/v1/projects") {
    if (request.method !== "GET") {
      return methodNotAllowed(response, ["GET"], requestId);
    }
    const projects = await options.store.list(principal.id);
    return json(
      response,
      200,
      { projects: await filterAuthorizedProjects(options, principal, projects) },
      requestId,
    );
  }

  const match = /^\/v1\/projects\/([^/]+)$/.exec(url.pathname);
  if (!match?.[1]) return json(response, 404, { error: "not_found" }, requestId);

  const projectId = decodeProjectId(match[1]);
  if (request.method === "GET") {
    if (!(await projectAccessAllowed(options, principal, "read", projectId))) {
      return projectForbidden(response, requestId);
    }
    const snapshot = await options.store.get(projectId, principal.id);
    if (
      snapshot &&
      options.allowInlineEvidenceContent !== true &&
      snapshotContainsInlineEvidenceContent(snapshot)
    ) {
      throw inlineEvidenceHttpError();
    }
    return snapshot
      ? json(response, 200, snapshot, requestId, false, {
          etag: strongEtag(catalogSnapshotHash(snapshot)),
        })
      : json(response, 404, { error: "not_found" }, requestId);
  }

  if (request.method === "PUT") {
    if (principal.role === "reader") {
      return json(
        response,
        403,
        { error: "forbidden", message: "Writer access is required." },
        requestId,
      );
    }
    if (!(await projectAccessAllowed(options, principal, "write", projectId))) {
      return projectForbidden(response, requestId);
    }
    const precondition = writePrecondition(request);
    const body = await readJson(request);
    if (!isRecord(body) || !isRecord(body.metadata) || body.metadata.id !== projectId) {
      return json(
        response,
        400,
        {
          error: "project_id_mismatch",
          message: "The snapshot metadata.id must match the project ID in the URL.",
        },
        requestId,
      );
    }
    if (
      options.allowInlineEvidenceContent !== true &&
      snapshotContainsInlineEvidenceContent(body)
    ) {
      throw inlineEvidenceHttpError();
    }
    const stored = await options.store.put(
      body as unknown as DwiProjectSnapshot,
      principal.id,
      { precondition },
    );
    return json(response, 200, stored, requestId, false, {
      etag: strongEtag(stored.snapshotHash),
    });
  }

  return methodNotAllowed(response, ["GET", "PUT"], requestId);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    contentType !== "application/json" &&
    !/^application\/[a-z0-9!#$&^_.+-]+\+json$/.test(contentType ?? "")
  ) {
    throw new CatalogHttpError(
      415,
      "unsupported_media_type",
      "Use Content-Type: application/json.",
    );
  }

  const declaredLength = request.headers["content-length"];
  if (declaredLength !== undefined) {
    if (!/^\d+$/.test(declaredLength)) {
      throw new CatalogHttpError(400, "invalid_content_length", "Content-Length is invalid.");
    }
    if (Number(declaredLength) > MAX_REQUEST_BYTES) {
      throw new CatalogHttpError(
        413,
        "request_too_large",
        "Catalog request exceeds the 4 MiB limit.",
      );
    }
  }

  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        throw new CatalogHttpError(
          413,
          "request_too_large",
          "Catalog request exceeds the 4 MiB limit.",
        );
      }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof CatalogHttpError) throw error;
    throw new CatalogHttpError(400, "request_interrupted", "The request body was interrupted.");
  }

  if (size === 0) {
    throw new CatalogHttpError(400, "invalid_json", "The request body must contain JSON.");
  }

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new CatalogHttpError(400, "invalid_json", "The request body is not valid UTF-8.");
  }

  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new CatalogHttpError(400, "invalid_json", "The request body is not valid JSON.");
  }
}

function writePrecondition(request: IncomingMessage): CatalogWritePrecondition {
  const ifMatch = request.headers["if-match"];
  const ifNoneMatch = request.headers["if-none-match"];
  if (ifMatch === undefined && ifNoneMatch === undefined) {
    throw new CatalogHttpError(
      428,
      "precondition_required",
      "Use If-None-Match: * to create a project or If-Match with its current ETag to update it.",
    );
  }
  if (ifMatch !== undefined && ifNoneMatch !== undefined) {
    throw new CatalogHttpError(
      400,
      "invalid_precondition",
      "Send either If-None-Match or If-Match, not both.",
    );
  }
  if (ifNoneMatch !== undefined) {
    if (ifNoneMatch.trim() !== "*") {
      throw new CatalogHttpError(
        400,
        "invalid_precondition",
        "Project creation requires If-None-Match: *.",
      );
    }
    return { kind: "create" };
  }

  const match = /^"(sha256:[a-f0-9]{64})"$/.exec(ifMatch?.trim() ?? "");
  if (!match?.[1]) {
    throw new CatalogHttpError(
      400,
      "invalid_precondition",
      "Project updates require one strong If-Match ETag returned by the catalog.",
    );
  }
  return { kind: "match", snapshotHash: match[1] };
}

async function filterAuthorizedProjects(
  options: CatalogServerOptions,
  principal: CatalogPrincipal,
  projects: readonly CatalogProjectSummary[],
): Promise<CatalogProjectSummary[]> {
  if (!options.authorizeProject) return [...projects];
  const decisions = await Promise.all(
    projects.map(({ id }) => projectAccessAllowed(options, principal, "read", id)),
  );
  return projects.filter((_, index) => decisions[index] === true);
}

async function projectAccessAllowed(
  options: CatalogServerOptions,
  principal: CatalogPrincipal,
  action: CatalogProjectAuthorization["action"],
  projectId: string,
): Promise<boolean> {
  if (!options.authorizeProject) return true;
  return (await options.authorizeProject(principal, { action, projectId })) === true;
}

function projectForbidden(response: ServerResponse, requestId: string): void {
  json(
    response,
    403,
    { error: "forbidden", message: "Access to this project is denied." },
    requestId,
  );
}

function inlineEvidenceHttpError(): CatalogHttpError {
  return new CatalogHttpError(
    422,
    "inline_evidence_forbidden",
    "Inline evidence content is disabled; submit evidence digests and selectors instead.",
  );
}

function strongEtag(snapshotHash: string): string {
  return `"${snapshotHash}"`;
}

function handleError(
  error: unknown,
  request: IncomingMessage,
  response: ServerResponse,
  options: CatalogServerOptions,
  requestId: string,
): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }

  if (error instanceof CatalogHttpError) {
    if (error.status >= 500) reportError(options, error, request);
    json(
      response,
      error.status,
      { error: error.code, message: error.status >= 500 ? "The catalog request failed." : error.message },
      requestId,
      false,
      error.headers,
    );
    return;
  }

  if (error instanceof CatalogStoreError) {
    const mapped = mapStoreError(error);
    if (mapped.status >= 500) reportError(options, error, request);
    json(
      response,
      mapped.status,
      { error: mapped.code, message: mapped.status >= 500 ? "The catalog request failed." : error.message },
      requestId,
      false,
      error.currentSnapshotHash ? { etag: strongEtag(error.currentSnapshotHash) } : {},
    );
    return;
  }

  reportError(options, error, request);
  json(
    response,
    500,
    { error: "internal_error", message: "The catalog request failed." },
    requestId,
  );
}

function reportError(
  options: CatalogServerOptions,
  error: unknown,
  request: IncomingMessage,
): void {
  try {
    options.onError?.(error, request);
  } catch {
    // Error reporting must never prevent the server from returning a sanitized response.
  }
}

function mapStoreError(error: CatalogStoreError): { status: number; code: string } {
  switch (error.code) {
    case "invalid_input":
      return { status: 400, code: error.code };
    case "invalid_snapshot":
    case "snapshot_not_approved":
    case "review_binding_required":
    case "inline_evidence_forbidden":
      return { status: 422, code: error.code };
    case "snapshot_too_large":
      return { status: 413, code: error.code };
    case "precondition_failed":
      return { status: 412, code: error.code };
    case "corrupt_data":
      return { status: 500, code: error.code };
  }
}

function methodNotAllowed(
  response: ServerResponse,
  methods: readonly string[],
  requestId: string,
): void {
  json(
    response,
    405,
    { error: "method_not_allowed" },
    requestId,
    false,
    { allow: methods.join(", ") },
  );
}

function json(
  response: ServerResponse,
  status: number,
  value: unknown,
  requestId: string,
  omitBody = false,
  headers: Readonly<Record<string, string>> = {},
): void {
  text(
    response,
    status,
    "application/json; charset=utf-8",
    `${JSON.stringify(value)}\n`,
    requestId,
    omitBody,
    headers,
  );
}

function text(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string,
  requestId: string,
  omitBody = false,
  headers: Readonly<Record<string, string>> = {},
): void {
  const encoded = Buffer.from(body, "utf8");
  response.writeHead(status, {
    ...securityHeaders(),
    "content-type": contentType,
    "content-length": String(encoded.byteLength),
    "x-request-id": requestId,
    ...headers,
  });
  response.end(omitBody ? undefined : encoded);
}

function securityHeaders(): Readonly<Record<string, string>> {
  return {
    "cache-control": "no-store",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-resource-policy": "same-origin",
    "permissions-policy": "camera=(), geolocation=(), microphone=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function portalContentSecurityPolicy(): string {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
  ].join("; ");
}

function decodeProjectId(encoded: string): string {
  let projectId: string;
  try {
    projectId = decodeURIComponent(encoded);
  } catch {
    throw new CatalogHttpError(400, "invalid_project_id", "The project ID is malformed.");
  }
  if (
    projectId.length === 0 ||
    projectId.length > PROJECT_ID_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(projectId)
  ) {
    throw new CatalogHttpError(400, "invalid_project_id", "The project ID is invalid.");
  }
  return projectId;
}

function isCatalogPrincipal(value: CatalogPrincipal): boolean {
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 200 &&
    !/[\u0000-\u001f\u007f]/.test(value.id) &&
    (value.role === "reader" || value.role === "writer" || value.role === "admin")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createBearerTokenAuthenticator(
  expectedToken: string,
  principal: CatalogPrincipal = { id: "local-admin", role: "admin" },
): (request: IncomingMessage) => CatalogPrincipal | undefined {
  const expected = Buffer.from(expectedToken, "utf8");
  if (expected.byteLength < 16 || expected.byteLength > MAX_BEARER_TOKEN_BYTES) {
    throw new Error("DWI catalog bearer token must contain between 16 bytes and 4 KiB.");
  }
  if (!isCatalogPrincipal(principal)) {
    throw new Error("DWI catalog bearer-token principal is invalid.");
  }
  if (!/^[A-Za-z0-9\-._~+/]+=*$/.test(expectedToken)) {
    throw new Error("DWI catalog bearer token must use the RFC 6750 bearer-token character set.");
  }

  return (request) => {
    const authorization = request.headers.authorization;
    if (!authorization || authorization.length > MAX_BEARER_TOKEN_BYTES + 16) return undefined;
    const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/.exec(authorization);
    if (!match?.[1]) return undefined;
    const supplied = Buffer.from(match[1], "utf8");
    return supplied.byteLength === expected.byteLength && timingSafeEqual(supplied, expected)
      ? principal
      : undefined;
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const portSource = process.env.DWI_CATALOG_PORT ?? "4731";
  const port = /^\d+$/.test(portSource) ? Number(portSource) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("DWI_CATALOG_PORT must be an integer between 1 and 65535.");
  }
  const directory = process.env.DWI_CATALOG_DATA_DIR ?? resolve(".dwi-catalog");
  const secret = process.env.DWI_CATALOG_ENCRYPTION_KEY;
  const token = process.env.DWI_CATALOG_TOKEN;
  const inlineEvidenceSetting = process.env.DWI_CATALOG_ALLOW_INLINE_EVIDENCE_CONTENT;
  if (
    inlineEvidenceSetting !== undefined &&
    inlineEvidenceSetting !== "true" &&
    inlineEvidenceSetting !== "false"
  ) {
    throw new Error("DWI_CATALOG_ALLOW_INLINE_EVIDENCE_CONTENT must be true or false.");
  }
  const allowInlineEvidenceContent = inlineEvidenceSetting === "true";
  if (!secret || !token) {
    throw new Error(
      "Set DWI_CATALOG_ENCRYPTION_KEY and DWI_CATALOG_TOKEN before starting the catalog.",
    );
  }
  const server = createCatalogServer({
    store: new EncryptedCatalogStore(directory, secret, { allowInlineEvidenceContent }),
    authenticate: createBearerTokenAuthenticator(token),
    allowInlineEvidenceContent,
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Unknown catalog error";
      process.stderr.write(`DWI catalog request failed: ${message}\n`);
    },
  });
  let stopping = false;
  const shutdown = (signal: "SIGINT" | "SIGTERM"): void => {
    if (stopping) return;
    stopping = true;
    process.stdout.write(`DWI catalog received ${signal}; closing connections.\n`);
    const forceClose = setTimeout(() => {
      server.closeAllConnections();
      process.exitCode = 1;
    }, 10_000);
    forceClose.unref();
    server.close((error) => {
      clearTimeout(forceClose);
      if (error) {
        process.stderr.write(`DWI catalog shutdown failed: ${error.message}\n`);
        process.exitCode = 1;
      }
    });
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  server.once("error", (error) => {
    process.stderr.write(`DWI catalog could not start: ${error.message}\n`);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`DWI catalog listening on http://127.0.0.1:${port}\n`);
  });
}
