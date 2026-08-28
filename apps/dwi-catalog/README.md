# DWI catalog

The catalog stores reviewed project snapshots as authenticated AES-256-GCM envelopes. A snapshot is accepted only when its review state is `approved`, its `reviewedSnapshotHash` still binds the reviewed content and provenance, and its schema and integrity checks pass.

Inline `evidence[].content` is rejected on reads and writes by default because it may contain source code, credentials, or other private material. Prefer evidence hashes and selectors. A deployment that deliberately needs encrypted inline evidence must opt in at both boundaries:

```ts
const store = new EncryptedCatalogStore(directory, encryptionKey, {
  allowInlineEvidenceContent: true,
});

const server = createCatalogServer({
  store,
  authenticate,
  allowInlineEvidenceContent: true,
});
```

The bundled local server enables both only when `DWI_CATALOG_ALLOW_INLINE_EVIDENCE_CONTENT=true`. Treat this as a privacy-sensitive deployment decision and protect the encryption key separately from the data directory.

HTTP creation requires `If-None-Match: *`. Updates require one strong `If-Match` ETag returned by the latest GET or PUT. ETags hash the complete persisted snapshot, including evidence and review provenance; `resolution.effectiveSnapshotHash` remains the identity of only the effective semantic project content.
