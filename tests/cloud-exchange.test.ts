import test from "node:test";
import assert from "node:assert/strict";
import { exchange } from "../src/cloud-exchange.ts";
import { documentName } from "../src/sync-policy.ts";
import type { UsageDocument } from "../src/sync-policy.ts";
test("initial history uses bounded batches and continues without re-fetching completed entries", async () => {
  const docs = Array.from({ length: 20 }, (_, i) => ({
    protocol: 1 as const,
    kind: "usage" as const,
    deviceId: i.toString(16).padStart(32, "0"),
    day: "2026-11-05",
    seq: 1,
    used: {},
    segments: [],
  }));
  let reads = 0;
  const files = docs.map((doc, i) => ({
    id: String(i),
    name: documentName(doc),
    modifiedTime: "2026-11-05T00:00:00Z",
  }));
  const transport = {
    async list() {
      return files;
    },
    async read(file: { id: string }) {
      reads++;
      return docs[Number(file.id)]!;
    },
    async write() {
      throw Error("No writes expected");
    },
  };
  let state = await exchange(
    transport,
    [],
    "f".repeat(32),
    { cache: {}, hashes: {} },
    "2026-11-01",
  );
  assert.equal(reads, 8);
  assert.equal(state.partial, true);
  state = await exchange(transport, [], "f".repeat(32), state, "2026-11-01");
  state = await exchange(transport, [], "f".repeat(32), state, "2026-11-01");
  assert.equal(reads, 20);
  assert.equal(state.partial, false);
  assert.equal(Object.keys(state.cache).length, 20);
});
test("sync writes only its installation's files and avoids unchanged uploads", async () => {
  const id = "a".repeat(32),
    other = "b".repeat(32);
  const doc: UsageDocument = {
    protocol: 1,
    kind: "usage",
    deviceId: id,
    day: "2026-11-05",
    seq: 1,
    used: {},
    segments: [],
  };
  const foreign = { ...doc, deviceId: other };
  let writes = 0;
  const remote = new Map([[documentName(foreign), foreign]]);
  const transport = {
    async list() {
      return [...remote.keys()].map((name, i) => ({
        id: String(i),
        name,
        modifiedTime: "2026-11-05T00:00:00Z",
      }));
    },
    async read(file: { name: string }) {
      return remote.get(file.name)!;
    },
    async write(value: UsageDocument) {
      writes++;
      remote.set(documentName(value), value);
      return {
        id: "1",
        name: documentName(value),
        modifiedTime: "2026-11-05T00:00:00Z",
      };
    },
  };
  const first = await exchange(
    transport as never,
    [doc],
    id,
    { cache: {}, hashes: {} },
    "2026-11-01",
  );
  assert.equal(writes, 1);
  assert.equal(Object.values(first.cache)[0]!.document.deviceId, other);
  await exchange(
    transport as never,
    [{ ...doc, seq: 2 }],
    id,
    first,
    "2026-11-01",
  );
  assert.equal(writes, 1);
  await assert.rejects(
    () => exchange(transport as never, [foreign], id, first, "2026-11-01"),
    /another installation/,
  );
});
