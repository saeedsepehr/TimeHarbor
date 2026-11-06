import type { Language } from "./core.ts";
export function browserLanguage(locale: string): Language {
  const base = locale.toLowerCase().split(/[-_]/)[0];
  return ["en", "fa", "ar", "es", "fr", "de", "zh"].includes(base ?? "")
    ? (base as Language)
    : "en";
}
export function chargeEnd(
  sample: {
    visible?: boolean;
    playing: boolean;
    received: number;
    lastActivity: number;
  },
  foreground: boolean,
  from: number,
  now: number,
  idleMinutes: number,
): number {
  if (!foreground || sample.visible !== true) return from;
  return Math.max(
    from,
    Math.min(
      now,
      sample.received + 15000,
      sample.playing ? now : sample.lastActivity + idleMinutes * 60000,
    ),
  );
}
import { profileFor, resolveRule } from "./core.ts";
import type { Config } from "./core.ts";

export function usageReminderInterval(
  config: Config,
  host: string,
  foreground: boolean,
  blocked: boolean,
  now: number,
  pauseUntil: number,
): number | null {
  const rule = resolveRule(config, host);
  if (
    !rule ||
    rule.mode !== "limit" ||
    !foreground ||
    blocked ||
    now < pauseUntil
  )
    return null;
  return profileFor(config, rule).reminderMinutes * 60_000;
}
