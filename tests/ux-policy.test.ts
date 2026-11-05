import test from "node:test";
import assert from "node:assert/strict";
import {
  account,
  acknowledgeBreak,
  defaultConfig,
  evaluate,
  freshState,
  skipBreak,
  updateBreakChecks,
  validateConfig,
} from "../src/core.ts";
import {
  detachSites,
  copyTargets,
  removeProfile,
  reconcileProfileState,
} from "../src/ux-policy.ts";

function setup(required = true) {
  const c = defaultConfig(),
    s = freshState();
  c.profiles[0]!.required = required;
  c.profiles[0]!.breakEveryMinutes = 1;
  c.profiles[0]!.breakMinutes = 1;
  c.rules = [
    {
      id: "one",
      host: "one.test",
      mode: "limit",
      minutes: 60,
      reset: "period",
      hours: 6,
      profileId: "balanced",
    },
  ];
  account(c, s, "one.test", 0, 60_000, false);
  return { c, s };
}
test("quota pauses cannot bypass a break, including after its deadline", () => {
  const { c, s } = setup();
  s.pauseUntil = 300_000;
  assert.equal(evaluate(c, s, "one.test", 70_000).reason, "break");
  assert.equal(evaluate(c, s, "one.test", 130_000).reason, "break");
});
test("optional checklist accepts progress during a break and records it on continue", () => {
  const { c, s } = setup(false);
  updateBreakChecks(c, s, "one", [1], 70_000);
  assert.deepEqual(evaluate(c, s, "one.test", 70_000).checks, [1]);
  assert.throws(
    () => acknowledgeBreak(c, s, "one", [], 70_000),
    /not finished/,
  );
  assert.equal(evaluate(c, s, "one.test", 130_000).reason, "break");
  acknowledgeBreak(c, s, "one", [1], 130_000);
  assert.deepEqual(s.breaks?.[0]?.checked, ["Take a walk"]);
  assert.equal(evaluate(c, s, "one.test", 130_000).blocked, false);
});
test("required checklist rejects early check-ins; explicit skip defaults off", () => {
  const { c, s } = setup();
  assert.throws(
    () => updateBreakChecks(c, s, "one", [0], 70_000),
    /not finished/,
  );
  assert.throws(() => skipBreak(c, s, "one", 70_000), /not allowed/);
  c.profiles[0]!.allowSkipBreak = true;
  skipBreak(c, s, "one", 70_000);
  assert.equal(s.breaks?.[0]?.skipped, true);
  assert.equal(evaluate(c, s, "one.test", 70_000).blocked, false);
});
test("active time during a quota pause still schedules health breaks", () => {
  const { c } = setup(false),
    s = freshState();
  s.pauseUntil = 300_000;
  account(c, s, "one.test", 0, 70_000, true);
  assert.equal(s.sites.one?.usedMs, 0);
  assert.equal(evaluate(c, s, "one.test", 70_000).reason, "break");
});
test("old profiles migrate without enabling break skipping or mutating the caller", () => {
  const c = defaultConfig();
  const old = JSON.parse(JSON.stringify(c));
  delete old.profiles[0].allowSkipBreak;
  assert.equal(validateConfig(old).profiles[0]?.allowSkipBreak, false);
  assert.equal(old.profiles[0].allowSkipBreak, undefined);
});
test("copy wizard excludes its source and marks identical rules", () => {
  const { c } = setup();
  c.rules.push(
    { ...c.rules[0]!, id: "two", host: "two.test" },
    { ...c.rules[0]!, id: "three", host: "three.test", minutes: 15 },
  );
  const targets = copyTargets(c, "one");
  assert.deepEqual(
    targets.map((t) => [t.rule.id, t.identical]),
    [
      ["two", true],
      ["three", false],
    ],
  );
  c.rules[0]!.reset = "daily";
  c.rules[1]!.reset = "daily";
  c.rules[1]!.hours = 24;
  assert.equal(copyTargets(c, "one")[0]!.identical, true);
});
test("detaching or deleting a used profile preserves website limits", () => {
  const { c } = setup();
  const before = structuredClone(c.rules[0]!);
  detachSites(c, "balanced", ["one"]);
  assert.equal(c.rules[0]?.minutes, before.minutes);
  assert.equal(c.rules[0]?.host, before.host);
  assert.equal(c.rules[0]?.profileId, "no-breaks");
  assert.equal(
    c.profiles.find((p) => p.id === "no-breaks")?.breakEveryMinutes,
    0,
  );
  removeProfile(c, "balanced", "no-breaks");
  assert.equal(
    c.profiles.some((p) => p.id === "balanced"),
    false,
  );
  assert.doesNotThrow(() => validateConfig(c));
});
test("reassigning a profile clears an obsolete break without resetting the used quota", () => {
  const { c, s } = setup();
  const next = structuredClone(c);
  const used = s.sites.one!.usedMs;
  const windowStart = s.sites.one!.windowStart;
  detachSites(next, "balanced", ["one"]);
  reconcileProfileState(c, next, s);
  assert.equal(s.sites.one!.usedMs, used);
  assert.equal(s.sites.one!.windowStart, windowStart);
  assert.equal(s.sites.one!.breakUntil, 0);
  assert.equal(s.sites.one!.streakMs, 0);
  assert.deepEqual(s.sites.one!.checks, []);
  assert.equal(evaluate(next, s, "one.test", 70_000).blocked, false);
});
