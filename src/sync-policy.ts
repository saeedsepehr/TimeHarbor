import { normalizeHost, siteFor, nextMidnight, dayKey } from "./core.ts";
import type { Config, State, Usage, UsageSegment } from "./core.ts";
import { zonedDayStart } from "./calendar.ts";
import { cleanConfig } from "./transfer.ts";
export interface Revision {
  counter: number;
  deviceId: string;
}
export interface SettingsDocument {
  protocol: 1;
  kind: "settings";
  deviceId: string;
  revision: Revision;
  config: Config;
}
export interface UsageDocument {
  protocol: 1;
  kind: "usage";
  deviceId: string;
  day: string;
  seq: number;
  used: Record<string, Usage>;
  segments: UsageSegment[];
  windows?: Record<string, number>;
}
export type SyncDocument = SettingsDocument | UsageDocument;
const DEVICE = /^[a-f0-9]{32}$/;
export const MAX_DOCUMENT_BYTES = 2_097_152;
export function documentName(doc: SyncDocument): string {
  return `timeharbor-v1_${doc.deviceId}_${doc.kind === "settings" ? "settings" : doc.day}.json`;
}
export function compareRevision(a: Revision, b: Revision): number {
  return a.counter - b.counter || a.deviceId.localeCompare(b.deviceId);
}
function object(v: unknown): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(v))
  );
}
function counter(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
}
export function validateDocument(
  value: unknown,
  now = Date.now(),
): SyncDocument {
  if (
    !object(value) ||
    value.protocol !== 1 ||
    typeof value.deviceId !== "string" ||
    !DEVICE.test(value.deviceId)
  )
    throw Error("Invalid sync document");
  if (value.kind === "settings") {
    if (
      !object(value.revision) ||
      !counter(value.revision.counter) ||
      typeof value.revision.deviceId !== "string" ||
      !DEVICE.test(value.revision.deviceId)
    )
      throw Error("Invalid settings revision");
    return {
      protocol: 1,
      kind: "settings",
      deviceId: value.deviceId,
      revision: {
        counter: value.revision.counter,
        deviceId: value.revision.deviceId,
      },
      config: cleanConfig(value.config),
    };
  }
  if (
    value.kind !== "usage" ||
    typeof value.day !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.day) ||
    !counter(value.seq) ||
    !object(value.used) ||
    !Array.isArray(value.segments) ||
    value.segments.length > 50000 ||
    Object.keys(value.used).length > 1000
  )
    throw Error("Invalid usage document");
  const used: Record<string, Usage> = {};
  for (const [host, entry] of Object.entries(value.used)) {
    if (
      normalizeHost(host) !== host ||
      !object(entry) ||
      !counter(entry.usedMs) ||
      !counter(entry.pausedMs) ||
      entry.usedMs > 86400000 ||
      entry.pausedMs > entry.usedMs
    )
      throw Error("Invalid usage counters");
    used[host] = { usedMs: entry.usedMs, pausedMs: entry.pausedMs };
  }
  const segments: UsageSegment[] = value.segments.map((raw) => {
    if (
      !object(raw) ||
      typeof raw.host !== "string" ||
      normalizeHost(raw.host) !== raw.host ||
      !counter(raw.from) ||
      !counter(raw.to) ||
      raw.to <= raw.from ||
      raw.to - raw.from > 86400000 ||
      raw.to > now + 300000 ||
      typeof raw.paused !== "boolean"
    )
      throw Error("Invalid usage interval");
    return { host: raw.host, from: raw.from, to: raw.to, paused: raw.paused };
  });
  const windows: Record<string, number> = {};
  if (value.windows !== undefined) {
    if (!object(value.windows) || Object.keys(value.windows).length > 1000)
      throw Error("Invalid quota anchors");
    for (const [host, start] of Object.entries(value.windows)) {
      if (
        normalizeHost(host) !== host ||
        !counter(start) ||
        start > now + 300000
      )
        throw Error("Invalid quota anchor");
      windows[host] = start;
    }
  }
  return {
    protocol: 1,
    kind: "usage",
    deviceId: value.deviceId,
    day: value.day,
    seq: value.seq,
    used,
    segments,
    ...(value.windows !== undefined ? { windows } : {}),
  };
}
export function latestUsage(documents: UsageDocument[]): UsageDocument[] {
  const latest = new Map<string, UsageDocument>();
  for (const doc of documents) {
    const key = doc.deviceId + doc.day,
      prior = latest.get(key);
    if (!prior || doc.seq > prior.seq) latest.set(key, doc);
  }
  return [...latest.values()];
}
export function aggregateReports(documents: UsageDocument[]): State["days"] {
  const days: State["days"] = {};
  for (const doc of latestUsage(documents))
    for (const [host, v] of Object.entries(doc.used)) {
      const entry = ((days[doc.day] ??= {})[host] ??= {
        usedMs: 0,
        pausedMs: 0,
      });
      entry.usedMs += v.usedMs;
      entry.pausedMs += v.pausedMs;
    }
  return days;
}
export function sharedQuota(
  c: Config,
  s: State,
  documents: UsageDocument[],
  now: number,
): void {
  const latest = latestUsage(documents);
  const segments = latest
    .flatMap((doc) => doc.segments)
    .filter((v) => !v.paused && v.from <= now)
    .sort((a, b) => a.from - b.from);
  for (const rule of c.rules) {
    if (rule.mode === "block") continue;
    let entries = segments.filter((segment) => segment.host === rule.host);
    const st = siteFor(s, rule);
    let start: number | null = null,
      end: number | null = null;
    if (rule.reset === "daily") {
      if (c.timeZone) start = zonedDayStart(now, c.timeZone);
      else {
        const date = new Date(now);
        date.setHours(0, 0, 0, 0);
        start = date.getTime();
      }
      end = nextMidnight(now, c.timeZone);
    } else {
      const length = rule.hours * 3600000;
      const hints = latest
        .flatMap((doc) =>
          doc.windows?.[rule.host] === undefined
            ? []
            : [doc.windows[rule.host]!],
        )
        .filter((at) => at <= now && at >= now - 2 * length);
      if (hints.length) {
        start = Math.min(...hints);
        entries = entries.filter((entry) => entry.to > start!);
      }
      for (const segment of entries) {
        if (start === null || segment.from >= start + length)
          start = segment.from;
        const last = Math.min(segment.to, now) - 1;
        if (last >= start + length)
          start += Math.floor((last - start) / length) * length;
      }
      if (start !== null) {
        end = start + length;
        if (now >= end) {
          start = null;
          end = null;
        }
      }
    }
    st.windowStart = start;
    st.usedMs =
      start === null || end === null
        ? 0
        : entries.reduce(
            (sum, segment) =>
              sum +
              Math.max(
                0,
                Math.min(segment.to, end!, now) -
                  Math.max(segment.from, start!),
              ),
            0,
          );
  }
}
export function ownDocuments(
  c: Config,
  s: State,
  deviceId: string,
  seq: number,
  revision: Revision,
): SyncDocument[] {
  return [
    {
      protocol: 1,
      kind: "settings",
      deviceId,
      revision,
      config: cleanConfig(c),
    },
    ...ownUsageDocuments(c, s, deviceId, seq),
  ];
}
export function ownUsageDocuments(
  c: Config,
  s: State,
  deviceId: string,
  seq: number,
): UsageDocument[] {
  const result: UsageDocument[] = [];
  const byDay = new Map<string, UsageSegment[]>();
  for (const segment of s.segments ?? []) {
    const day = dayKey(segment.from, c.timeZone);
    const items = byDay.get(day) ?? [];
    items.push(segment);
    byDay.set(day, items);
  }
  const today = dayKey(Date.now(), c.timeZone),
    windows: Record<string, number> = {};
  for (const rule of c.rules) {
    const start = s.sites[rule.id]?.windowStart;
    if (start != null) windows[rule.host] = start;
  }
  for (const day of [
    ...new Set([today, ...Object.keys(s.days), ...byDay.keys()]),
  ]
    .sort()
    .reverse())
    result.push({
      protocol: 1,
      kind: "usage",
      deviceId,
      day,
      seq,
      used: s.days[day] ?? {},
      segments: byDay.get(day) ?? [],
      ...(day === today ? { windows } : {}),
    });
  return result;
}
export function initializeLedger(c: Config, s: State): void {
  if (s.segments) return;
  s.segments = [];
  for (const rule of c.rules) {
    const site = s.sites[rule.id];
    if (site?.windowStart != null && site.usedMs > 0)
      s.segments.push({
        host: rule.host,
        from: site.windowStart,
        to: site.windowStart + site.usedMs,
        paused: false,
      });
  }
}
export const emptyRevision = (deviceId: string): Revision => ({
  counter: 0,
  deviceId,
});
