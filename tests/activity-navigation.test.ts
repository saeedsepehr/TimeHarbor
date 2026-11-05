import test from "node:test";
import assert from "node:assert/strict";
import { chargeEnd, browserLanguage } from "../src/activity-policy.ts";
import {
  account,
  defaultConfig,
  evaluate,
  freshState,
  skipBreak,
} from "../src/core.ts";
test("background tabs, unfocused/minimized windows and hidden pages never receive idle grace or media exceptions", () => {
  const sample = {
    visible: true,
    playing: true,
    received: 1000,
    lastActivity: 1000,
  };
  assert.equal(chargeEnd(sample, false, 1000, 6000, 5), 1000);
  assert.equal(
    chargeEnd({ ...sample, visible: false }, true, 1000, 6000, 5),
    1000,
  );
  assert.equal(chargeEnd(sample, true, 1000, 6000, 5), 6000);
  assert.equal(
    chargeEnd(
      { ...sample, playing: false, lastActivity: 0, received: 300000 },
      true,
      300000,
      305000,
      5,
    ),
    300000,
  );
});
test("supported browser locale variants map to UI languages with English fallback", () => {
  assert.equal(browserLanguage("fa-IR"), "fa");
  assert.equal(browserLanguage("zh-Hant-TW"), "zh");
  assert.equal(browserLanguage("es_419"), "es");
  assert.equal(browserLanguage("unknown"), "en");
});
test("simultaneous quota and break expiry: skipping leaves the quota lock in place", () => {
  const c = defaultConfig(),
    s = freshState();
  c.rules = [
    {
      id: "video",
      host: "youtube.com",
      mode: "limit",
      minutes: 3,
      reset: "period",
      hours: 1,
      profileId: "balanced",
    },
  ];
  c.profiles[0]!.breakEveryMinutes = 3;
  c.profiles[0]!.breakMinutes = 2;
  c.profiles[0]!.allowSkipBreak = true;
  account(c, s, "youtube.com", 0, 180000, false);
  assert.equal(evaluate(c, s, "youtube.com", 180001).reason, "break");
  skipBreak(c, s, "video", 180001);
  assert.equal(evaluate(c, s, "youtube.com", 180002).reason, "quota");
});
