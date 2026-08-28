import {
  buildGeminiGenerateContentBody,
  buildPromptProviderInput,
  parseGeminiGenerateContentResponse,
  parsePromptProviderResultText,
  type PromptOptimizeResult,
} from "@platform/domain-prompt-optimizer";

export type ProviderMode = "none" | "gemini" | "openai-compatible";
export type ProviderHealth = "missing" | "unverified" | "checking" | "ready" | "invalid-credential" | "quota" | "rate-limit" | "connectivity" | "timeout" | "invalid-model";
export interface ProviderSettings { mode: ProviderMode; model?: string; baseUrl?: string; configured: boolean; health: ProviderHealth; checkedAt?: string; errorMessage?: string }
export interface ProviderSettingsInput { mode: Exclude<ProviderMode, "none">; model: string; baseUrl?: string; key?: string }
export const PROVIDER_SETTINGS_KEY = "dwi.provider.settings.v1";
export const PROVIDER_SECRET_KEY = "dwi.provider.api-key.v1";

const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,127}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Enter a valid HTTPS base URL."); }
  if (url.username || url.password || url.search || url.hash) throw new Error("Provider base URLs cannot contain credentials, queries, or fragments.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname))) throw new Error("Use HTTPS for provider endpoints. HTTP is allowed only for localhost.");
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

export function providerTarget(input: Pick<ProviderSettingsInput, "mode" | "baseUrl"> | Pick<ProviderSettings, "mode" | "baseUrl">): string {
  if (input.mode === "gemini") return "https://generativelanguage.googleapis.com";
  if (input.mode === "openai-compatible" && input.baseUrl) return normalizeBaseUrl(input.baseUrl);
  throw new Error("Provider endpoint is not configured.");
}

export function validateProviderSettings(input: ProviderSettingsInput): ProviderSettings {
  const model = input.model.trim();
  if (!model) throw new Error("Choose a model before saving.");
  if (!MODEL_ID.test(model)) throw new Error("Enter a valid model ID or choose a listed model.");
  if (input.mode === "openai-compatible") {
    const baseUrl = input.baseUrl?.trim();
    if (!baseUrl) throw new Error("Enter an HTTPS-compatible base URL.");
    return { mode: input.mode, model, baseUrl: normalizeBaseUrl(baseUrl), configured: false, health: "unverified" };
  }
  return { mode: "gemini", model, configured: false, health: "unverified" };
}

export const noProviderSettings = (): ProviderSettings => ({ mode: "none", configured: false, health: "missing" });

export function normalizeProviderSettings(value: unknown): ProviderSettings {
  if (!value || typeof value !== "object") return noProviderSettings();
  const candidate = value as Partial<ProviderSettings>;
  const mode: ProviderMode = candidate.mode === "gemini" || candidate.mode === "openai-compatible" ? candidate.mode : "none";
  if (mode === "none") return noProviderSettings();
  const health = candidate.health ?? (candidate.configured ? "unverified" : "missing");
  return { mode, ...(typeof candidate.model === "string" ? { model: candidate.model } : {}), ...(typeof candidate.baseUrl === "string" ? { baseUrl: candidate.baseUrl } : {}), configured: health === "ready", health, ...(candidate.checkedAt ? { checkedAt: candidate.checkedAt } : {}), ...(candidate.errorMessage ? { errorMessage: candidate.errorMessage } : {}) };
}

export type ProviderCheckResult =
  | { ok: true; checkedAt: string }
  | { ok: false; health: Exclude<ProviderHealth, "missing" | "unverified" | "checking" | "ready">; message: string };

type FetchLike = typeof fetch;

export class ProviderRewriteError extends Error {
  readonly health: Exclude<ProviderHealth, "missing" | "unverified" | "checking" | "ready">;

  constructor(health: ProviderRewriteError["health"], message: string) {
    super(message);
    this.name = "ProviderRewriteError";
    this.health = health;
  }
}

function classifyHttpFailure(status: number, code: string | undefined, fallback: string): ProviderCheckResult {
  if (status === 401 || status === 403 || code === "authentication" || code === "permission_denied") {
    return { ok: false, health: "invalid-credential", message: "The provider rejected this API key or its permissions." };
  }
  if (status === 404 || code === "model_not_found" || code === "not_found") {
    return { ok: false, health: "invalid-model", message: "This model is not available for the selected provider or API key." };
  }
  if (status === 400 || code === "invalid_argument") {
    return { ok: false, health: "invalid-model", message: "The selected model does not support this request configuration. Choose another text model or retry after updating it." };
  }
  if (status === 402 || code === "quota_exceeded" || code === "insufficient_quota" || code === "billing_hard_limit") {
    return { ok: false, health: "quota", message: "The provider reported a quota or balance limit." };
  }
  if (status === 429 || code === "rate_limit_exceeded") {
    return { ok: false, health: "rate-limit", message: "The provider rate limit was exceeded; retry shortly." };
  }
  return { ok: false, health: "connectivity", message: fallback };
}

function classifyTransportFailure(error: unknown): ProviderCheckResult {
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const code = typeof candidate.code === "string" ? candidate.code.toUpperCase() : "";
  const detail = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  if (name === "TimeoutError" || code === "ETIMEDOUT" || detail.includes("timed out") || detail.includes("timeout")) {
    return { ok: false, health: "timeout", message: "Gemini did not respond before the connection check timed out. Retry shortly." };
  }
  if (name === "AbortError") {
    return { ok: false, health: "connectivity", message: "The Gemini connection check was cancelled before it completed. Retry." };
  }
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "ENETDOWN"].includes(code) || detail.includes("dns") || detail.includes("network")) {
    return { ok: false, health: "connectivity", message: "Gemini network or DNS connection failed. Check your network and retry." };
  }
  if (["CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT"].includes(code) || detail.includes("certificate") || detail.includes("tls")) {
    return { ok: false, health: "connectivity", message: "Gemini TLS certificate verification failed. Check your proxy or network security settings." };
  }
  if (detail.includes("proxy")) {
    return { ok: false, health: "connectivity", message: "Gemini proxy connection failed. Check your proxy settings and retry." };
  }
  return { ok: false, health: "connectivity", message: "Gemini transport connection failed. Check your network or proxy settings and retry." };
}

async function readError(response: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = await response.json() as { error?: { code?: string | number; status?: string; message?: string } };
    const rawCode = body.error?.status ?? (typeof body.error?.code === "string" ? body.error.code : undefined);
    return { code: rawCode?.toLowerCase(), message: body.error?.message };
  } catch {
    return {};
  }
}

export async function checkGeminiProvider(model: string, key: string, fetchImpl: FetchLike = fetch): Promise<ProviderCheckResult> {
  const modelEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`;
  const endpoint = `${modelEndpoint}:generateContent`;
  try {
    const connection = await fetchImpl(modelEndpoint, {
      method: "GET",
      headers: { "x-goog-api-key": key },
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    if (!connection.ok) {
      const error = await readError(connection);
      return classifyHttpFailure(connection.status, error.code, error.message ?? `Gemini returned HTTP ${connection.status} while checking the model.`);
    }
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with exactly OK." }] }], generationConfig: { maxOutputTokens: 4 } }),
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    });
    if (!response.ok) {
      const error = await readError(response);
      return classifyHttpFailure(response.status, error.code, error.message ?? `Gemini returned HTTP ${response.status}.`);
    }
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) return { ok: false, health: "connectivity", message: "Gemini accepted the request but returned no text response." };
    return { ok: true, checkedAt: new Date().toISOString() };
  } catch (error) {
    return classifyTransportFailure(error);
  }
}

export async function checkOpenAICompatibleProvider(model: string, baseUrl: string, key: string, fetchImpl: FetchLike = fetch): Promise<ProviderCheckResult> {
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly OK." }], temperature: 0, max_tokens: 4 }),
      signal: AbortSignal.timeout(12_000),
      redirect: "error",
    });
    if (!response.ok) {
      const error = await readError(response);
      return classifyHttpFailure(response.status, error.code, error.message ?? `Provider returned HTTP ${response.status}.`);
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    if (!payload.choices?.[0]?.message?.content?.trim()) return { ok: false, health: "connectivity", message: "The provider accepted the request but returned no text response." };
    return { ok: true, checkedAt: new Date().toISOString() };
  } catch {
    return { ok: false, health: "connectivity", message: "DWI could not reach the configured provider. Check your network or endpoint." };
  }
}

function rewriteHttpFailure(status: number, code?: string): ProviderRewriteError {
  const classified = classifyHttpFailure(status, code?.toLowerCase(), `The provider endpoint returned HTTP ${status}.`);
  if (classified.ok) return new ProviderRewriteError("connectivity", "The provider returned an unexpected response.");
  return new ProviderRewriteError(classified.health, classified.message);
}

/** Sends only the already-bounded compiled prompt to the explicitly configured
 * provider and validates the provider's structured rewrite before returning it. */
export async function rewritePromptWithProvider(
  settings: ProviderSettings,
  key: string,
  compiledPrompt: string,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<PromptOptimizeResult> {
  if (!settings.configured || settings.health !== "ready" || settings.mode === "none" || !settings.model) {
    throw new ProviderRewriteError("connectivity", "Configure and verify an LLM provider before asking it to rewrite the prompt.");
  }
  const startedAt = Date.now();
  try {
    if (settings.mode === "gemini") {
      const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(buildGeminiGenerateContentBody({ provider: "gemini", model: settings.model, compiledPrompt })),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
        redirect: "error",
      });
      if (!response.ok) {
        const error = await readError(response);
        throw rewriteHttpFailure(response.status, error.code);
      }
      return parseGeminiGenerateContentResponse(await response.text(), {
        model: settings.model,
        latencyMs: Date.now() - startedAt,
      });
    }

    if (!settings.baseUrl) throw new ProviderRewriteError("connectivity", "The provider endpoint is not configured.");
    const input = buildPromptProviderInput({ provider: "openai", model: settings.model, compiledPrompt });
    const response = await fetchImpl(`${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }],
        temperature: input.temperature,
        max_tokens: input.maxOutputTokens,
        response_format: { type: "json_object" },
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45_000)]) : AbortSignal.timeout(45_000),
      redirect: "error",
    });
    if (!response.ok) {
      const error = await readError(response);
      throw rewriteHttpFailure(response.status, error.code);
    }
    const payload = await response.json() as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };
    const choice = payload.choices?.[0];
    if (!choice?.message?.content || !choice.finish_reason) {
      throw new ProviderRewriteError("connectivity", "The provider returned an incomplete prompt rewrite.");
    }
    return parsePromptProviderResultText(choice.message.content, {
      provider: "openai",
      model: settings.model,
      finishReason: choice.finish_reason,
      latencyMs: Date.now() - startedAt,
      usage: {
        ...(payload.usage?.prompt_tokens !== undefined ? { inputTokens: payload.usage.prompt_tokens } : {}),
        ...(payload.usage?.completion_tokens !== undefined ? { outputTokens: payload.usage.completion_tokens } : {}),
        ...(payload.usage?.total_tokens !== undefined ? { totalTokens: payload.usage.total_tokens } : {}),
      },
    });
  } catch (error) {
    if (error instanceof ProviderRewriteError) throw error;
    const candidate = error as { name?: string; code?: string; message?: string };
    if (candidate.name === "TimeoutError" || candidate.code === "ETIMEDOUT" || candidate.message?.toLowerCase().includes("timeout")) {
      throw new ProviderRewriteError("timeout", "The provider rewrite timed out. Retry shortly.");
    }
    if (candidate.code === "ENOTFOUND" || candidate.code === "EAI_AGAIN") {
      throw new ProviderRewriteError("connectivity", "The provider host could not be resolved. Check DNS, proxy, and endpoint settings.");
    }
    throw new ProviderRewriteError("connectivity", "The provider rewrite failed because of a network, TLS, proxy, endpoint, or invalid-response error.");
  }
}
