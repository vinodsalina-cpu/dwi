export type ProviderMode = "none" | "gemini" | "openai-compatible";
export interface ProviderSettings { mode: ProviderMode; model?: string; baseUrl?: string; configured: boolean }
export interface ProviderSettingsInput { mode: Exclude<ProviderMode, "none">; model: string; baseUrl?: string; key?: string }
export const PROVIDER_SETTINGS_KEY = "dwi.provider.settings.v1";
export const PROVIDER_SECRET_KEY = "dwi.provider.api-key.v1";

export function validateProviderSettings(input: ProviderSettingsInput): ProviderSettings {
  const model = input.model.trim();
  if (!model) throw new Error("Choose a model before saving.");
  if (input.mode === "openai-compatible") {
    const baseUrl = input.baseUrl?.trim();
    if (!baseUrl) throw new Error("Enter an HTTPS-compatible base URL.");
    try { const url = new URL(baseUrl); if (!/^https?:$/.test(url.protocol)) throw new Error(); } catch { throw new Error("Enter a valid HTTP or HTTPS base URL."); }
    return { mode: input.mode, model, baseUrl, configured: true };
  }
  return { mode: "gemini", model, configured: true };
}

export const noProviderSettings = (): ProviderSettings => ({ mode: "none", configured: false });
