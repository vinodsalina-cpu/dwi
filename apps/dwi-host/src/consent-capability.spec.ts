import { describe, expect, it } from "vitest";
import { ConsentCapabilityStore, consumeConsentCapability, issueConsentCapability } from "./consent-capability.js";

const binding = { workspaceFingerprint: "root-a", scopeDigest: "scope-a", epoch: 3 };

describe("consent capabilities", () => {
  it("binds approval to root, policy, epoch and consumes once", () => {
    const capability = issueConsentCapability(binding, 1000, "token");
    expect(consumeConsentCapability(capability, "token", binding, 1001)).toBe(true);
    expect(consumeConsentCapability(undefined, "token", binding, 1001)).toBe(false);
    expect(consumeConsentCapability(capability, "token", { ...binding, epoch: 4 }, 1001)).toBe(false);
    expect(consumeConsentCapability(capability, "token", { ...binding, workspaceFingerprint: "root-b" }, 1001)).toBe(false);
    expect(consumeConsentCapability(capability, "token", { ...binding, scopeDigest: "scope-b" }, 1001)).toBe(false);
  });

  it("expires after the bounded approval window", () => {
    const capability = issueConsentCapability(binding, 1000, "token");
    expect(consumeConsentCapability(capability, "token", binding, 301000)).toBe(true);
    expect(consumeConsentCapability(capability, "token", binding, 301001)).toBe(false);
  });

  it("isolates one-time capabilities for concurrent webviews", () => {
    const store = new ConsentCapabilityStore<string>(() => 1000);
    const homeToken = store.issue("home", binding);
    const optimizerToken = store.issue("optimizer", binding);

    expect(store.consume("home", homeToken, binding)).toBe(true);
    expect(store.consume("optimizer", optimizerToken, binding)).toBe(true);
    expect(store.consume("home", homeToken, binding)).toBe(false);
  });
});
