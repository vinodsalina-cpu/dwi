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
