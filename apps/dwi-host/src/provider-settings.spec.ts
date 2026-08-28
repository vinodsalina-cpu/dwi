import { describe, expect, it } from "vitest";
import { PROVIDER_SECRET_KEY, PROVIDER_SETTINGS_KEY, checkGeminiProvider, checkOpenAICompatibleProvider, noProviderSettings, rewritePromptWithProvider, validateProviderSettings } from "./provider-settings.js";

describe("DWI provider settings", () => {
  it("persists only non-secret provider metadata", () => {
    expect(validateProviderSettings({ mode: "gemini", model: "gemini-2.5-pro", key: "never-persist-me" })).toEqual({ mode: "gemini", model: "gemini-2.5-pro", configured: false, health: "unverified" });
    expect(PROVIDER_SETTINGS_KEY).not.toContain("key"); expect(PROVIDER_SECRET_KEY).toMatch(/^dwi\./); expect(noProviderSettings()).toEqual({ mode: "none", configured: false, health: "missing" });
  });
  it("rejects invalid non-secret configuration", () => {
    expect(() => validateProviderSettings({ mode: "gemini", model: "" })).toThrow(/model/);
    expect(() => validateProviderSettings({ mode: "openai-compatible", model: "x", baseUrl: "not a url" })).toThrow(/valid/);
    expect(() => validateProviderSettings({ mode: "gemini", model: "not a valid model!" })).toThrow(/model ID/);
    expect(() => validateProviderSettings({ mode: "openai-compatible", model: "xx", baseUrl: "http://example.com" })).toThrow(/HTTPS/);
    expect(() => validateProviderSettings({ mode: "openai-compatible", model: "xx", baseUrl: "https://user:pass@example.com" })).toThrow(/credentials/);
    expect(validateProviderSettings({ mode: "openai-compatible", model: "xx", baseUrl: "http://localhost:8080/v1/" }).baseUrl).toBe("http://localhost:8080/v1");
  });

  it("requires an actual Gemini text response", async () => {
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "GET") return new Response(JSON.stringify({ name: "models/gemini-3.7-flash" }), { status: 200 });
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }), { status: 200 });
    };
    await expect(checkGeminiProvider("gemini-3.7-flash", "secret", fetchImpl)).resolves.toMatchObject({ ok: true });
  });

  it("never follows redirects for an OpenAI-compatible credential check", async () => {
    let called = false;
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      called = true;
      expect(init?.redirect).toBe("error");
      return new Response("", { status: 302, headers: { location: "https://attacker.example" } });
    };
    await expect(checkOpenAICompatibleProvider("x", "https://provider.example/v1", "secret", fetchImpl)).resolves.toMatchObject({ ok: false, health: "connectivity" });
    expect(called).toBe(true);
  });

  it("normalizes credential, quota, and model failures", async () => {
    const response = (status: number, code: string) => async () => new Response(JSON.stringify({ error: { status: code, message: "failure" } }), { status });
    await expect(checkGeminiProvider("gemini-3.7-flash", "secret", response(401, "UNAUTHENTICATED"))).resolves.toMatchObject({ ok: false, health: "invalid-credential" });
    await expect(checkGeminiProvider("gemini-3.7-flash", "secret", response(429, "QUOTA_EXCEEDED"))).resolves.toMatchObject({ ok: false, health: "quota" });
    await expect(checkGeminiProvider("gemini-3.7-flash", "secret", response(429, "RATE_LIMIT_EXCEEDED"))).resolves.toMatchObject({ ok: false, health: "rate-limit" });
    await expect(checkGeminiProvider("gemini-3.7-flash", "secret", response(400, "INVALID_ARGUMENT"))).resolves.toMatchObject({ ok: false, health: "invalid-model" });
    await expect(checkGeminiProvider("unknown", "secret", response(404, "NOT_FOUND"))).resolves.toMatchObject({ ok: false, health: "invalid-model" });
  });

  it("classifies Gemini transport failures without exposing error details", async () => {
    const thrown = (error: unknown) => async () => { throw error; };
    await expect(checkGeminiProvider("x", "secret", thrown(Object.assign(new Error("socket timed out for https://secret.example"), { code: "ETIMEDOUT" })))).resolves.toEqual({ ok: false, health: "timeout", message: expect.stringContaining("timed out") });
    await expect(checkGeminiProvider("x", "secret", thrown(Object.assign(new Error("lookup failed"), { code: "ENOTFOUND" })))).resolves.toMatchObject({ health: "connectivity", message: expect.stringContaining("DNS") });
    await expect(checkGeminiProvider("x", "secret", thrown(Object.assign(new Error("bad certificate"), { code: "CERT_HAS_EXPIRED" })))).resolves.toMatchObject({ health: "connectivity", message: expect.stringContaining("TLS") });
    await expect(checkGeminiProvider("x", "secret", thrown(new DOMException("cancelled", "AbortError")))).resolves.toMatchObject({ health: "connectivity", message: expect.stringContaining("cancelled") });
    const generic = await checkGeminiProvider("x", "secret", thrown(new Error("secret-key https://private.example")));
    expect(generic).toMatchObject({ health: "connectivity", message: expect.stringContaining("transport") });
    expect(generic).not.toMatchObject({ message: expect.stringContaining("private.example") });
  });

  it("rewrites through a verified provider without placing the credential in the body", async () => {
    const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret");
      expect(String(init?.body)).toContain("Bounded local prompt");
      expect(String(init?.body)).not.toContain("secret");
      const structured = { optimizedPrompt: "Optimized prompt", title: "Result", summary: "Improved", improvements: [], remainingQuestions: [], warnings: [] };
      return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(structured) }] } }] }), { status: 200 });
    };
    await expect(rewritePromptWithProvider({ mode: "gemini", model: "gemini-2.5-flash", configured: true, health: "ready" }, "secret", "Bounded local prompt", fetchImpl)).resolves.toMatchObject({ optimizedPrompt: "Optimized prompt", provider: "gemini", model: "gemini-2.5-flash" });
  });

  it("refuses a rewrite unless the provider passed its model-response check", async () => {
    await expect(rewritePromptWithProvider({ mode: "gemini", model: "gemini-2.5-flash", configured: false, health: "unverified" }, "secret", "Prompt")).rejects.toMatchObject({ message: expect.stringContaining("Configure and verify") });
  });
});
