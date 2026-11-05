import { documentName, compareRevision } from "./sync-policy.ts";
import type { SyncDocument, SettingsDocument } from "./sync-policy.ts";
import type { DriveFile } from "./drive.ts";
export interface CacheEntry {
  modifiedTime: string;
  document: SyncDocument;
}
export interface ExchangeState {
  cache: Record<string, CacheEntry>;
  hashes: Record<string, string>;
  partial?: boolean;
}
export interface DriveTransport {
  list(): Promise<DriveFile[]>;
  read(file: DriveFile): Promise<SyncDocument>;
  write(doc: SyncDocument, file?: DriveFile): Promise<DriveFile>;
}
export async function exchange(
  transport: DriveTransport,
  local: SyncDocument[],
  deviceId: string,
  previous: ExchangeState,
  cutoff: string,
  isActive: () => boolean = () => true,
): Promise<ExchangeState> {
  const deadline = Date.now() + 90000;
  let requests = 12,
    reads = 0,
    partial = false,
    cacheBytes = 0;
  const files = await transport.list(),
    byName = new Map<string, DriveFile>();
  for (const file of files) {
    const prior = byName.get(file.name);
    if (!prior || file.modifiedTime > prior.modifiedTime)
      byName.set(file.name, file);
  }
  const cache: Record<string, CacheEntry> = {},
    hashes = { ...previous.hashes };
  const ordered = [...byName].sort(
    ([a], [b]) =>
      Number(b.endsWith("_settings.json")) -
        Number(a.endsWith("_settings.json")) ||
      b.slice(-15, -5).localeCompare(a.slice(-15, -5)),
  );
  for (const [name, file] of ordered) {
    if (!isActive()) throw Error("Sync cancelled");
    if (name.startsWith(`timeharbor-v1_${deviceId}_`)) continue;
    const day = name.slice(-15, -5);
    if (!name.endsWith("_settings.json") && day < cutoff) continue;
    if (Object.keys(cache).length >= 2000)
      throw Error("Sync cache file limit reached");
    const old = previous.cache[name];
    if (
      old?.modifiedTime !== file.modifiedTime &&
      (reads >= 8 || requests <= 0 || Date.now() >= deadline)
    ) {
      if (old) {
        cache[name] = old;
        cacheBytes += new TextEncoder().encode(JSON.stringify(old)).length;
        if (cacheBytes > 4_194_304) throw Error("SYNC_LIMIT");
      }
      partial = true;
      continue;
    }
    if (old?.modifiedTime !== file.modifiedTime) {
      reads++;
      requests--;
    }
    const doc =
      old?.modifiedTime === file.modifiedTime
        ? old.document
        : await transport.read(file);
    if (documentName(doc) !== name) throw Error("Sync document name mismatch");
    if (
      old &&
      old.document.kind === "usage" &&
      doc.kind === "usage" &&
      old.document.seq > doc.seq
    )
      cache[name] = old;
    else cache[name] = { modifiedTime: file.modifiedTime, document: doc };
    cacheBytes += new TextEncoder().encode(JSON.stringify(cache[name])).length;
    if (cacheBytes > 4_194_304) throw Error("SYNC_LIMIT");
  }
  // Each installation writes only its own names; other installations' counters are never overwritten.
  for (const doc of local) {
    if (!isActive()) throw Error("Sync cancelled");
    const name = documentName(doc);
    if (doc.deviceId !== deviceId)
      throw Error("Cannot write another installation's sync file");
    const comparable = doc.kind === "usage" ? { ...doc, seq: 0 } : doc;
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(comparable)),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    if (hash === hashes[name] && byName.has(name)) continue;
    if (requests <= 0 || Date.now() >= deadline) {
      partial = true;
      continue;
    }
    requests--;
    await transport.write(doc, byName.get(name));
    hashes[name] = hash;
  }
  return { cache, hashes, partial };
}
export function newestSettings(
  cache: Record<string, CacheEntry>,
): SettingsDocument | undefined {
  let winner: SettingsDocument | undefined;
  for (const entry of Object.values(cache))
    if (
      entry.document.kind === "settings" &&
      (!winner || compareRevision(entry.document.revision, winner.revision) > 0)
    )
      winner = entry.document;
  return winner;
}
