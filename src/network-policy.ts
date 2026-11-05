import { evaluate, profileFor } from "./core.ts";
import type { Config, State } from "./core.ts";
export interface NetworkRule {
  id: number;
  priority: number;
  action: {
    type: "allow" | "redirect";
    redirect?: { regexSubstitution: string };
  };
  condition: { regexFilter: string; resourceTypes: ["main_frame"] };
}
export function networkRules(
  c: Config,
  s: State,
  now: number,
  origin: string,
): NetworkRule[] {
  const rules: NetworkRule[] = [];
  const redirect = {
    type: "redirect" as const,
    redirect: { regexSubstitution: origin + "ui/blocked.html?target=\\0" },
  };
  if (
    c.rules.some(
      (r) =>
        r.mode !== "block" &&
        (s.sites[r.id]?.breakUntil ?? 0) > 0 &&
        profileFor(c, r).scope === "all",
    )
  )
    return [
      {
        id: 1,
        priority: 1,
        action: redirect,
        condition: {
          regexFilter: "^https?://.*$",
          resourceTypes: ["main_frame"],
        },
      },
    ];
  for (const [i, rule] of c.rules.entries()) {
    const escaped = rule.host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rules.push({
      id: i + 2,
      priority: rule.host.length + 2,
      action: evaluate(c, s, rule.host, now).blocked
        ? redirect
        : { type: "allow" },
      condition: {
        regexFilter: `^https?://(?:[^/]+\\.)?${escaped}(?::[0-9]+)?(?:/.*)?$`,
        resourceTypes: ["main_frame"],
      },
    });
  }
  return rules;
}
export function blockedTarget(pageUrl: string): string {
  try {
    const marker = pageUrl.indexOf("?target=");
    const target =
      marker >= 0
        ? pageUrl.slice(marker + 8)
        : (new URL(pageUrl).searchParams.get("url") ?? "");
    const url = new URL(target);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? target
      : "";
  } catch {
    return "";
  }
}
