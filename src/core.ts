export type Language = "en" | "fa" | "ar" | "es" | "fr" | "de" | "zh";
export interface Profile {
  id: string;
  name: string;
  breakEveryMinutes: number;
  breakMinutes: number;
  scope: "site" | "all";
  required: boolean;
  checklist: string[];
  backgroundMedia: boolean;
  idleMinutes: number;
  reminderMinutes: number;
}
export interface Rule {
  id: string;
  host: string;
  mode: "limit" | "block";
  minutes: number;
  reset: "daily" | "period";
  hours: number;
  profileId: string;
}
export interface Config {
  version: 1;
  language: Language;
  reportScope: "selected" | "all";
  retentionDays: number;
  pauseEnabled: boolean;
  pauseMaxPerDay: number;
  rules: Rule[];
  profiles: Profile[];
}
export interface SiteState {
  windowStart: number | null;
  usedMs: number;
  streakMs: number;
  breakUntil: number;
  awaitingChecks: boolean;
}
export interface Usage {
  usedMs: number;
  pausedMs: number;
}
export interface State {
  sites: Record<string, SiteState>;
  days: Record<string, Record<string, Usage>>;
  pauseUntil: number;
  pauseDay: string;
  pauseCount: number;
}
export interface Verdict {
  blocked: boolean;
  reason: "none" | "manual" | "quota" | "break";
  host: string;
  ruleId: string | null;
  usedMs: number;
  leftMs: number | null;
  resetAt: number | null;
  breakUntil: number;
  needsChecklist: boolean;
  checklist: string[];
}
export const PAUSE_MINUTES = [5, 15, 30, 60, 120, 180, 240] as const;
export function defaultConfig(): Config {
  return {
    version: 1,
    language: "en",
    reportScope: "selected",
    retentionDays: 90,
    pauseEnabled: true,
    pauseMaxPerDay: 1,
    rules: [],
    profiles: [
      {
        id: "balanced",
        name: "Balanced",
        breakEveryMinutes: 30,
        breakMinutes: 5,
        scope: "site",
        required: false,
        checklist: ["Drink water", "Take a walk", "Stretch"],
        backgroundMedia: true,
        idleMinutes: 5,
        reminderMinutes: 10,
      },
    ],
  };
}
export function freshState(): State {
  return { sites: {}, days: {}, pauseUntil: 0, pauseDay: "", pauseCount: 0 };
}
export function normalizeHost(input: string): string {
  const u = new URL(input.includes("://") ? input : `https://${input}`);
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
    throw Error("Invalid website");
  const h = u.hostname
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  if (
    !h ||
    (!h.includes(".") && h !== "localhost") ||
    h.length > 253 ||
    !/^[a-z0-9.-]+$/.test(h) ||
    h.split(".").some((p) => !p || p.startsWith("-") || p.endsWith("-"))
  )
    throw Error("Invalid domain");
  return h;
}
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function nextMidnight(at: number): number {
  const d = new Date(at);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}
export function resolveRule(c: Config, host: string): Rule | undefined {
  return c.rules
    .filter((r) => host === r.host || host.endsWith(`.${r.host}`))
    .sort((a, b) => b.host.length - a.host.length)[0];
}
export function profileFor(c: Config, r: Rule): Profile {
  const p = c.profiles.find((p) => p.id === r.profileId);
  if (!p) throw Error("Missing profile");
  return p;
}
export function siteFor(s: State, r: Rule): SiteState {
  return (s.sites[r.id] ??= {
    windowStart: null,
    usedMs: 0,
    streakMs: 0,
    breakUntil: 0,
    awaitingChecks: false,
  });
}
function syncWindow(r: Rule, st: SiteState, at: number): number | null {
  if (st.windowStart === null)
    return r.reset === "daily" ? nextMidnight(at) : null;
  const end =
    r.reset === "daily"
      ? nextMidnight(st.windowStart)
      : st.windowStart + r.hours * 3_600_000;
  if (at >= end || at < st.windowStart) {
    st.windowStart = null;
    st.usedMs = 0;
    return r.reset === "daily" ? nextMidnight(at) : null;
  }
  return end;
}
function settleBreak(st: SiteState, p: Profile, now: number): void {
  if (st.breakUntil > 0 && now >= st.breakUntil && !p.required) {
    st.breakUntil = 0;
    st.streakMs = 0;
    st.awaitingChecks = false;
  }
}
export function evaluate(
  c: Config,
  s: State,
  host: string,
  now: number,
): Verdict {
  const r = resolveRule(c, host);
  const result: Verdict = {
    blocked: false,
    reason: "none",
    host: r?.host ?? host,
    ruleId: r?.id ?? null,
    usedMs: 0,
    leftMs: null,
    resetAt: null,
    breakUntil: 0,
    needsChecklist: false,
    checklist: [],
  };
  if (r) {
    const st = siteFor(s, r);
    result.resetAt = syncWindow(r, st, now);
    result.usedMs = st.usedMs;
    result.leftMs = Math.max(0, r.minutes * 60_000 - st.usedMs);
    if (r.mode === "block")
      return { ...result, blocked: true, reason: "manual" };
  }
  if (s.pauseUntil > now) return result;
  if (r && result.leftMs === 0)
    return { ...result, blocked: true, reason: "quota" };
  for (const owner of c.rules) {
    if (owner.mode === "block") continue;
    const st = siteFor(s, owner),
      p = profileFor(c, owner);
    settleBreak(st, p, now);
    if (st.breakUntil > 0 && (owner.id === r?.id || p.scope === "all"))
      return {
        ...result,
        ruleId: owner.id,
        blocked: true,
        reason: "break",
        breakUntil: st.breakUntil,
        needsChecklist: p.required && now >= st.breakUntil,
        checklist: p.checklist,
      };
  }
  return result;
}
export function acknowledgeBreak(
  c: Config,
  s: State,
  ruleId: string,
  checks: unknown,
  now: number,
): void {
  const r = c.rules.find((r) => r.id === ruleId);
  if (!r) throw Error("Unknown rule");
  const st = siteFor(s, r),
    p = profileFor(c, r);
  if (!st.breakUntil || now < st.breakUntil)
    throw Error("Break is not finished");
  if (
    p.required &&
    (!Array.isArray(checks) || !p.checklist.every((_, i) => checks.includes(i)))
  )
    throw Error("Complete the checklist");
  st.breakUntil = 0;
  st.awaitingChecks = false;
  st.streakMs = 0;
}
export function account(
  c: Config,
  s: State,
  rawHost: string,
  from: number,
  to: number,
  paused: boolean,
): void {
  if (to <= from || !Number.isFinite(from) || !Number.isFinite(to)) return;
  const r = resolveRule(c, rawHost),
    host = r?.host ?? rawHost;
  if (!r && c.reportScope !== "all") return;
  let cursor = from;
  while (cursor < to) {
    const v = evaluate(c, s, rawHost, cursor);
    if (v.blocked) return;
    let end = Math.min(to, nextMidnight(cursor));
    if (r && !paused) {
      const st = siteFor(s, r),
        p = profileFor(c, r);
      if (st.windowStart === null) st.windowStart = cursor;
      const resetAt = syncWindow(r, st, cursor);
      if (resetAt) end = Math.min(end, resetAt);
      end = Math.min(end, cursor + Math.max(0, r.minutes * 60_000 - st.usedMs));
      if (p.breakEveryMinutes > 0)
        end = Math.min(
          end,
          cursor + Math.max(0, p.breakEveryMinutes * 60_000 - st.streakMs),
        );
    }
    const ms = end - cursor;
    if (ms <= 0) return;
    const day = (s.days[dayKey(cursor)] ??= {});
    const usage = (day[host] ??= { usedMs: 0, pausedMs: 0 });
    usage.usedMs += ms;
    if (paused) usage.pausedMs += ms;
    if (r && !paused) {
      const st = siteFor(s, r),
        p = profileFor(c, r);
      st.usedMs += ms;
      st.streakMs += ms;
      if (
        p.breakEveryMinutes > 0 &&
        st.streakMs >= p.breakEveryMinutes * 60_000
      ) {
        st.breakUntil = end + p.breakMinutes * 60_000;
        st.awaitingChecks = p.required;
      }
    }
    cursor = end;
  }
}
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function safeId(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[-\w]{1,64}$/.test(v) &&
    !["__proto__", "constructor", "prototype"].includes(v)
  );
}
function integer(v: unknown, min: number, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}
export function validateConfig(value: unknown): Config {
  if (
    !record(value) ||
    value.version !== 1 ||
    !["en", "fa", "ar", "es", "fr", "de", "zh"].includes(
      String(value.language),
    ) ||
    !["selected", "all"].includes(String(value.reportScope)) ||
    !integer(value.retentionDays, 1, 3650) ||
    typeof value.pauseEnabled !== "boolean" ||
    !integer(value.pauseMaxPerDay, 0, 100) ||
    !Array.isArray(value.rules) ||
    value.rules.length > 1000 ||
    !Array.isArray(value.profiles) ||
    !value.profiles.length ||
    value.profiles.length > 100
  )
    throw Error("Invalid configuration");
  const ids = new Set<string>(),
    hosts = new Set<string>();
  for (const p of value.profiles) {
    if (
      !record(p) ||
      !safeId(p.id) ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 80 ||
      !integer(p.breakEveryMinutes, 0, 1440) ||
      !integer(p.breakMinutes, 1, 240) ||
      !["site", "all"].includes(String(p.scope)) ||
      typeof p.required !== "boolean" ||
      typeof p.backgroundMedia !== "boolean" ||
      !integer(p.idleMinutes, 1, 60) ||
      !integer(p.reminderMinutes, 1, 120) ||
      !Array.isArray(p.checklist) ||
      p.checklist.length > 12 ||
      !p.checklist.every(
        (t) => typeof t === "string" && t.trim().length > 0 && t.length <= 160,
      ) ||
      (p.required && !p.checklist.length)
    )
      throw Error("Invalid break profile");
    ids.add(p.id);
  }
  const ruleIds = new Set<string>();
  for (const r of value.rules) {
    if (
      !record(r) ||
      !safeId(r.id) ||
      ruleIds.has(r.id) ||
      typeof r.host !== "string" ||
      normalizeHost(r.host) !== r.host ||
      hosts.has(r.host) ||
      !["limit", "block"].includes(String(r.mode)) ||
      !integer(r.minutes, 1, 1440) ||
      !["daily", "period"].includes(String(r.reset)) ||
      !integer(r.hours, 1, 168) ||
      typeof r.profileId !== "string" ||
      !ids.has(r.profileId)
    )
      throw Error("Invalid website rule");
    ruleIds.add(r.id);
    hosts.add(r.host);
  }
  return structuredClone(value) as unknown as Config;
}
export function prune(c: Config, s: State, now: number): void {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - c.retentionDays + 1);
  const min = dayKey(cutoff.getTime());
  for (const day of Object.keys(s.days)) if (day < min) delete s.days[day];
  for (const id of Object.keys(s.sites))
    if (!c.rules.some((r) => r.id === id)) delete s.sites[id];
}
