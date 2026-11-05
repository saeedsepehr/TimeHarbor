import {
  account,
  acknowledgeBreak,
  skipBreak,
  updateBreakChecks,
  dayKey,
  defaultConfig,
  evaluate,
  freshState,
  normalizeHost,
  PAUSE_MINUTES,
  profileFor,
  prune,
  resolveRule,
  validateConfig,
} from "./core.ts";
import type { Config, State } from "./core.ts";
import { createPin, trustedPage, verifyPin } from "./auth.ts";
import type { PinRecord } from "./auth.ts";
import { reconcileProfileState } from "./ux-policy.ts";

interface Sample {
  url: string;
  host: string;
  windowId: number;
  lastActivity: number;
  received: number;
  playing: boolean;
}
interface Sessions {
  [token: string]: number;
}
let config: Config = defaultConfig(),
  state: State = freshState(),
  pin: PinRecord | null = null;
let sessions: Sessions = {},
  lastAdvance = Date.now(),
  lastSave = 0,
  focusedWindow = -1;
const activeTabs = new Map<number, number>(),
  samples = new Map<number, Sample>();
const reminders = new Map<number, number>();
const ready = (async () => {
  const data = await browser.storage.local.get(["config", "state", "pin"]);
  if (data.config) config = validateConfig(data.config);
  if (data.state) state = data.state as State;
  if (data.pin) pin = data.pin as PinRecord;
  const stored = await browser.storage.session.get("sessions");
  sessions = (stored.sessions ?? {}) as Sessions;
  const windows = await browser.windows.getAll();
  focusedWindow = windows.find((w) => w.focused)?.id ?? -1;
  for (const tab of await browser.tabs.query({ active: true }))
    if (tab.id && typeof tab.windowId === "number")
      activeTabs.set(tab.windowId, tab.id);
  prune(config, state, Date.now());
})();
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(async () => {
    await ready;
    return fn();
  });
  queue = next.catch(() => undefined);
  return next;
}
async function save(force = false): Promise<void> {
  const now = Date.now();
  if (force || now - lastSave >= 10_000) {
    prune(config, state, now);
    await browser.storage.local.set({ config, state, pin });
    lastSave = now;
  }
}
function urlHost(url: string): string | null {
  try {
    return normalizeHost(url);
  } catch {
    return null;
  }
}
function blockedUrl(url: string): string {
  return (
    browser.runtime.getURL("ui/blocked.html") +
    "?url=" +
    encodeURIComponent(url)
  );
}
function advance(now: number): void {
  const from = lastAdvance;
  lastAdvance = now;
  if (now <= from || now - from > 20_000) return; // Never charge browser downtime, OS sleep or an unobserved long gap.
  const intervals = new Map<string, number>();
  for (const [tabId, sample] of samples) {
    const rule = resolveRule(config, sample.host),
      profile = rule ? profileFor(config, rule) : config.profiles[0]!;
    const foreground =
      focusedWindow === sample.windowId &&
      activeTabs.get(sample.windowId) === tabId;
    const media = sample.playing && (foreground || profile.backgroundMedia);
    const end = Math.min(
      now,
      sample.received + 15_000,
      media
        ? now
        : foreground
          ? sample.lastActivity + profile.idleMinutes * 60_000
          : from,
    );
    if (end > from) {
      const host = rule?.host ?? sample.host;
      intervals.set(host, Math.max(intervals.get(host) ?? from, end));
    }
  }
  for (const [host, end] of intervals) {
    const pauseEnd = Math.min(end, state.pauseUntil);
    if (pauseEnd > from) account(config, state, host, from, pauseEnd, true);
    account(config, state, host, Math.max(from, pauseEnd), end, false);
  }
}
async function enforce(now: number): Promise<void> {
  for (const [tabId, sample] of samples) {
    const verdict = evaluate(config, state, sample.host, now);
    if (verdict.blocked) {
      samples.delete(tabId);
      await browser.tabs
        .update(tabId, { url: blockedUrl(sample.url) })
        .catch(() => undefined);
    }
  }
}
function publicData(host: string | null, now: number): unknown {
  const current = host ? evaluate(config, state, host, now) : null;
  const today = state.days[dayKey(now)] ?? {};
  return {
    language: config.language,
    pinSet: !!pin,
    pauseEnabled: config.pauseEnabled,
    pauseUntil: state.pauseUntil,
    pauseCount: state.pauseDay === dayKey(now) ? state.pauseCount : 0,
    pauseMax: config.pauseMaxPerDay,
    current,
    todayMs: host
      ? (today[resolveRule(config, host)?.host ?? host]?.usedMs ?? 0)
      : Object.values(today).reduce((n, v) => n + v.usedMs, 0),
  };
}
function requireSession(token: unknown, now: number): void {
  if (!pin) return;
  if (typeof token !== "string" || (sessions[token] ?? 0) <= now)
    throw Error("AUTH_REQUIRED");
}
async function issueSession(now: number): Promise<string> {
  const token = crypto.randomUUID();
  for (const [t, until] of Object.entries(sessions))
    if (until <= now) delete sessions[t];
  sessions[token] = now + 10 * 60_000;
  await browser.storage.session.set({ sessions });
  return token;
}
function targetHost(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return urlHost(value);
}
async function message(
  value: unknown,
  sender: browser.runtime.MessageSender,
): Promise<unknown> {
  if (typeof value !== "object" || value === null)
    throw Error("Invalid request");
  const msg = value as Record<string, unknown>;
  const now = Date.now();
  advance(now);
  const trusted = trustedPage(
    sender,
    browser.runtime.id,
    browser.runtime.getURL("/"),
  );
  if (msg.type === "activity") {
    if (
      sender.id !== browser.runtime.id ||
      sender.frameId !== 0 ||
      !sender.tab?.id ||
      !sender.tab.url ||
      typeof sender.tab.windowId !== "number" ||
      !/^https?:/.test(sender.tab.url)
    )
      throw Error("Invalid activity sender");
    const host = urlHost(sender.tab.url);
    if (!host) return null;
    const prior = samples.get(sender.tab.id);
    const lastActivity =
      msg.active === true ? now : (prior?.lastActivity ?? now);
    samples.set(sender.tab.id, {
      url: sender.tab.url,
      host,
      windowId: sender.tab.windowId,
      lastActivity,
      received: now,
      playing: msg.playing === true,
    });
    const data = publicData(host, now) as {
      current: { blocked: boolean } | null;
    };
    const rule = resolveRule(config, host),
      p = rule ? profileFor(config, rule) : config.profiles[0]!;
    const previousReminder = reminders.get(sender.tab.id) ?? now;
    if (!reminders.has(sender.tab.id)) reminders.set(sender.tab.id, now);
    const remind = now - previousReminder >= p.reminderMinutes * 60_000;
    if (remind) reminders.set(sender.tab.id, now);
    await enforce(now);
    await save();
    return { ...data, remind };
  }
  if (!trusted) throw Error("Untrusted sender");
  if (msg.type === "public") return publicData(targetHost(msg.url), now);
  if (msg.type === "unlock") {
    if (pin) {
      const valid = await verifyPin(pin, msg.pin, now);
      await save(true);
      if (!valid) throw Error("Incorrect PIN");
    }
    return { token: await issueSession(now) };
  }
  if (msg.type === "pause") {
    const host = targetHost(msg.url);
    if (!host || evaluate(config, state, host, now).reason !== "quota")
      throw Error(
        "A temporary pause is available only after a website allowance is exhausted",
      );
    if (!config.pauseEnabled || !pin)
      throw Error("Pause is unavailable. Set a PIN in settings first.");
    if (!(await verifyPin(pin, msg.pin, now))) {
      await save(true);
      throw Error("Incorrect PIN");
    }
    if (!PAUSE_MINUTES.includes(msg.minutes as (typeof PAUSE_MINUTES)[number]))
      throw Error("Invalid pause duration");
    if (state.pauseUntil > now) throw Error("A pause is already active");
    if (state.pauseDay !== dayKey(now)) {
      state.pauseDay = dayKey(now);
      state.pauseCount = 0;
    }
    if (state.pauseCount >= config.pauseMaxPerDay)
      throw Error("Daily pause allowance exhausted");
    state.pauseCount++;
    state.pauseUntil = now + Number(msg.minutes) * 60_000;
    await save(true);
    return publicData(targetHost(msg.url), now);
  }
  if (msg.type === "resume") {
    state.pauseUntil = 0;
    await enforce(now);
    await save(true);
    return true;
  }
  if (msg.type === "breakDone") {
    if (typeof msg.ruleId !== "string") throw Error("Invalid break");
    acknowledgeBreak(config, state, msg.ruleId, msg.checks, now);
    await save(true);
    return true;
  }
  if (msg.type === "breakChecks" || msg.type === "breakSkip") {
    if (typeof msg.ruleId !== "string") throw Error("Invalid break");
    if (msg.breakUntil !== state.sites[msg.ruleId]?.breakUntil)
      throw Error("This break has changed. Refresh the page.");
    if (msg.type === "breakChecks")
      updateBreakChecks(config, state, msg.ruleId, msg.checks, now);
    else skipBreak(config, state, msg.ruleId, now);
    await save(true);
    return true;
  }
  requireSession(msg.token, now);
  if (msg.type === "read") return { config, state, pinSet: !!pin };
  if (msg.type === "save") {
    const next = validateConfig(msg.config);
    if (msg.newPin !== undefined && msg.newPin !== "") {
      pin = await createPin(msg.newPin);
      sessions = {};
      await browser.storage.session.set({ sessions });
    }
    reconcileProfileState(config, next, state);
    config = next;
    if (!config.pauseEnabled) state.pauseUntil = 0;
    prune(config, state, now);
    await enforce(now);
    await save(true);
    return { token: await issueSession(now) };
  }
  if (msg.type === "lock") {
    if (typeof msg.token === "string") delete sessions[msg.token];
    await browser.storage.session.set({ sessions });
    return true;
  }
  if (msg.type === "clearReports") {
    state.days = {};
    state.breaks = [];
    await save(true);
    return true;
  }
  throw Error("Unknown request");
}
browser.runtime.onMessage.addListener((msg, sender) =>
  serial(() => message(msg, sender))
    .then((data) => ({ ok: true, data }))
    .catch((error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : "Request failed",
    })),
);
browser.webRequest.onBeforeRequest.addListener(
  (details) =>
    serial(async () => {
      const host = urlHost(details.url);
      if (!host) return {};
      const now = Date.now();
      advance(now);
      const v = evaluate(config, state, host, now);
      await save();
      return v.blocked ? { redirectUrl: blockedUrl(details.url) } : {};
    }),
  { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] },
  ["blocking"],
);
browser.tabs.onActivated.addListener((info) => {
  void serial(async () => {
    advance(Date.now());
    activeTabs.set(info.windowId, info.tabId);
    await save();
  });
});
browser.windows.onFocusChanged.addListener((id) => {
  void serial(async () => {
    advance(Date.now());
    focusedWindow = id;
    await save(true);
  });
});
browser.tabs.onRemoved.addListener((id) => {
  void serial(async () => {
    advance(Date.now());
    samples.delete(id);
    reminders.delete(id);
    await save();
  });
});
browser.tabs.onUpdated.addListener((id, change) => {
  if (change.url)
    void serial(async () => {
      advance(Date.now());
      samples.delete(id);
    });
});
browser.alarms.create("checkpoint", { periodInMinutes: 0.5 });
browser.alarms.onAlarm.addListener(() => {
  void serial(async () => {
    const now = Date.now();
    advance(now);
    await enforce(now);
    await save(true);
  });
});
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") void browser.runtime.openOptionsPage();
});
