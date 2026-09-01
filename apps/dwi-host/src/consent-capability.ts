import { randomUUID } from "node:crypto";

export interface ConsentBinding { workspaceFingerprint: string; scopeDigest: string; epoch: number }
export interface ConsentCapability extends ConsentBinding { token: string; expiresAt: number }

export function issueConsentCapability(binding: ConsentBinding, now = Date.now(), token = randomUUID()): ConsentCapability {
  return { ...binding, token, expiresAt: now + 5 * 60 * 1000 };
}

export function consumeConsentCapability(capability: ConsentCapability | undefined, token: string, binding: ConsentBinding, now = Date.now()): boolean {
  return Boolean(capability && token && capability.token === token && capability.epoch === binding.epoch
    && capability.workspaceFingerprint === binding.workspaceFingerprint && capability.scopeDigest === binding.scopeDigest
    && capability.expiresAt >= now);
}

/** Keeps one-time consent capabilities isolated to the webview that received them. */
export class ConsentCapabilityStore<Key> {
  private readonly capabilities = new Map<Key, ConsentCapability>();
  constructor(private readonly now = () => Date.now()) {}
  issue(key: Key, binding: ConsentBinding): string {
    const capability = issueConsentCapability(binding, this.now());
    this.capabilities.set(key, capability);
    return capability.token;
  }
  consume(key: Key, token: string, binding: ConsentBinding): boolean {
    const capability = this.capabilities.get(key);
    this.capabilities.delete(key);
    return consumeConsentCapability(capability, token, binding, this.now());
  }
  clear(): void { this.capabilities.clear(); }
}
