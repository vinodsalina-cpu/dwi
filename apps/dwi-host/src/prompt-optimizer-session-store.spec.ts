import { describe, expect, it } from "vitest";
import {
  PROMPT_OPTIMIZER_SESSIONS_KEY,
  PROMPT_OPTIMIZER_SESSIONS_SCHEMA,
  PROMPT_OPTIMIZER_SESSION_BYTES_LIMIT,
  PROMPT_OPTIMIZER_SESSION_SCHEMA,
  PromptOptimizerSessionStore,
  PromptOptimizerSessionStoreError,
  parsePromptOptimizerSession,
  serializedUtf8ByteLength,
  type PromptOptimizerSessionStorage,
} from "./prompt-optimizer-session-store.js";

const fpA = "a".repeat(24);
const fpB = "b".repeat(24);
const now = "2026-09-01T00:00:00.000Z";
const draft = { task: "Keep this local.", assignmentId: "assignment-1", promptType: "General" as const, outputSize: "medium" as const };

class MemoryStorage implements PromptOptimizerSessionStorage {
  updates: unknown[] = [];
  constructor(public value?: unknown, readonly fail = false) {}
  get<T>(key: string): T | undefined { expect(key).toBe(PROMPT_OPTIMIZER_SESSIONS_KEY); return structuredClone(this.value) as T; }
  async update(key: string, value: unknown): Promise<void> {
    expect(key).toBe(PROMPT_OPTIMIZER_SESSIONS_KEY);
    if (this.fail) throw new Error("disk");
    this.value = structuredClone(value); this.updates.push(structuredClone(value));
  }
}

const session = (workspaceFingerprint = fpA) => ({ workspaceFingerprint, view: "input" as const, draft, recents: [] });
const candidate = { text: "Local candidate", selectedModuleIds: [], estimate: { baselineTokens: 10, optimizedTokens: 8, estimatedAvoidedDuplication: 2, method: "bounded" } };

describe("prompt optimizer session store", () => {
  it("persists and restores only the matching local workspace", async () => {
    const storage = new MemoryStorage();
    const store = new PromptOptimizerSessionStore(storage, () => now);
    const saved = await store.save(session(), "new");
    expect(saved.revision).toBe(1);
    expect(store.open(fpA)).toEqual({ status: "ready", session: saved });
    expect(store.open(fpB)).toEqual({ status: "absent" });
  });

  it("retains an exact resolve checkpoint even when context invalidates its candidate", async () => {
    const storage = new MemoryStorage();
    const store = new PromptOptimizerSessionStore(storage, () => now);
    const saved = await store.save({ ...session(), view: "resolve" }, "new");
    expect(store.open(fpA)).toEqual({ status: "ready", session: saved });
  });

  it("rejects stale writes and preserves the stored session", async () => {
    const storage = new MemoryStorage();
    const store = new PromptOptimizerSessionStore(storage, () => now);
    await store.save(session(), "new");
    const before = structuredClone(storage.value);
    await expect(store.save({ ...session(), view: "review" }, "new")).rejects.toMatchObject({ code: "conflict" });
    expect(storage.value).toEqual(before);
  });

  it("leaves corrupt and unknown-version state unchanged", async () => {
    for (const value of [
      { schema: PROMPT_OPTIMIZER_SESSIONS_SCHEMA, revision: 1, sessions: [{ bad: true }] },
      { schema: "dwi.prompt-optimizer.sessions.v2", revision: 1, sessions: [] },
    ]) {
      const storage = new MemoryStorage(value);
      const store = new PromptOptimizerSessionStore(storage, () => now);
      expect(store.open(fpA).status).toBe("unavailable");
      await expect(store.save(session(), "new")).rejects.toBeInstanceOf(PromptOptimizerSessionStoreError);
      expect(storage.value).toEqual(value);
      expect(storage.updates).toEqual([]);
    }
  });

  it("enforces exact keys, content limits, and a maximum of five recents", async () => {
    const store = new PromptOptimizerSessionStore(new MemoryStorage(), () => now);
    await expect(store.save({ ...session(), draft: { ...draft, task: "x".repeat(100_001) } }, "new")).rejects.toMatchObject({ code: "limit" });
    await expect(store.save({ ...session(), recents: Array.from({ length: 6 }, (_, index) => ({ id: `recent-${index}`, title: "Title", preview: "Preview", promptType: "General" as const, updatedAt: now })) }, "new")).rejects.toMatchObject({ code: "limit" });
  });

  it("enforces the session limit at the exact serialized UTF-8 byte boundary", () => {
    const base = {
      ...session(),
      schema: PROMPT_OPTIMIZER_SESSION_SCHEMA,
      revision: 1,
      updatedAt: now,
      candidate: { ...candidate, text: "" },
      review: { source: "local" as const },
    };
    const baseBytes = serializedUtf8ByteLength(base)!;
    const exact = { ...base, candidate: { ...base.candidate, text: "x".repeat(PROMPT_OPTIMIZER_SESSION_BYTES_LIMIT - baseBytes) } };
    expect(serializedUtf8ByteLength(exact)).toBe(PROMPT_OPTIMIZER_SESSION_BYTES_LIMIT);
    expect(parsePromptOptimizerSession(exact)).toBeDefined();
    const over = { ...exact, candidate: { ...exact.candidate, text: `${exact.candidate.text}x` } };
    expect(serializedUtf8ByteLength(over)).toBe(PROMPT_OPTIMIZER_SESSION_BYTES_LIMIT + 1);
    expect(parsePromptOptimizerSession(over)).toBeUndefined();
  });

  it("counts multibyte Unicode as serialized UTF-8 bytes and handles serialization failure", () => {
    const stored = {
      ...session(),
      schema: PROMPT_OPTIMIZER_SESSION_SCHEMA,
      revision: 1,
      updatedAt: now,
      candidate: { ...candidate, text: "€".repeat(90_000) },
      review: { source: "local" as const },
    };
    expect(JSON.stringify(stored).length).toBeLessThan(PROMPT_OPTIMIZER_SESSION_BYTES_LIMIT);
    expect(serializedUtf8ByteLength(stored)).toBeGreaterThan(PROMPT_OPTIMIZER_SESSION_BYTES_LIMIT);
    expect(parsePromptOptimizerSession(stored)).toBeUndefined();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(serializedUtf8ByteLength(cyclic)).toBeUndefined();
    expect(new PromptOptimizerSessionStore(new MemoryStorage(cyclic), () => now).open(fpA)).toEqual({ status: "unavailable", reason: "corrupt" });
  });

  it("classifies an oversized serialized envelope without rewriting it", () => {
    const value = {
      schema: PROMPT_OPTIMIZER_SESSIONS_SCHEMA,
      revision: 1,
      sessions: [],
      extra: "x".repeat(PROMPT_OPTIMIZER_SESSION_BYTES_LIMIT * 50),
    };
    const storage = new MemoryStorage(value);
    expect(new PromptOptimizerSessionStore(storage, () => now).open(fpA)).toEqual({ status: "unavailable", reason: "oversized" });
    expect(storage.updates).toEqual([]);
  });

  it("resets only one optimizer session", async () => {
    const storage = new MemoryStorage();
    const store = new PromptOptimizerSessionStore(storage, () => now);
    await store.save(session(fpA), "new");
    await store.save(session(fpB), "new");
    expect(await store.reset(fpA)).toBe(true);
    expect(store.open(fpA)).toEqual({ status: "absent" });
    expect(store.open(fpB).status).toBe("ready");
  });

  it("migrates legacy state once without overwriting newer session edits", async () => {
    const storage = new MemoryStorage();
    const store = new PromptOptimizerSessionStore(storage, () => now);
    const migrated = await store.migrateLegacy(fpA, { view: "review", draft, recents: [] });
    expect(migrated).toMatchObject({ status: "ready", session: { revision: 1, view: "review", draft } });
    const repeated = await store.migrateLegacy(fpA, { view: "input", recents: [] });
    expect(repeated).toEqual(migrated);
    expect(storage.updates).toHaveLength(1);
  });

  it("persists a validated candidate and review as one recovery unit", async () => {
    const store = new PromptOptimizerSessionStore(new MemoryStorage(), () => now);
    const saved = await store.save({ ...session(), candidate, review: { source: "local" } }, "new");
    expect(store.open(fpA)).toEqual({ status: "ready", session: saved });
    await expect(store.save({ ...session(fpB), candidate, review: { source: "provider", provider: "openai", model: "" } }, "new"))
      .rejects.toMatchObject({ code: "limit" });
  });

  it("does not migrate over unknown newer-version state", async () => {
    const value = { schema: "dwi.prompt-optimizer.sessions.v2", revision: 1, sessions: [] };
    const storage = new MemoryStorage(value);
    const store = new PromptOptimizerSessionStore(storage, () => now);
    expect(await store.migrateLegacy(fpA, { draft })).toEqual({ status: "unavailable", reason: "newer-version" });
    expect(storage.value).toEqual(value);
    expect(storage.updates).toEqual([]);
  });

  it("reports storage failure without claiming success", async () => {
    const store = new PromptOptimizerSessionStore(new MemoryStorage(undefined, true), () => now);
    await expect(store.save(session(), "new")).rejects.toMatchObject({ code: "storage" });
  });
});
