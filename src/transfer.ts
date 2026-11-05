import { validateConfig } from "./core.ts";
import type { Config } from "./core.ts";
export const MAX_SETTINGS_BYTES = 1_048_576;
export function cleanConfig(value: unknown): Config {
  const c = validateConfig(value);
  // Whitelist settings only; never include credentials, sessions or browsing records.
  return {
    version: c.version,
    language: c.language,
    languageMode: c.languageMode ?? "manual",
    ...(c.timeZone ? { timeZone: c.timeZone } : {}),
    reportScope: c.reportScope,
    retentionDays: c.retentionDays,
    pauseEnabled: c.pauseEnabled,
    pauseMaxPerDay: c.pauseMaxPerDay,
    profiles: c.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      breakEveryMinutes: p.breakEveryMinutes,
      breakMinutes: p.breakMinutes,
      scope: p.scope,
      required: p.required,
      allowSkipBreak: p.allowSkipBreak,
      checklist: [...p.checklist],
      backgroundMedia: p.backgroundMedia,
      idleMinutes: p.idleMinutes,
      reminderMinutes: p.reminderMinutes,
    })),
    rules: c.rules.map((r) => ({
      id: r.id,
      host: r.host,
      mode: r.mode,
      minutes: r.minutes,
      reset: r.reset,
      hours: r.hours,
      profileId: r.profileId,
    })),
  };
}
export function exportSettings(config: Config, now = Date.now()): string {
  const text = JSON.stringify(
    {
      format: "timeharbor-settings",
      version: 1,
      exportedAt: new Date(now).toISOString(),
      config: cleanConfig(config),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(text).length > MAX_SETTINGS_BYTES)
    throw Error("Settings file is too large (maximum 1 MiB)");
  return text;
}
export function importSettings(text: string): Config {
  if (
    text.length > MAX_SETTINGS_BYTES ||
    new TextEncoder().encode(text).length > MAX_SETTINGS_BYTES
  )
    throw Error("Settings file is too large (maximum 1 MiB)");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw Error("The settings file is not valid JSON");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw Error("Invalid settings file format");
  const v = data as Record<string, unknown>;
  if (v.format !== "timeharbor-settings" || v.version !== 1)
    throw Error("Unsupported settings file format or version");
  return cleanConfig(v.config);
}
export function prepareImport(current: Config, incoming: Config): Config {
  const next = cleanConfig(incoming),
    ids = new Set<string>();
  const preserved = new Map(current.rules.map((r) => [r.host, r.id]));
  const existingIds = new Set(current.rules.map((r) => r.id));
  for (const r of next.rules) {
    const id = preserved.get(r.host);
    if (id) {
      r.id = id;
      ids.add(id);
    }
  }
  for (const [i, r] of next.rules.entries()) {
    if (preserved.has(r.host)) continue;
    if (ids.has(r.id) || existingIds.has(r.id)) {
      let suffix = 0;
      let candidate = `import-${i}-${suffix}`;
      while (
        ids.has(candidate) ||
        existingIds.has(candidate) ||
        next.rules.some((rule) => rule.id === candidate)
      )
        candidate = `import-${i}-${++suffix}`;
      r.id = candidate;
    }
    ids.add(r.id);
  }
  return validateConfig(next);
}
