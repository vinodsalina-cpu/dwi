import { describe, expect, it } from "vitest";
import { PROVIDER_SECRET_KEY, PROVIDER_SETTINGS_KEY, noProviderSettings, validateProviderSettings } from "./provider-settings.js";

describe("DWI provider settings", () => {
  it("persists only non-secret provider metadata", () => {
    expect(validateProviderSettings({ mode: "gemini", model: "gemini-2.5-pro", key: "never-persist-me" })).toEqual({ mode: "gemini", model: "gemini-2.5-pro", configured: true });
    expect(PROVIDER_SETTINGS_KEY).not.toContain("key"); expect(PROVIDER_SECRET_KEY).toMatch(/^dwi\./); expect(noProviderSettings()).toEqual({ mode: "none", configured: false });
  });
  it("rejects invalid non-secret configuration", () => {
    expect(() => validateProviderSettings({ mode: "gemini", model: "" })).toThrow(/model/);
    expect(() => validateProviderSettings({ mode: "openai-compatible", model: "x", baseUrl: "not a url" })).toThrow(/valid/);
  });
});
