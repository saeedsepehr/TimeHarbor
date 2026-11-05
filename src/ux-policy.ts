import type { Config, Profile, Rule, State } from "./core.ts";
export const NO_BREAKS = "no-breaks";
export function sameSettings(a: Rule, b: Rule): boolean {
  return (
    a.mode === b.mode &&
    a.minutes === b.minutes &&
    a.reset === b.reset &&
    (a.reset === "daily" || a.hours === b.hours) &&
    a.profileId === b.profileId
  );
}
export function copyTargets(
  c: Config,
  sourceId: string,
): { rule: Rule; identical: boolean }[] {
  const source = c.rules.find((r) => r.id === sourceId);
  if (!source) return [];
  return c.rules
    .filter((r) => r.id !== sourceId)
    .map((rule) => ({ rule, identical: sameSettings(source, rule) }));
}
export function noBreakProfile(c: Config): Profile {
  let profile = c.profiles.find((p) => p.id === NO_BREAKS);
  if (!profile) {
    profile = {
      id: NO_BREAKS,
      name: "No scheduled breaks",
      breakEveryMinutes: 0,
      breakMinutes: 5,
      scope: "site",
      required: false,
      allowSkipBreak: false,
      checklist: [],
      backgroundMedia: true,
      idleMinutes: 5,
      reminderMinutes: 10,
    };
    c.profiles.push(profile);
  }
  return profile;
}
export function detachSites(
  c: Config,
  profileId: string,
  siteIds: string[],
): void {
  const replacement = noBreakProfile(c);
  c.rules = c.rules.map((r) =>
    r.profileId === profileId && siteIds.includes(r.id)
      ? { ...r, profileId: replacement.id }
      : r,
  );
}
export function removeProfile(
  c: Config,
  profileId: string,
  replacementId: string,
): void {
  if (profileId === NO_BREAKS) throw Error("The no-break profile is reserved");
  if (replacementId === NO_BREAKS) noBreakProfile(c);
  if (
    profileId === replacementId ||
    !c.profiles.some((p) => p.id === replacementId)
  )
    throw Error("Choose another break profile");
  c.rules = c.rules.map((r) =>
    r.profileId === profileId ? { ...r, profileId: replacementId } : r,
  );
  c.profiles = c.profiles.filter((p) => p.id !== profileId);
}
export function reconcileProfileState(
  before: Config,
  next: Config,
  state: State,
): void {
  for (const rule of next.rules) {
    const previous = before.rules.find((r) => r.id === rule.id),
      stored = state.sites[rule.id];
    if (!previous || !stored) continue;
    if (
      previous.profileId !== rule.profileId ||
      next.profiles.find((p) => p.id === rule.profileId)?.breakEveryMinutes ===
        0
    ) {
      stored.breakUntil = 0;
      stored.streakMs = 0;
      stored.awaitingChecks = false;
      stored.checks = [];
    }
  }
}
