import test from "node:test";
import assert from "node:assert/strict";
import { defaultConfig, freshState, account } from "../src/core.ts";
import {
  exportSettings,
  importSettings,
  prepareImport,
} from "../src/transfer.ts";
import { networkRules, blockedTarget } from "../src/network-policy.ts";
function fixture() {
  const c = defaultConfig();
  c.rules = [
    {
      id: "video",
      host: "example.test",
      mode: "block",
      minutes: 60,
      reset: "period",
      hours: 6,
      profileId: "balanced",
    },
  ];
  return c;
}
test("settings round-trip excludes PIN, sessions and usage, and rejects malformed files", () => {
  const c = fixture();
  const withPrivateFields = { ...c, pin: "secret", state: { days: {} } };
  const text = exportSettings(withPrivateFields, 0);
  assert.deepEqual(importSettings(text), c);
  assert.equal(text.includes("secret"), false);
  assert.throws(() => importSettings("x"), /JSON/);
  assert.throws(() => importSettings(" ".repeat(1_048_577)), /large/);
  assert.throws(
    () => importSettings(JSON.stringify({ format: "unknown", config: c })),
    /format/,
  );
  const malformed = JSON.parse(text);
  malformed.config.rules[0].host = "bad host";
  assert.throws(() => importSettings(JSON.stringify(malformed)));
});
test("import retains destination rule identity and resolves imported ID collisions", () => {
  const current = fixture(),
    incoming = fixture();
  incoming.rules[0]!.id = "other";
  incoming.rules.push({
    ...incoming.rules[0]!,
    host: "other.test",
    id: "video",
  });
  const next = prepareImport(current, incoming);
  assert.equal(next.rules[0]!.id, "video");
  assert.notEqual(next.rules[1]!.id, "video");
  assert.equal(new Set(next.rules.map((r) => r.id)).size, 2);
  const replacement = fixture();
  replacement.rules[0]!.host = "replacement.test";
  assert.notEqual(
    prepareImport(current, replacement).rules[0]!.id,
    current.rules[0]!.id,
  );
});
test("Chromium network rules honor specific domains, quotas, pauses and break precedence", () => {
  const c = fixture(),
    s = freshState();
  c.rules.push({
    ...c.rules[0]!,
    id: "allowed",
    host: "safe.example.test",
    mode: "limit",
  });
  let rules = networkRules(c, s, 0, "chrome-extension://extension-id/");
  assert.equal(rules.length, 2);
  assert.equal(rules[0]!.action.type, "redirect");
  assert.equal(rules[1]!.action.type, "allow");
  assert.ok(rules[1]!.priority > rules[0]!.priority);
  const re = new RegExp(rules[0]!.condition.regexFilter);
  assert.equal(re.test("https://sub.example.test/path?a=1&b=2"), true);
  assert.equal(re.test("https://notexample.test/"), false);
  c.rules[0]!.mode = "limit";
  c.rules[0]!.minutes = 1;
  c.profiles[0]!.breakEveryMinutes = 0;
  account(c, s, "example.test", 0, 60000, false);
  assert.equal(
    networkRules(c, s, 60001, "chrome-extension://extension-id/")[0]!.action
      .type,
    "redirect",
  );
  s.pauseUntil = 120000;
  assert.equal(
    networkRules(c, s, 60001, "chrome-extension://extension-id/")[0]!.action
      .type,
    "allow",
  );
  c.profiles[0]!.scope = "all";
  s.sites.video!.breakUntil = 180000;
  rules = networkRules(c, s, 60001, "chrome-extension://extension-id/");
  assert.equal(rules[0]!.id, 1);
  assert.equal(
    rules.every((r) => r.action.type === "redirect"),
    true,
  );
});
test("redirect return URLs preserve query separators and reject unsafe schemes", () => {
  const target = "https://example.test/watch?a=1&b=2#time";
  assert.equal(
    blockedTarget("chrome-extension://id/ui/blocked.html?target=" + target),
    target,
  );
  assert.equal(
    blockedTarget(
      "moz-extension://id/ui/blocked.html?url=" + encodeURIComponent(target),
    ),
    target,
  );
  assert.equal(
    blockedTarget(
      "chrome-extension://id/ui/blocked.html?target=javascript:alert(1)",
    ),
    "",
  );
});
