export const SAFE_PROBE_MAX_TIMEOUT_MS = 5_000;
export const SAFE_PROBE_MAX_OUTPUT_BYTES = 64 * 1024;

export type SafeProbeEcosystem =
  | "node"
  | "python"
  | "go"
  | "cargo"
  | "maven"
  | "gradle"
  | "dotnet"
  | "composer"
  | "cmake"
  | "shell"
  | "terraform";

export interface SafeProbePolicy {
  spawn: "direct";
  shell: false;
  network: "disabled";
  filesystem: "read-only";
  timeoutMs: number;
  maxOutputBytes: number;
  maxProcesses: 1;
}

export interface SafeProbeDescriptor {
  id: string;
  ecosystem: SafeProbeEcosystem;
  executable: string;
  argv: readonly string[];
  cwd: string;
  policy: SafeProbePolicy;
}

export type SafeProbeViolationCode =
  | "UNKNOWN_PROBE"
  | "COMMAND_MISMATCH"
  | "INVALID_WORKING_DIRECTORY"
  | "SHELL_FORBIDDEN"
  | "NETWORK_FORBIDDEN"
  | "WRITE_ACCESS_FORBIDDEN"
  | "TIMEOUT_OUT_OF_BOUNDS"
  | "OUTPUT_OUT_OF_BOUNDS"
  | "PROCESS_COUNT_OUT_OF_BOUNDS";

export interface SafeProbeValidationResult {
  valid: boolean;
  violations: Array<{
    code: SafeProbeViolationCode;
    message: string;
  }>;
}

const defaultPolicy = (): SafeProbePolicy => ({
  spawn: "direct",
  shell: false,
  network: "disabled",
  filesystem: "read-only",
  timeoutMs: SAFE_PROBE_MAX_TIMEOUT_MS,
  maxOutputBytes: SAFE_PROBE_MAX_OUTPUT_BYTES,
  maxProcesses: 1,
});

const probe = (
  id: string,
  ecosystem: SafeProbeEcosystem,
  executable: string,
  argv: readonly string[],
): SafeProbeDescriptor =>
  Object.freeze({
    id,
    ecosystem,
    executable,
    argv: Object.freeze([...argv]),
    cwd: ".",
    policy: Object.freeze(defaultPolicy()),
  });

/**
 * Pack-owned probes. Repository content is never interpolated into argv.
 * Hosts must still enforce the declared network/filesystem/process sandbox.
 */
export const SAFE_PROBE_CATALOG: readonly SafeProbeDescriptor[] = Object.freeze([
  probe("node.version", "node", "node", ["--version"]),
  probe("python.version", "python", "python", [
    "-I",
    "-S",
    "-c",
    'import sys; print(".".join(map(str, sys.version_info[:3])))',
  ]),
  probe("go.environment", "go", "go", ["env", "GOMOD", "GOVERSION"]),
  probe("cargo.metadata", "cargo", "cargo", [
    "metadata",
    "--frozen",
    "--no-deps",
    "--format-version",
    "1",
  ]),
  probe("maven.version", "maven", "mvn", ["--version"]),
  probe("gradle.version", "gradle", "gradle", ["--version"]),
  probe("dotnet.version", "dotnet", "dotnet", ["--version"]),
  probe("composer.version", "composer", "composer", ["--version"]),
  probe("cmake.version", "cmake", "cmake", ["--version"]),
  probe("shellcheck.version", "shell", "shellcheck", ["--version"]),
  probe("terraform.version", "terraform", "terraform", [
    "version",
    "-json",
  ]),
]);

function isNormalizedRelativeDirectory(value: string): boolean {
  if (!value || value.includes("\\") || value.startsWith("/")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  const segments = value.split("/");
  return (
    segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== ".." &&
        segment !== "." &&
        !segment.includes(":") &&
        ![...segment].some((character) => character.charCodeAt(0) < 32),
    ) || value === "."
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function validateSafeProbeDescriptor(
  descriptor: SafeProbeDescriptor,
): SafeProbeValidationResult {
  const violations: SafeProbeValidationResult["violations"] = [];
  const canonical = SAFE_PROBE_CATALOG.find(({ id }) => id === descriptor.id);
  if (!canonical) {
    violations.push({
      code: "UNKNOWN_PROBE",
      message: `Probe ${descriptor.id} is not in the first-party catalog.`,
    });
  } else if (
    descriptor.ecosystem !== canonical.ecosystem ||
    descriptor.executable !== canonical.executable ||
    !arraysEqual(descriptor.argv, canonical.argv)
  ) {
    violations.push({
      code: "COMMAND_MISMATCH",
      message: "Executable and argv must exactly match the pack-owned command.",
    });
  }
  if (!isNormalizedRelativeDirectory(descriptor.cwd)) {
    violations.push({
      code: "INVALID_WORKING_DIRECTORY",
      message: "Working directory must be a normalized repository-relative path.",
    });
  }
  if (descriptor.policy.spawn !== "direct" || descriptor.policy.shell !== false) {
    violations.push({
      code: "SHELL_FORBIDDEN",
      message: "Safe probes must spawn the executable directly without a shell.",
    });
  }
  if (descriptor.policy.network !== "disabled") {
    violations.push({
      code: "NETWORK_FORBIDDEN",
      message: "Safe probes must run with network access disabled.",
    });
  }
  if (descriptor.policy.filesystem !== "read-only") {
    violations.push({
      code: "WRITE_ACCESS_FORBIDDEN",
      message: "Safe probes must run against a read-only workspace.",
    });
  }
  if (
    !Number.isInteger(descriptor.policy.timeoutMs) ||
    descriptor.policy.timeoutMs <= 0 ||
    descriptor.policy.timeoutMs > SAFE_PROBE_MAX_TIMEOUT_MS
  ) {
    violations.push({
      code: "TIMEOUT_OUT_OF_BOUNDS",
      message: `Timeout must be between 1 and ${SAFE_PROBE_MAX_TIMEOUT_MS} ms.`,
    });
  }
  if (
    !Number.isInteger(descriptor.policy.maxOutputBytes) ||
    descriptor.policy.maxOutputBytes <= 0 ||
    descriptor.policy.maxOutputBytes > SAFE_PROBE_MAX_OUTPUT_BYTES
  ) {
    violations.push({
      code: "OUTPUT_OUT_OF_BOUNDS",
      message: `Output must be between 1 and ${SAFE_PROBE_MAX_OUTPUT_BYTES} bytes.`,
    });
  }
  if (descriptor.policy.maxProcesses !== 1) {
    violations.push({
      code: "PROCESS_COUNT_OUT_OF_BOUNDS",
      message: "Safe probes are limited to one process.",
    });
  }
  return { valid: violations.length === 0, violations };
}

export function safeProbesForEcosystems(
  roots: readonly { ecosystem: SafeProbeEcosystem; cwd: string }[],
): SafeProbeDescriptor[] {
  const selected = new Map<string, SafeProbeDescriptor>();
  for (const { ecosystem, cwd } of roots) {
    for (const canonical of SAFE_PROBE_CATALOG) {
      if (canonical.ecosystem !== ecosystem) continue;
      const descriptor: SafeProbeDescriptor = {
        ...canonical,
        argv: [...canonical.argv],
        cwd,
        policy: { ...canonical.policy },
      };
      const validation = validateSafeProbeDescriptor(descriptor);
      if (!validation.valid) continue;
      selected.set(`${descriptor.id}:${descriptor.cwd}`, descriptor);
    }
  }
  return [...selected.values()].sort((left, right) => {
    const leftKey = `${left.cwd}:${left.id}`;
    const rightKey = `${right.cwd}:${right.id}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}
