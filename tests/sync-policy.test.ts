import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, freshState } from "../src/core.ts";
import {
  sharedQuota,
  aggregateReports,
  validateDocument,
  documentName,
} from "../src/sync-policy.ts";
import type { UsageDocument } from "../src/sync-policy.ts";
import { zonedDayStart, zonedNextMidnight } from "../src/calendar.ts";
function usage(device: string, from: number, to: number): UsageDocument {
  return {
    protocol: 1,
    kind: "usage",
    deviceId: device.repeat(32),
    day: "1970-01-01",
    seq: 1,
    used: { "example.test": { usedMs: to - from, pausedMs: 0 } },
    segments: [{ host: "example.test", from, to, paused: false }],
  };
}
test("shared first-use quota sums independent devices without counting cached copies twice", () => {
  const c = defaultConfig();
  c.rules = [
    {
      id: "one",
      host: "example.test",
      mode: "limit",
      minutes: 60,
      reset: "period",
      hours: 6,
      profileId: "balanced",
    },
  ];
  const a = usage("a", 1000, 31000),
    b = usage("b", 10000, 55000),
    s = freshState();
  sharedQuota(c, s, [a, b, a], 60000);
  assert.equal(s.sites.one!.usedMs, 75000);
  assert.equal(s.sites.one!.windowStart, 1000);
  assert.equal(
    aggregateReports([a, b, a])["1970-01-01"]?.["example.test"]?.usedMs,
    75000,
  );
  sharedQuota(c, s, [a, b], 6 * 3600000 + 1000);
  assert.equal(s.sites.one!.windowStart, null);
});
test("a newer cumulative snapshot replaces an older copy instead of adding it", () => {
  const a = usage("a", 1000, 31000),
    next = usage("a", 1000, 61000);
  next.seq = 2;
  assert.equal(
    aggregateReports([next, a])["1970-01-01"]?.["example.test"]?.usedMs,
    60000,
  );
});
test("daily shared quota uses one configured time zone, including a DST boundary", () => {
  const at = Date.UTC(2026, 10, 5, 12);
  assert.equal(zonedDayStart(at, "Asia/Tehran"), Date.UTC(2026, 10, 4, 20, 30));
  const fallback = Date.UTC(2026, 10, 1, 12);
  assert.equal(
    zonedNextMidnight(fallback, "America/New_York") -
      zonedDayStart(fallback, "America/New_York"),
    25 * 3600000,
  );
});
test("recent canonical window hints survive pruning of older continuous history", () => {
  const c = defaultConfig(),
    s = freshState();
  c.rules = [
    {
      id: "one",
      host: "example.test",
      mode: "limit",
      minutes: 60,
      reset: "period",
      hours: 7,
      profileId: "balanced",
    },
  ];
  const now = 100 * 3600000,
    doc = usage("a", 98 * 3600000, 99 * 3600000);
  doc.windows = { "example.test": 97 * 3600000 };
  sharedQuota(c, s, [doc], now);
  assert.equal(s.sites.one!.windowStart, 97 * 3600000);
  assert.equal(s.sites.one!.usedMs, 3600000);
});
test("remote data is bounded and validates domains, counters and intervals", () => {
  const a = usage("a", 1000, 31000);
  assert.deepEqual(validateDocument(a, 100000), a);
  assert.throws(() =>
    validateDocument(
      { ...a, used: { __proto__: { usedMs: 1, pausedMs: 0 } } },
      100000,
    ),
  );
  assert.throws(() =>
    validateDocument(
      { ...a, segments: [{ ...a.segments[0]!, to: 1e16 }] },
      100000,
    ),
  );
  assert.throws(() => validateDocument({ ...a, seq: -1 }, 100000));
  assert.equal(documentName(a), `timeharbor-v1_${a.deviceId}_1970-01-01.json`);
});
