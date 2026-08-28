import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createProjectSnapshot, type DwiProjectSnapshot } from "@platform/dwi-core";
import { CatalogStoreError, EncryptedCatalogStore, catalogSnapshotHash } from "./store.js";

const NOW = "2026-08-26T12:00:00.000Z";
const SECRET = "test-secret-at-least-sixteen-bytes";

describe("encrypted catalog store", () => {
  it("encrypts full evidence, reads it back, summarizes it, and audits access", async () => {
    const directory = await temporaryDirectory();
    const store = new EncryptedCatalogStore(directory, SECRET, {
      allowInlineEvidenceContent: true,
      now: () => NOW,
    });
    const snapshot = projectSnapshot(
      "commerce/payments",
      "payments",
      "private-evidence-marker",
      undefined,
      true,
    );

    expect(snapshot.resolution.status).toBe("partial");
    const written = await store.put(snapshot, "writer@example.test");

    expect(written).toMatchObject({ id: "commerce/payments", evidenceCount: 1 });
    expect((await store.get(snapshot.metadata.id, "reader@example.test"))?.evidence[0]?.content)
      .toBe("private-evidence-marker");
    expect(await store.list("reader@example.test")).toHaveLength(1);

    const files = await readdir(directory);
    const encryptedPath = join(directory, encryptedFile(files));
    const encrypted = await readFile(encryptedPath, "utf8");
    expect(encrypted).not.toContain("private-evidence-marker");
    expect(encrypted).not.toContain("commerce/payments");
    if (process.platform !== "win32") {
      expect((await stat(encryptedPath)).mode & 0o777).toBe(0o600);
    }

    const audit = await readFile(join(directory, "audit.jsonl"), "utf8");
    const events = audit.trim().split("\n").map((line) => JSON.parse(line) as { action: string });
    expect(events.map(({ action }) => action)).toEqual([
      "snapshot.write",
      "snapshot.read",
      "snapshot.list",
    ]);
  });

  it("rejects inline evidence by default and requires explicit opt-in to read it", async () => {
    const directory = await temporaryDirectory();
    const snapshot = projectSnapshot(
      "default/private-evidence",
      "private-evidence",
      "sensitive-inline-value",
      undefined,
      true,
    );
    const defaultStore = new EncryptedCatalogStore(directory, SECRET, () => NOW);

    await expect(defaultStore.put(snapshot, "writer")).rejects.toMatchObject({
      code: "inline_evidence_forbidden",
    });

    const optedInStore = new EncryptedCatalogStore(directory, SECRET, {
      allowInlineEvidenceContent: true,
      now: () => NOW,
    });
    await optedInStore.put(snapshot, "writer");
    expect((await optedInStore.get(snapshot.metadata.id, "reader"))?.evidence[0]?.content)
      .toBe("sensitive-inline-value");
    await expect(defaultStore.get(snapshot.metadata.id, "reader")).rejects.toMatchObject({
      code: "inline_evidence_forbidden",
    });

    const encrypted = await readFile(
      join(directory, encryptedFile(await readdir(directory))),
      "utf8",
    );
    expect(encrypted).not.toContain("sensitive-inline-value");
  });

  it("uses atomic replacement for concurrent writes and leaves no temporary files", async () => {
    const directory = await temporaryDirectory();
    const store = new EncryptedCatalogStore(directory, SECRET, () => NOW);
    const snapshots = Array.from({ length: 6 }, (_, index) =>
      projectSnapshot("default/concurrent", "concurrent", `revision-${index}`),
    );

    await Promise.all(snapshots.map((snapshot) => store.put(snapshot, "writer")));

    const files = await readdir(directory);
    expect(files.filter((name) => name.endsWith(".snapshot.enc"))).toHaveLength(1);
    expect(files.some((name) => name.endsWith(".tmp"))).toBe(false);
    const restored = await store.get("default/concurrent", "reader");
    expect(snapshots.map(({ evidence }) => evidence[0]?.selector)).toContain(
      restored?.evidence[0]?.selector,
    );
  });

  it("checks optimistic write preconditions inside a per-project write lock", async () => {
    const directory = await temporaryDirectory();
    const store = new EncryptedCatalogStore(directory, SECRET, () => NOW);
    const initial = projectSnapshot("default/cas", "cas", "initial", "initial state");
    await store.put(initial, "writer", { precondition: { kind: "create" } });

    await expect(store.put(initial, "writer", { precondition: { kind: "create" } }))
      .rejects.toMatchObject({
        code: "precondition_failed",
        currentSnapshotHash: catalogSnapshotHash(initial),
      });

    const candidateA = projectSnapshot("default/cas", "cas", "a", "candidate a");
    const candidateB = projectSnapshot("default/cas", "cas", "b", "candidate b");
    const precondition = {
      kind: "match" as const,
      snapshotHash: catalogSnapshotHash(initial),
    };
    const results = await Promise.allSettled([
      store.put(candidateA, "writer-a", { precondition }),
      store.put(candidateB, "writer-b", { precondition }),
    ]);

    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejection = results.find(({ status }) => status === "rejected");
    expect(rejection).toMatchObject({ status: "rejected", reason: { code: "precondition_failed" } });
    const current = await store.get("default/cas", "reader");
    expect([
      candidateA.resolution.effectiveSnapshotHash,
      candidateB.resolution.effectiveSnapshotHash,
    ]).toContain(current?.resolution.effectiveSnapshotHash);
  });

  it("versions provenance and review changes even when effective project content is unchanged", async () => {
    const directory = await temporaryDirectory();
    const store = new EncryptedCatalogStore(directory, SECRET, () => NOW);
    const initial = projectSnapshot("default/provenance", "provenance", "evidence-a", "same");
    const provenanceUpdate = projectSnapshot(
      "default/provenance",
      "provenance",
      "evidence-b",
      "same",
      false,
      "second-reviewer",
    );

    expect(provenanceUpdate.resolution.effectiveSnapshotHash)
      .toBe(initial.resolution.effectiveSnapshotHash);
    expect(catalogSnapshotHash(provenanceUpdate)).not.toBe(catalogSnapshotHash(initial));

    await store.put(initial, "writer", { precondition: { kind: "create" } });
    await store.put(provenanceUpdate, "writer", {
      precondition: { kind: "match", snapshotHash: catalogSnapshotHash(initial) },
    });
    const staleProvenance = projectSnapshot(
      "default/provenance",
      "provenance",
      "evidence-c",
      "same",
    );
    await expect(store.put(staleProvenance, "writer", {
      precondition: { kind: "match", snapshotHash: catalogSnapshotHash(initial) },
    })).rejects.toMatchObject({
      code: "precondition_failed",
      currentSnapshotHash: catalogSnapshotHash(provenanceUpdate),
    });
    expect((await store.get("default/provenance", "reader"))?.metadata.review.reviewedBy)
      .toBe("second-reviewer");
  });

  it("rejects tampering and a snapshot file moved to another project key", async () => {
    const directory = await temporaryDirectory();
    const store = new EncryptedCatalogStore(directory, SECRET, () => NOW);
    await store.put(projectSnapshot("default/alpha", "alpha", "alpha"), "writer");
    await store.put(projectSnapshot("default/beta", "beta", "beta"), "writer");

    const files = (await readdir(directory)).filter((name) => name.endsWith(".snapshot.enc"));
    const entries = await Promise.all(files.map(async (name) => ({
      name,
      envelope: JSON.parse(await readFile(join(directory, name), "utf8")) as {
        projectHash: string;
        ciphertext: string;
      },
    })));
    const alpha = entries.find(({ envelope }) => envelope.projectHash === filesHash("default/alpha"));
    const beta = entries.find(({ envelope }) => envelope.projectHash === filesHash("default/beta"));
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();

    await writeFile(join(directory, beta!.name), `${JSON.stringify(alpha!.envelope)}\n`, "utf8");
    await expect(store.get("default/beta", "reader")).rejects.toMatchObject({
      code: "corrupt_data",
    });

    const tampered = { ...alpha!.envelope };
    tampered.ciphertext = `${tampered.ciphertext[0] === "A" ? "B" : "A"}${tampered.ciphertext.slice(1)}`;
    await writeFile(join(directory, alpha!.name), `${JSON.stringify(tampered)}\n`, "utf8");
    await expect(store.get("default/alpha", "reader")).rejects.toMatchObject({
      code: "corrupt_data",
    });
  });

  it("rejects invalid input, invalid snapshots, and oversized snapshots", async () => {
    const directory = await temporaryDirectory();
    const store = new EncryptedCatalogStore(directory, SECRET, () => NOW);
    const snapshot = projectSnapshot("default/limits", "limits", "small");

    await expect(store.put(snapshot, "bad\nprincipal")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(store.get("   ", "reader")).rejects.toMatchObject({
      code: "invalid_input",
    });
    await expect(store.put({ ...snapshot, kind: "Wrong" } as never, "writer"))
      .rejects.toMatchObject({ code: "invalid_snapshot" });

    const unapproved: DwiProjectSnapshot = {
      ...snapshot,
      metadata: { ...snapshot.metadata, review: { state: "unreviewed" } },
    };
    await expect(store.put(unapproved, "writer")).rejects.toMatchObject({
      code: "snapshot_not_approved",
    });

    const reviewWithoutBinding = { ...snapshot.metadata.review };
    delete reviewWithoutBinding.reviewedSnapshotHash;
    const missingReviewBinding: DwiProjectSnapshot = {
      ...snapshot,
      metadata: { ...snapshot.metadata, review: reviewWithoutBinding },
    };
    await expect(store.put(missingReviewBinding, "writer")).rejects.toMatchObject({
      code: "review_binding_required",
    });

    const oversized = createProjectSnapshot({
      metadata: {
        id: "default/oversized",
        name: "oversized",
        revision: { generatedAt: NOW },
        review: { state: "approved", reviewedAt: NOW, reviewedBy: "catalog-test" },
      },
      evidence: Array.from({ length: 17 }, (_, index) => ({
        id: `oversized-${index}`,
        kind: "manifest" as const,
        content: "x".repeat(256 * 1024),
        collectedAt: NOW,
        redactions: [],
      })),
    });
    const inlineStore = new EncryptedCatalogStore(directory, SECRET, {
      allowInlineEvidenceContent: true,
      now: () => NOW,
    });
    await expect(inlineStore.put(oversized, "writer")).rejects.toMatchObject({
      code: "snapshot_too_large",
    });
  });

  it("rejects weak encryption secrets by UTF-8 byte length", () => {
    expect(() => new EncryptedCatalogStore("/tmp/unused", "short")).toThrow(/at least 16 bytes/);
    expect(() => new EncryptedCatalogStore("/tmp/unused", new Uint8Array(15)))
      .toThrow(CatalogStoreError);
    expect(() => new EncryptedCatalogStore("/tmp/unused", "🔐🔐🔐🔐")).not.toThrow();
  });
});

function projectSnapshot(
  id: string,
  name: string,
  marker: string,
  description?: string,
  includeInlineContent = false,
  reviewedBy = "catalog-test",
): DwiProjectSnapshot {
  return createProjectSnapshot({
    metadata: {
      id,
      name,
      revision: { generatedAt: NOW },
      review: { state: "approved", reviewedAt: NOW, reviewedBy },
    },
    spec: { identity: { description } },
    evidence: [
      {
        id: "ev-1",
        kind: "manifest",
        relativePath: "go.mod",
        selector: marker,
        ...(includeInlineContent ? { content: marker } : {}),
        collectedAt: NOW,
        redactions: [],
      },
    ],
  });
}

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "dwi-catalog-test-"));
}

function encryptedFile(files: readonly string[]): string {
  const file = files.find((name) => name.endsWith(".snapshot.enc"));
  if (!file) throw new Error("Encrypted snapshot file was not created.");
  return file;
}

function filesHash(projectId: string): string {
  // Hashing the ID is part of the on-disk key; reproduce it without exposing the ID in filenames.
  return createHash("sha256").update(projectId).digest("hex");
}
