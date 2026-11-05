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
