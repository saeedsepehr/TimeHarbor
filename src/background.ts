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
import { prepareImport } from "./transfer.ts";
import { networkRules } from "./network-policy.ts";
import type { NetworkRule } from "./network-policy.ts";
import { chromium } from "./platform.ts";
import {
  browserLanguage,
  chargeEnd,
  usageReminderInterval,
} from "./activity-policy.ts";
import { GoogleDrive } from "./drive.ts";
import { exchange, newestSettings } from "./cloud-exchange.ts";
import type { CacheEntry } from "./cloud-exchange.ts";
import {
  oauthBroker,
  prepareOAuth,
  completeOAuth,
  refreshGoogle,
} from "./google-auth.ts";
import type { GoogleCredentials, PendingOAuth } from "./google-auth.ts";
import {
  aggregateReports,
  ownDocuments,
  ownUsageDocuments,
  sharedQuota,
  initializeLedger,
  compareRevision,
} from "./sync-policy.ts";
import type { Revision, UsageDocument } from "./sync-policy.ts";

interface Sample {
  url: string;
  host: string;
  windowId: number;
  lastActivity: number;
  received: number;
  playing: boolean;
  visible: boolean;
}
interface Sessions {
  [token: string]: number;
}
let config: Config = defaultConfig(
    browserLanguage(browser.i18n.getUILanguage()),
  ),
  state: State = freshState(),
  pin: PinRecord | null = null;
let sessions: Sessions = {},
  lastAdvance = Date.now(),
  lastSave = 0,
  focusedWindow = -1;
const activeTabs = new Map<number, number>(),
  samples = new Map<number, Sample>();
const reminders = new Map<number, number>();
interface CloudMeta {
  deviceId: string;
  enabled: boolean;
  revision: Revision;
  sequence: number;
  hashes: Record<string, string>;
  lastSync: number;
  error: string;
  preference?: "cloud" | "local";
  partial?: boolean;
}
const deviceId = crypto.randomUUID().replaceAll("-", "");
let cloud: CloudMeta = {
  deviceId,
  enabled: false,
  revision: { counter: 0, deviceId },
  sequence: 0,
  hashes: {},
  lastSync: 0,
  error: "",
};
let cloudCache: Record<string, CacheEntry> = {},
  remoteDays: State["days"] = {},
  googleCredentials: GoogleCredentials | null = null;
let cloudEpoch = 0,
  cloudJob: Promise<void> | null = null;
function cloudStatus(): unknown {
  return {
    configured: !!oauthBroker,
    enabled: cloud.enabled,
    lastSync: cloud.lastSync,
    error: cloud.error,
    busy: !!cloudJob,
    partial: !!cloud.partial,
    sharedQuota: true,
    timeZone:
      config.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
function remoteUsage(): UsageDocument[] {
  return Object.values(cloudCache)
    .map((entry) => entry.document)
    .filter(
      (doc): doc is UsageDocument =>
        doc.kind === "usage" && doc.deviceId !== cloud.deviceId,
    );
}
function ownUsage(): UsageDocument[] {
  return ownUsageDocuments(config, state, cloud.deviceId, cloud.sequence);
}
function applyCloudQuota(now: number): void {
  if (cloud.enabled && state.segments)
    sharedQuota(config, state, [...remoteUsage(), ...ownUsage()], now);
}
function reportDays(): State["days"] {
  const days = structuredClone(state.days);
  if (cloud.enabled)
    for (const [day, sites] of Object.entries(remoteDays))
      for (const [host, usage] of Object.entries(sites)) {
        const entry = ((days[day] ??= {})[host] ??= { usedMs: 0, pausedMs: 0 });
        entry.usedMs += usage.usedMs;
        entry.pausedMs += usage.pausedMs;
      }
  return days;
}
function reportDay(
  day: string,
): Record<string, { usedMs: number; pausedMs: number }> {
  const sites = structuredClone(state.days[day] ?? {});
  if (cloud.enabled)
    for (const [host, v] of Object.entries(remoteDays[day] ?? {})) {
      const entry = (sites[host] ??= { usedMs: 0, pausedMs: 0 });
      entry.usedMs += v.usedMs;
      entry.pausedMs += v.pausedMs;
    }
  return sites;
}
async function disconnectCloudLocal(): Promise<void> {
  cloudEpoch++;
  cloud.enabled = false;
  googleCredentials = null;
  cloudCache = {};
  remoteDays = {};
  cloud.hashes = {};
  cloud.error = "";
  if (state.segments) sharedQuota(config, state, ownUsage(), Date.now());
  delete state.segments;
  await browser.storage.local.remove(["cloudCredentials", "cloudCache"]);
  await browser.storage.session.remove(["cloudAccess", "pendingOAuth"]);
  await save(true);
}
interface DeclarativeAPI {
  getDynamicRules(): Promise<NetworkRule[]>;
  updateDynamicRules(change: {
    removeRuleIds: number[];
    addRules: NetworkRule[];
  }): Promise<void>;
}
const dnr = (browser as unknown as { declarativeNetRequest: DeclarativeAPI })
  .declarativeNetRequest;
let lastNetworkPolicy = "";
async function syncNetwork(now: number): Promise<void> {
  if (!chromium) return;
  const rules = networkRules(config, state, now, browser.runtime.getURL("/"));
  const signature = JSON.stringify(rules);
  if (signature === lastNetworkPolicy) return;
  const current = await dnr.getDynamicRules();
  await dnr.updateDynamicRules({
    removeRuleIds: current.map((r) => r.id),
    addRules: rules,
  });
  lastNetworkPolicy = signature;
}
const ready = (async () => {
  const storageWithAccess = browser.storage
    .local as typeof browser.storage.local & {
    setAccessLevel?: (options: { accessLevel: string }) => Promise<void>;
  };
  if (storageWithAccess.setAccessLevel)
    await storageWithAccess.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const data = await browser.storage.local.get([
    "config",
    "state",
    "pin",
    "cloudMeta",
    "cloudCache",
    "cloudCredentials",
  ]);
  if (data.config) config = validateConfig(data.config);
  if (config.languageMode === "browser")
    config.language = browserLanguage(browser.i18n.getUILanguage());
  if (data.state) state = data.state as State;
  if (data.pin) pin = data.pin as PinRecord;
  if (data.cloudMeta) cloud = data.cloudMeta as CloudMeta;
  if (data.cloudCache)
    cloudCache = data.cloudCache as Record<string, CacheEntry>;
  remoteDays = aggregateReports(remoteUsage());
  const access = await browser.storage.session.get("cloudAccess");
  if (data.cloudCredentials?.refresh)
    googleCredentials = {
      refresh: String(data.cloudCredentials.refresh),
      access: String(access.cloudAccess?.access ?? ""),
      expires: Number(access.cloudAccess?.expires ?? 0),
    };
  const stored = await browser.storage.session.get("sessions");
  sessions = (stored.sessions ?? {}) as Sessions;
  if (chromium) {
    const runtime = await browser.storage.session.get("observations");
    const observations = runtime.observations as
      | {
          samples?: [number, Sample][];
          reminders?: [number, number][];
          lastAdvance?: number;
        }
      | undefined;
    if (observations) {
      for (const [id, sample] of observations.samples ?? [])
        samples.set(id, sample);
      for (const [id, time] of observations.reminders ?? [])
        reminders.set(id, time);
      if (typeof observations.lastAdvance === "number")
        lastAdvance = observations.lastAdvance;
    }
  }
  const windows = await browser.windows.getAll();
  focusedWindow =
    windows.find((w) => w.focused && w.state !== "minimized")?.id ?? -1;
  for (const tab of await browser.tabs.query({ active: true }))
    if (tab.id && typeof tab.windowId === "number")
      activeTabs.set(tab.windowId, tab.id);
  prune(config, state, Date.now());
  applyCloudQuota(Date.now());
  await syncNetwork(Date.now());
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
  await syncNetwork(now);
  if (force || now - lastSave >= 10_000) {
    prune(config, state, now);
    await browser.storage.local.set({ config, state, pin, cloudMeta: cloud });
    if (chromium)
      await browser.storage.session.set({
        observations: {
          samples: [...samples],
          reminders: [...reminders],
          lastAdvance,
        },
      });
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
    const end = chargeEnd(
      sample,
      foreground,
      from,
      now,
      profile?.idleMinutes ?? 5,
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
  applyCloudQuota(now);
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
  const today = reportDay(dayKey(now, config.timeZone));
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
async function authorizeCloud(
  value: Record<string, unknown>,
  sender: browser.runtime.MessageSender,
): Promise<void> {
  await serial(async () => {
    if (!trustedPage(sender, browser.runtime.id, browser.runtime.getURL("/")))
      throw Error("Untrusted sender");
    requireSession(value.token, Date.now());
  });
}
async function syncCloud(): Promise<void> {
  if (cloudJob) return cloudJob;
  if (!cloud.enabled || !googleCredentials || !oauthBroker) return;
  const epoch = cloudEpoch;
  const job = (async () => {
    try {
      const permissions: browser.permissions.Permissions = {};
      if (!chromium)
        permissions.data_collection = [
          "browsingActivity",
          "authenticationInfo",
        ];
      if (!(await browser.permissions.contains(permissions)))
        throw Error("GOOGLE_AUTH_REQUIRED");
      const snapshot = await serial(async () => {
        if (!cloud.enabled || !googleCredentials || cloudEpoch !== epoch)
          throw Error("Sync cancelled");
        advance(Date.now());
        cloud.sequence++;
        const cutoff = dayKey(
          Date.now() -
            Math.max(8, Math.min(config.retentionDays, 90)) * 86400000,
          config.timeZone,
        );
        return {
          deviceId: cloud.deviceId,
          documents: structuredClone(
            ownDocuments(
              config,
              state,
              cloud.deviceId,
              cloud.sequence,
              cloud.revision,
            ).filter((doc) => doc.kind === "settings" || doc.day >= cutoff),
          ),
          previous: structuredClone({
            cache: cloudCache,
            hashes: cloud.hashes,
          }),
          credentials: { ...googleCredentials },
          cutoff,
        };
      });
      const credentials = await refreshGoogle(snapshot.credentials);
      const result = await exchange(
        new GoogleDrive(credentials.access),
        snapshot.documents,
        snapshot.deviceId,
        snapshot.previous,
        snapshot.cutoff,
        () => cloud.enabled && cloudEpoch === epoch,
      );
      let repeat = !!result.partial;
      await serial(async () => {
        if (cloudEpoch !== epoch || !cloud.enabled) return;
        advance(Date.now());
        googleCredentials = credentials;
        cloudCache = result.cache;
        cloud.hashes = result.hashes;
        const winner = newestSettings(cloudCache);
        if (cloud.preference && result.partial) {
          /* Finish initial discovery before choosing authoritative settings. */
        } else if (cloud.preference === "local") {
          cloud.revision = {
            counter:
              Math.max(cloud.revision.counter, winner?.revision.counter ?? 0) +
              1,
            deviceId: cloud.deviceId,
          };
          repeat = true;
        } else if (
          winner &&
          (cloud.preference === "cloud" ||
            compareRevision(winner.revision, cloud.revision) > 0)
        ) {
          const next = prepareImport(config, winner.config);
          if (next.languageMode === "browser")
            next.language = browserLanguage(browser.i18n.getUILanguage());
          next.timeZone ??= Intl.DateTimeFormat().resolvedOptions().timeZone;
          reconcileProfileState(config, next, state);
          config = next;
          cloud.revision = winner.revision;
        } else if (cloud.revision.counter === 0) {
          cloud.revision = { counter: 1, deviceId: cloud.deviceId };
          repeat = true;
        }
        if (!result.partial) delete cloud.preference;
        remoteDays = aggregateReports(remoteUsage());
        cloud.partial = !!result.partial;
        if (!result.partial) cloud.lastSync = Date.now();
        cloud.error = "";
        await browser.storage.local.set({
          cloudCache,
          cloudCredentials: { refresh: credentials.refresh },
        });
        await browser.storage.session.set({
          cloudAccess: {
            access: credentials.access,
            expires: credentials.expires,
          },
        });
        applyCloudQuota(Date.now());
        await enforce(Date.now());
        await save(true);
      });
      if (repeat)
        setTimeout(() => {
          void syncCloud();
        }, 100);
    } catch (error) {
      await serial(async () => {
        if (cloudEpoch !== epoch) return;
        const text = error instanceof Error ? error.message : "";
        cloud.error = [
          "GOOGLE_AUTH_REQUIRED",
          "GOOGLE_SETUP_REQUIRED",
        ].includes(text)
          ? text
          : "SYNC_FAILED";
        await browser.storage.local.set({ cloudMeta: cloud });
      });
    }
  })();
  cloudJob = job;
  try {
    await job;
  } finally {
    if (cloudJob === job) cloudJob = null;
  }
}
async function cloudMessage(
  value: Record<string, unknown>,
  sender: browser.runtime.MessageSender,
): Promise<unknown> {
  await authorizeCloud(value, sender);
  if (value.type === "cloudPrepare") {
    if (!oauthBroker || !browser.identity) throw Error("GOOGLE_SETUP_REQUIRED");
    const prepared = await prepareOAuth(browser.identity.getRedirectURL());
    await authorizeCloud(value, sender);
    await browser.storage.session.set({ pendingOAuth: prepared.pending });
    return { url: prepared.url };
  }
  if (value.type === "cloudComplete") {
    const stored = await browser.storage.session.get("pendingOAuth");
    await browser.storage.session.remove("pendingOAuth");
    if (
      !stored.pendingOAuth ||
      typeof value.returned !== "string" ||
      value.returned.length > 16384
    )
      throw Error("Missing OAuth request");
    const credentials = await completeOAuth(
      value.returned,
      stored.pendingOAuth as PendingOAuth,
    );
    if (!credentials.refresh)
      throw Error("Google offline access was not granted");
    await authorizeCloud(value, sender);
    await serial(async () => {
      cloudEpoch++;
      googleCredentials = credentials;
      cloud.enabled = true;
      cloud.preference = value.preference === "local" ? "local" : "cloud";
      cloud.revision = { counter: 0, deviceId: cloud.deviceId };
      cloud.hashes = {};
      cloudCache = {};
      remoteDays = {};
      cloud.error = "";
      config.timeZone ??= Intl.DateTimeFormat().resolvedOptions().timeZone;
      initializeLedger(config, state);
      await browser.storage.local.set({
        cloudCredentials: { refresh: credentials.refresh },
        cloudCache: {},
      });
      await browser.storage.session.set({
        cloudAccess: {
          access: credentials.access,
          expires: credentials.expires,
        },
      });
      await save(true);
    });
    void syncCloud();
    return cloudStatus();
  }
  if (value.type === "cloudSync") {
    await syncCloud();
    return cloudStatus();
  }
  if (value.type === "cloudDisconnect") {
    await serial(disconnectCloudLocal);
    return cloudStatus();
  }
  throw Error("Unknown cloud request");
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
      visible: msg.visible === true,
    });
    const data = publicData(host, now) as {
      current: { blocked: boolean } | null;
    };
    const interval = usageReminderInterval(
      config,
      host,
      msg.visible === true &&
        focusedWindow === sender.tab.windowId &&
        activeTabs.get(sender.tab.windowId) === sender.tab.id,
      data.current?.blocked === true,
      now,
      state.pauseUntil,
    );
    let remind = false;
    if (interval === null) {
      reminders.delete(sender.tab.id);
    } else {
      const previousReminder = reminders.get(sender.tab.id) ?? now;
      remind = now - previousReminder >= interval;
      reminders.set(sender.tab.id, remind ? now : previousReminder);
    }
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
    if (msg.breakUntil !== state.sites[msg.ruleId]?.breakUntil)
      throw Error("This break has changed. Refresh the page.");
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
  if (msg.type === "read") {
    const { segments: _, ...viewState } = state;
    return {
      config,
      state: { ...viewState, days: reportDays() },
      pinSet: !!pin,
      cloud: cloudStatus(),
    };
  }
  if (msg.type === "save" || msg.type === "importSettings") {
    const next =
      msg.type === "importSettings"
        ? prepareImport(config, validateConfig(msg.config))
        : validateConfig(msg.config);
    if (next.languageMode === "browser")
      next.language = browserLanguage(browser.i18n.getUILanguage());
    if (msg.type === "save" && msg.newPin !== undefined && msg.newPin !== "") {
      pin = await createPin(msg.newPin);
      sessions = {};
      await browser.storage.session.set({ sessions });
    }
    reconcileProfileState(config, next, state);
    config = next;
    cloud.revision = {
      counter: cloud.revision.counter + 1,
      deviceId: cloud.deviceId,
    };
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
browser.runtime.onMessage.addListener((msg, sender, respond) => {
  const cloudRequest =
    typeof msg === "object" &&
    msg !== null &&
    ["cloudPrepare", "cloudComplete", "cloudSync", "cloudDisconnect"].includes(
      msg.type,
    );
  void (
    cloudRequest
      ? cloudMessage(msg, sender)
      : serial(() => message(msg, sender))
  )
    .then((data) => ({ ok: true, data }))
    .catch((error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : "Request failed",
    }))
    .then(respond);
  return true;
});
if (!chromium)
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
    if (id >= 0) {
      const window = await browser.windows.get(id).catch(() => null);
      if (!window || window.state === "minimized") focusedWindow = -1;
    }
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
  void ready.then(() => {
    if (Date.now() - cloud.lastSync >= 60000) void syncCloud();
  });
});
browser.runtime.onStartup.addListener(() => {
  void serial(async () => {
    await browser.alarms.create("checkpoint", { periodInMinutes: 0.5 });
    await enforce(Date.now());
    await save(true);
  });
});
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") void browser.runtime.openOptionsPage();
});
browser.permissions.onRemoved.addListener((permissions) => {
  if (
    permissions.data_collection?.some(
      (type) => type === "browsingActivity" || type === "authenticationInfo",
    )
  )
    void serial(disconnectCloudLocal);
});
