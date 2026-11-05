import { dayKey, normalizeHost, PAUSE_MINUTES, defaultConfig } from "./core.ts";
import type {
  Config,
  Language,
  Profile,
  Rule,
  State,
  Verdict,
} from "./core.ts";
import { duration, languageNames, t } from "./i18n.ts";
import { ux } from "./ux-copy.ts";
import type { UxKey } from "./ux-copy.ts";
import { blockedTarget } from "./network-policy.ts";
import { chromium } from "./platform.ts";
import {
  exportSettings,
  importSettings,
  MAX_SETTINGS_BYTES,
} from "./transfer.ts";
import {
  copyTargets,
  detachSites,
  removeProfile,
  noBreakProfile,
  NO_BREAKS,
} from "./ux-policy.ts";

interface PublicData {
  language: Language;
  pinSet: boolean;
  pauseEnabled: boolean;
  pauseUntil: number;
  pauseCount: number;
  pauseMax: number;
  current: Verdict | null;
  todayMs: number;
}
const app = document.querySelector<HTMLDivElement>("#app")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const page = document.body.dataset.page ?? "options";
let lang: Language = "en",
  token = sessionStorage.getItem("token") ?? "",
  config: Config,
  state: State;
let section: "sites" | "profiles" | "reports" | "settings" | "about" = "sites";
interface CloudStatus {
  configured: boolean;
  enabled: boolean;
  lastSync: number;
  error: string;
  busy: boolean;
  timeZone: string;
  partial?: boolean;
}
let cloudInfo: CloudStatus = {
  configured: false,
  enabled: false,
  lastSync: 0,
  error: "",
  busy: false,
  timeZone: "",
};
let currentUrl = "",
  editingRule: string | null = null;
const openProfiles = new Set<string>();
const checks = new Set<number>();
let fieldSequence = 0;
type Word = Parameters<typeof t>[0];
const tr = (key: Word): string => t(key, lang);
const u = (key: UxKey): string => ux(key, lang);
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = "",
  text = "",
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}
function button(
  text: string,
  action: () => void,
  cls = "button",
): HTMLButtonElement {
  const b = el("button", cls, text);
  b.type = "button";
  b.addEventListener("click", action);
  return b;
}
function announce(text: string, error = false): void {
  status.textContent = text;
  status.className = error ? "error" : "success";
  status.hidden = false;
  setTimeout(() => {
    status.hidden = true;
  }, 6000);
}
async function request<T>(
  type: string,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const result = (await browser.runtime.sendMessage({
    type,
    token,
    ...extra,
  })) as { ok: boolean; data: T; error?: string };
  if (!result.ok) throw Error(result.error ?? "Request failed");
  return result.data;
}
function run(action: () => Promise<void>): void {
  void action().catch((e: unknown) => {
    if (e instanceof Error && e.message === "AUTH_REQUIRED") unlockView();
    announce(e instanceof Error ? e.message : "Request failed", true);
  });
}
function setLanguage(language: Language): void {
  lang = language;
  document.documentElement.lang = lang;
  document.documentElement.dir = ["fa", "ar"].includes(lang) ? "rtl" : "ltr";
}
function input(value = "", type = "text"): HTMLInputElement {
  const i = el("input");
  i.type = type;
  i.value = value;
  return i;
}
function numeric(value: number, min = 1, max = 1440): HTMLInputElement {
  const i = input(String(value), "number");
  i.min = String(min);
  i.max = String(max);
  i.required = true;
  return i;
}
function pinInput(): HTMLInputElement {
  const p = input("", "password");
  p.inputMode = "numeric";
  p.pattern = "[0-9]{4}";
  p.minLength = 4;
  p.maxLength = 4;
  p.autocomplete = "off";
  p.className = "pin-input";
  p.dir = "ltr";
  return p;
}
function select(options: [string, string][], value: string): HTMLSelectElement {
  const s = el("select");
  for (const [key, label] of options) {
    const o = el("option", "", label);
    o.value = key;
    s.append(o);
  }
  s.value = value;
  return s;
}
function helpFor(label: string): string {
  const mappings: [string, UxKey][] = [
    [tr("idle"), "idleHelp"],
    [tr("scope"), "scopeHelp"],
    [tr("every"), "everyHelp"],
    [tr("duration"), "durationHelp"],
    [tr("required"), "requiredFieldHelp"],
    [tr("profile"), "profileHelp"],
    [tr("backgroundMedia"), "mediaHelp"],
    [tr("reminder"), "reminderHelp"],
    [tr("budget"), "budgetHelp"],
    [tr("window"), "windowHelp"],
    [u("resetPolicy"), "resetHelp"],
    [tr("limit"), "modeHelp"],
    [tr("website"), "domainHelp"],
    [tr("checklist"), "checklistHelp"],
    [tr("reportScope"), "reportScopeHelp"],
    [tr("retention"), "retentionHelp"],
    [tr("pauseMax"), "pauseMaxHelp"],
    [tr("pauseAllowed"), "pauseHelp"],
    [tr("newPin"), "pinHelp"],
    [tr("pin"), "pinHelp"],
    [tr("name"), "nameHelp"],
    [tr("from"), "rangeHelp"],
    [tr("to"), "rangeHelp"],
    [tr("language"), "languageHelp"],
  ];
  const entry = mappings.find(([name]) => label.startsWith(name));
  return entry ? u(entry[1]) : "";
}
function infoTip(label: string, text: string): HTMLElement {
  const wrapper = el("span", "info-tip"),
    id = "help-" + ++fieldSequence,
    info = button(
      "i",
      () => {
        const { body } = modal(u("help") + ": " + label);
        body.append(el("p", "", text));
      },
      "info-button",
    ),
    tip = el("span", "sr-only", text);
  tip.id = id;
  tip.dataset.helpText = "true";
  info.title = text;
  info.setAttribute("aria-label", u("help") + ": " + label);
  info.setAttribute("aria-describedby", id);
  wrapper.append(info, tip);
  return wrapper;
}
function field(
  label: string,
  control: HTMLElement,
  help = helpFor(label),
): HTMLElement {
  const wrapper = el("div", "field"),
    row = el("div", "field-label"),
    caption = el("label", "label", label);
  if (!control.id) control.id = "field-" + ++fieldSequence;
  caption.htmlFor = control.id;
  row.append(caption);
  if (help) {
    const tip = infoTip(label, help);
    control.setAttribute(
      "aria-describedby",
      tip.querySelector("[data-help-text]")!.id,
    );
    row.append(tip);
  }
  wrapper.append(row, control);
  return wrapper;
}
function toggle(
  label: string,
  checked: boolean,
  help = helpFor(label),
): { node: HTMLElement; control: HTMLInputElement } {
  const control = input("", "checkbox");
  control.checked = checked;
  const node = el("div", "toggle-field"),
    caption = el("label", "toggle");
  caption.append(control, el("span", "", label));
  node.append(caption);
  if (help) {
    const tip = infoTip(label, help);
    control.setAttribute(
      "aria-describedby",
      tip.querySelector("[data-help-text]")!.id,
    );
    node.append(tip);
  }
  return { node, control };
}
function brand(): HTMLElement {
  const b = el("div", "brand");
  const img = el("img");
  img.src = "../icon.svg";
  img.alt = "";
  b.append(img, el("strong", "", "TimeHarbor"));
  return b;
}
function heading(title: string, subtitle: string): HTMLElement {
  const h = el("header", "heading");
  h.append(
    el("div", "eyebrow", u("eyebrow")),
    el("h1", "", title),
    el("p", "muted", subtitle),
  );
  return h;
}
function card(): HTMLElement {
  return el("section", "card");
}
function formSubmit(form: HTMLFormElement, action: () => Promise<void>): void {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (form.reportValidity()) run(action);
  });
}
async function commit(
  next: Config,
  newPin?: string,
  rerender = true,
): Promise<void> {
  const result = await request<{ token: string }>("save", {
    config: next,
    ...(newPin ? { newPin } : {}),
  });
  token = result.token;
  sessionStorage.setItem("token", token);
  if (rerender) await load();
  else {
    const data = await request<{ config: Config; state: State }>("read");
    config = data.config;
    state = data.state;
  }
  announce(tr("saved"));
}
function withChange(change: (next: Config) => void): void {
  run(async () => {
    const next = structuredClone(config);
    change(next);
    await commit(next);
  });
}
async function load(): Promise<void> {
  const data = await request<{
    config: Config;
    state: State;
    cloud?: CloudStatus;
  }>("read");
  config = data.config;
  state = data.state;
  if (data.cloud) cloudInfo = data.cloud;
  setLanguage(config.language);
  renderOptions();
}
function unlockView(): void {
  app.replaceChildren();
  const box = el("main", "auth");
  box.append(brand(), heading(tr("settings"), tr("local")));
  const f = el("form", "card stack"),
    p = pinInput();
  p.required = true;
  f.append(field(tr("pin"), p));
  const submit = el("button", "button primary", tr("unlock"));
  submit.type = "submit";
  f.append(submit);
  formSubmit(f, async () => {
    const result = await request<{ token: string }>("unlock", { pin: p.value });
    p.value = "";
    token = result.token;
    sessionStorage.setItem("token", token);
    await load();
  });
  box.append(f);
  app.append(box);
  p.focus();
}
function renderOptions(): void {
  const scrollTop = window.scrollY;
  app.replaceChildren();
  const shell = el("div", "shell"),
    sidebar = el("aside", "sidebar");
  sidebar.append(brand(), el("p", "tagline", tr("intro")));
  const nav = el("nav");
  nav.setAttribute("aria-label", tr("settings"));
  for (const key of [
    "sites",
    "profiles",
    "reports",
    "settings",
    "about",
  ] as const) {
    const b = button(
      key === "about" ? u("about") : tr(key),
      () => {
        run(async () => {
          section = key;
          await load();
        });
      },
      "nav-item" + (section === key ? " active" : ""),
    );
    if (section === key) b.setAttribute("aria-current", "page");
    nav.append(b);
  }
  sidebar.append(nav, el("div", "sidebar-note", tr("local")));
  sidebar.append(
    button(
      tr("lock"),
      () =>
        run(async () => {
          await request("lock");
          token = "";
          sessionStorage.removeItem("token");
          unlockView();
        }),
      "button subtle",
    ),
  );
  const main = el("main", "main");
  main.append(
    heading(section === "about" ? u("about") : tr(section), tr("intro")),
  );
  const guide = el("section", "page-guide"),
    guideKey: UxKey =
      section === "sites"
        ? "sitesGuide"
        : section === "profiles"
          ? "profilesGuide"
          : section === "reports"
            ? "reportsGuide"
            : section === "about"
              ? "aboutGuide"
              : "settingsGuide";
  guide.append(el("strong", "", u("how")), el("p", "", u(guideKey)));
  main.append(guide);
  const today = Object.values(state.days[dayKey(Date.now())] ?? {}).reduce(
    (n, v) => n + v.usedMs,
    0,
  );
  const stats = el("div", "stats");
  for (const [label, value] of [
    [tr("today"), duration(today, lang)],
    [tr("sites"), String(config.rules.length)],
    [
      tr("profiles"),
      String(config.profiles.filter((p) => p.id !== NO_BREAKS).length),
    ],
  ]) {
    const s = el("div", "stat");
    s.append(el("span", "muted", label), el("strong", "", value));
    stats.append(s);
  }
  main.append(stats);
  if (section === "sites") sitesView(main);
  else if (section === "profiles") profilesView(main);
  else if (section === "reports") reportsView(main);
  else if (section === "settings") settingsView(main);
  else aboutView(main);
  shell.append(sidebar, main);
  app.append(shell);
  window.scrollTo(0, scrollTop);
}
function profileName(id: string): string {
  return id === NO_BREAKS
    ? u("noBreaks")
    : (config.profiles.find((p) => p.id === id)?.name ?? "");
}
function ruleSummary(rule: Rule): string {
  return `${rule.mode === "block" ? tr("block") : `${rule.minutes} ${tr("minutes")} / ${rule.reset === "daily" ? tr("daily") : `${rule.hours} ${tr("hours")}`}`} · ${profileName(rule.profileId)}`;
}
function modal(title: string): {
  dialog: HTMLDialogElement;
  body: HTMLElement;
  close: () => void;
} {
  const previous = document.activeElement as HTMLElement | null,
    dialog = el("dialog", "dialog"),
    header = el("div", "dialog-header"),
    h = el("h2", "", title),
    body = el("div", "dialog-body");
  h.id = "dialog-title-" + ++fieldSequence;
  dialog.setAttribute("aria-labelledby", h.id);
  const close = (): void => {
    dialog.close();
  };
  const closeButton = button("×", close, "button icon-button");
  closeButton.setAttribute("aria-label", u("close"));
  header.append(h, closeButton);
  dialog.append(header, body);
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (previous?.isConnected) previous.focus({ preventScroll: true });
    else
      document.getElementById("copy-launcher")?.focus({ preventScroll: true });
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body, close };
}
function confirmChange(
  title: string,
  description: string,
  action: () => Promise<void>,
  extra?: HTMLElement,
): void {
  const { body, close } = modal(title);
  body.append(el("p", "muted", description));
  if (extra) body.append(extra);
  const actions = el("div", "actions");
  const accept = button(
    u("confirm"),
    () => {
      accept.disabled = true;
      run(async () => {
        try {
          await action();
          close();
        } finally {
          accept.disabled = false;
        }
      });
    },
    "button primary",
  );
  actions.append(button(u("cancel"), close), accept);
  body.append(actions);
}
function profileEditor(
  profile?: Profile,
  onSave?: (profile: Profile) => Promise<void>,
): HTMLFormElement {
  const f = el("form", "stack profile-editor");
  f.dataset.editor = "profile";
  const name = input(profile?.name ?? "");
  name.name = "profileName";
  name.required = true;
  name.maxLength = 80;
  const every = numeric(profile?.breakEveryMinutes ?? 30, 0),
    length = numeric(profile?.breakMinutes ?? 5, 1, 240),
    scope = select(
      [
        ["site", u("assignedSite")],
        ["all", tr("allSites")],
      ],
      profile?.scope ?? "site",
    );
  every.name = "breakEveryMinutes";
  length.name = "breakMinutes";
  scope.name = "scope";
  const idle = numeric(profile?.idleMinutes ?? 5, 1, 60),
    reminder = numeric(profile?.reminderMinutes ?? 10, 1, 120),
    required = toggle(tr("required"), profile?.required ?? false),
    skip = toggle(
      u("allowSkip"),
      profile?.allowSkipBreak ?? false,
      u("skipHelp"),
    );
  idle.name = "idleMinutes";
  reminder.name = "reminderMinutes";
  required.control.name = "required";
  skip.control.name = "allowSkipBreak";
  const checklist = el("textarea");
  checklist.rows = 3;
  checklist.name = "checklist";
  checklist.value = (
    profile?.checklist ?? defaultConfig(lang).profiles[0]!.checklist
  ).join("\n");
  const grid = el("div", "form-grid");
  grid.append(
    field(tr("name"), name),
    field(tr("every"), every),
    field(tr("duration"), length),
    field(tr("scope"), scope),
    field(tr("idle"), idle),
    field(tr("reminder"), reminder),
  );
  f.append(grid, field(tr("checklist"), checklist), required.node, skip.node);
  const save = el("button", "button primary", tr("save"));
  save.type = "submit";
  f.append(save);
  formSubmit(f, async () => {
    const nextProfile: Profile = {
      id: profile?.id ?? crypto.randomUUID(),
      name: name.value.trim(),
      breakEveryMinutes: Number(every.value),
      breakMinutes: Number(length.value),
      scope: scope.value as "site" | "all",
      required: required.control.checked,
      allowSkipBreak: skip.control.checked,
      checklist: checklist.value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      backgroundMedia: false,
      idleMinutes: Number(idle.value),
      reminderMinutes: Number(reminder.value),
    };
    if (onSave) {
      await onSave(nextProfile);
      return;
    }
    const next = structuredClone(config);
    if (profile)
      next.profiles = next.profiles.map((p) =>
        p.id === profile.id ? nextProfile : p,
      );
    else next.profiles.push(nextProfile);
    await commit(next);
  });
  return f;
}
function createProfileDialog(onCreated: (profile: Profile) => void): void {
  const { body, close } = modal(u("addProfile"));
  body.append(el("p", "muted", u("profilesGuide")));
  const form = profileEditor(undefined, async (profile) => {
    const next = structuredClone(config);
    next.profiles.push(profile);
    await commit(next, undefined, false);
    close();
    onCreated(profile);
  });
  body.append(form);
  form.querySelector<HTMLInputElement>("input")?.focus();
}
function ruleEditor(rule?: Rule): HTMLFormElement {
  const f = el("form", "stack site-editor");
  f.dataset.editor = "website";
  const domains = el("textarea");
  domains.rows = rule ? 1 : 2;
  domains.name = "websites";
  domains.placeholder = "youtube.com\naparat.com";
  domains.required = true;
  domains.dir = "ltr";
  domains.value = rule?.host ?? "";
  const mode = select(
      [
        ["limit", tr("limit")],
        ["block", tr("block")],
      ],
      rule?.mode ?? "limit",
    ),
    minutes = numeric(rule?.minutes ?? 60),
    reset = select(
      [
        ["daily", tr("daily")],
        ["period", tr("period")],
      ],
      rule?.reset ?? "period",
    ),
    hours = numeric(rule?.hours ?? 6, 1, 168);
  mode.name = "mode";
  minutes.name = "minutes";
  reset.name = "reset";
  hours.name = "hours";
  const options: [string, string][] = config.profiles.map((p) => [
    p.id,
    profileName(p.id),
  ]);
  if (!config.profiles.some((p) => p.id === NO_BREAKS))
    options.push([NO_BREAKS, u("noBreaks")]);
  options.push(["__new_profile__", u("newProfile")]);
  const profile = select(options, rule?.profileId ?? config.profiles[0]!.id);
  profile.name = "profileId";
  let lastProfile = profile.value;
  profile.addEventListener("change", () => {
    if (profile.value === "__new_profile__") {
      profile.value = lastProfile;
      createProfileDialog((created) => {
        const option = el("option", "", created.name);
        option.value = created.id;
        profile.insertBefore(option, profile.lastElementChild);
        profile.value = created.id;
        lastProfile = created.id;
        profile.focus({ preventScroll: true });
      });
    } else lastProfile = profile.value;
  });
  const grid = el("div", "form-grid");
  grid.append(
    field(tr("limit"), mode),
    field(tr("budget") + " · " + tr("minutes"), minutes),
    field(u("resetPolicy"), reset),
    field(tr("window"), hours),
    field(tr("profile"), profile),
  );
  const update = (): void => {
    const blocked = mode.value === "block";
    minutes.disabled = blocked;
    reset.disabled = blocked;
    hours.disabled = blocked || reset.value === "daily";
  };
  mode.addEventListener("change", update);
  reset.addEventListener("change", update);
  update();
  f.append(field(tr("website"), domains), grid);
  const actions = el("div", "actions"),
    save = el("button", "button primary", rule ? tr("save") : tr("add"));
  save.type = "submit";
  actions.append(save);
  if (rule)
    actions.append(
      button(
        u("cancel"),
        () => {
          editingRule = null;
          renderOptions();
        },
        "button subtle",
      ),
    );
  f.append(actions);
  formSubmit(f, async () => {
    const next = structuredClone(config);
    const hosts = domains.value
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normalizeHost);
    if (!hosts.length) throw Error("Enter a website");
    if (rule && hosts.length !== 1) throw Error("Edit one website at a time");
    if (
      profile.value === NO_BREAKS &&
      !next.profiles.some((p) => p.id === NO_BREAKS)
    ) {
      // Create the reserved no-break routine only when selected.
      noBreakProfile(next);
    }
    for (const host of hosts) {
      if (next.rules.some((r) => r.host === host && r.id !== rule?.id))
        throw Error("Website already exists: " + host);
      const updated: Rule = {
        id: rule?.id ?? crypto.randomUUID(),
        host,
        mode: mode.value as Rule["mode"],
        minutes:
          mode.value === "block"
            ? (rule?.minutes ?? 60)
            : Number(minutes.value),
        reset: reset.value as Rule["reset"],
        hours: reset.value === "daily" ? 24 : Number(hours.value),
        profileId: profile.value,
      };
      if (rule)
        next.rules = next.rules.map((r) => (r.id === rule.id ? updated : r));
      else next.rules.push(updated);
    }
    editingRule = null;
    await commit(next);
  });
  return f;
}
function copyWizard(): void {
  const { body, close } = modal(u("copyWizard"));
  let step = 1,
    sourceId = config.rules[0]!.id;
  const targets = new Set<string>();
  const draw = (): void => {
    body.replaceChildren();
    const progress = el("ol", "wizard-progress");
    for (const [i, key] of [
      "chooseSource",
      "chooseTargets",
      "reviewCopy",
    ].entries()) {
      const item = el("li", step === i + 1 ? "current" : "", u(key as UxKey));
      if (step === i + 1) item.setAttribute("aria-current", "step");
      progress.append(item);
    }
    body.append(progress);
    const source = config.rules.find((r) => r.id === sourceId)!;
    if (step === 1) {
      body.append(el("p", "muted", u("sourceHelp")));
      const picker = select(
        config.rules.map((r) => [r.id, r.host]),
        sourceId,
      );
      picker.name = "copySource";
      picker.addEventListener("change", () => {
        sourceId = picker.value;
        targets.clear();
        summary.textContent = ruleSummary(
          config.rules.find((r) => r.id === sourceId)!,
        );
      });
      const summary = el("p", "policy-summary", ruleSummary(source));
      body.append(field(tr("source"), picker, u("sourceHelp")), summary);
    } else if (step === 2) {
      body.append(el("p", "muted", u("targetsHelp")));
      const list = el("div", "copy-targets");
      for (const target of copyTargets(config, sourceId)) {
        const choice = toggle(target.rule.host, targets.has(target.rule.id));
        choice.node.classList.add("target-item");
        choice.control.name = "copyTarget";
        choice.control.value = target.rule.id;
        choice.control.disabled = target.identical;
        if (target.identical) {
          choice.node.classList.add("identical");
          choice.node.append(el("small", "muted", u("alreadyMatches")));
        } else
          choice.control.addEventListener("change", () => {
            if (choice.control.checked) targets.add(target.rule.id);
            else targets.delete(target.rule.id);
            next.disabled = targets.size === 0;
            count.textContent = `${u("selectedCount")}: ${targets.size}`;
          });
        list.append(choice.node);
      }
      const count = el("p", "muted", `${u("selectedCount")}: ${targets.size}`);
      body.append(list, count);
    } else {
      body.append(
        el("p", "muted", u("reviewHelp")),
        el("p", "policy-summary", `${source.host} → ${ruleSummary(source)}`),
      );
      const list = el("ul", "review-list");
      for (const rule of config.rules.filter((r) => targets.has(r.id))) {
        const item = el("li");
        item.append(
          el("strong", "domain", rule.host),
          el("small", "muted", ruleSummary(rule)),
          el("span", "", `→ ${ruleSummary(source)}`),
        );
        list.append(item);
      }
      body.append(list);
    }
    const actions = el("div", "actions wizard-actions");
    actions.append(button(u("cancel"), close));
    if (step > 1)
      actions.append(
        button(u("previous"), () => {
          step--;
          draw();
        }),
      );
    const next = button(
      step === 3 ? u("apply") : u("next"),
      () => {
        if (step < 3) {
          step++;
          draw();
        } else
          run(async () => {
            const updated = structuredClone(config);
            updated.rules = updated.rules.map((r) =>
              targets.has(r.id) ? { ...source, id: r.id, host: r.host } : r,
            );
            await commit(updated);
            close();
          });
      },
      "button primary",
    );
    next.dataset.action = step === 3 ? "apply-copy" : "next-copy";
    next.disabled = step === 2 && targets.size === 0;
    actions.append(next);
    body.append(actions);
  };
  draw();
}
function sitesView(main: HTMLElement): void {
  const add = el("details", "card create-panel");
  add.open = config.rules.length === 0;
  const summary = el("summary", "section-summary", tr("add"));
  add.append(summary, ruleEditor());
  main.append(add);
  const list = card(),
    title = el("div", "section-header");
  title.append(el("h2", "", tr("sites")));
  if (config.rules.length > 1) {
    const copy = button(u("copyWizard"), copyWizard, "button small");
    copy.id = "copy-launcher";
    title.append(copy);
  }
  list.append(title);
  if (!config.rules.length) {
    list.append(el("p", "empty", tr("noData")));
    main.append(list);
    return;
  }
  const table = el("table"),
    head = el("thead"),
    headRow = el("tr");
  for (const label of [tr("website"), tr("budget"), tr("profile"), tr("edit")])
    headRow.append(el("th", "", label));
  head.append(headRow);
  table.append(head);
  const tbody = el("tbody");
  for (const rule of config.rules) {
    const row = el("tr");
    row.dataset.ruleId = rule.id;
    const controls = el("td", "row-actions"),
      edit = button(
        tr("edit"),
        () => {
          editingRule = editingRule === rule.id ? null : rule.id;
          renderOptions();
          document
            .querySelector<HTMLElement>(
              `[data-editor-for="${rule.id}"] textarea`,
            )
            ?.focus({ preventScroll: true });
        },
        "button small",
      );
    edit.setAttribute("aria-expanded", String(editingRule === rule.id));
    edit.setAttribute("aria-controls", "editor-" + rule.id);
    controls.append(
      edit,
      button(
        tr("delete"),
        () =>
          confirmChange(tr("delete"), rule.host, async () => {
            const next = structuredClone(config);
            next.rules = next.rules.filter((r) => r.id !== rule.id);
            await commit(next);
          }),
        "button small danger",
      ),
    );
    row.append(
      el("td", "domain", rule.host),
      el(
        "td",
        "",
        rule.mode === "block"
          ? tr("block")
          : `${rule.minutes} ${tr("minutes")} / ${rule.reset === "daily" ? tr("daily") : `${rule.hours} ${tr("hours")}`}`,
      ),
      el("td", "", profileName(rule.profileId)),
      controls,
    );
    tbody.append(row);
    if (editingRule === rule.id) {
      const editorRow = el("tr", "inline-editor-row"),
        cell = el("td");
      cell.colSpan = 4;
      const panel = el("section", "inline-editor");
      panel.id = "editor-" + rule.id;
      panel.dataset.editorFor = rule.id;
      panel.append(el("h3", "domain", rule.host), ruleEditor(rule));
      cell.append(panel);
      editorRow.append(cell);
      tbody.append(editorRow);
    }
  }
  table.append(tbody);
  const scroll = el("div", "table-scroll");
  scroll.append(table);
  list.append(scroll);
  main.append(list);
}
function connectedSites(profile: Profile): HTMLElement {
  const wrapper = el("section", "connected-sites");
  wrapper.append(el("h3", "", u("linked")), el("p", "muted", u("linkedHelp")));
  const sites = config.rules.filter((r) => r.profileId === profile.id);
  if (!sites.length) {
    wrapper.append(el("p", "muted", u("noLinked")));
    return wrapper;
  }
  const chips = el("div", "site-chips");
  for (const site of sites) {
    const chip = el("span", "site-chip"),
      detach = button(
        "×",
        () => withChange((next) => detachSites(next, profile.id, [site.id])),
        "chip-remove",
      );
    detach.setAttribute("aria-label", `${u("detach")} ${site.host}`);
    chip.append(el("span", "domain", site.host), detach);
    chips.append(chip);
  }
  wrapper.append(
    chips,
    button(
      u("detachAll"),
      () =>
        confirmChange(
          u("detachAll"),
          `${u("detachConfirm")} (${sites.length})`,
          async () => {
            const next = structuredClone(config);
            detachSites(
              next,
              profile.id,
              sites.map((r) => r.id),
            );
            await commit(next);
          },
        ),
      "button small",
    ),
  );
  return wrapper;
}
function deleteProfileDialog(profile: Profile): void {
  const replacement = select(
    [
      [NO_BREAKS, u("noBreaks")],
      ...config.profiles
        .filter((p) => p.id !== profile.id && p.id !== NO_BREAKS)
        .map((p) => [p.id, p.name] as [string, string]),
    ],
    NO_BREAKS,
  );
  replacement.name = "replacementProfile";
  confirmChange(
    u("deleteProfile"),
    `${profile.name} — ${u("deleteProfileHelp")}`,
    async () => {
      const next = structuredClone(config);
      removeProfile(next, profile.id, replacement.value);
      openProfiles.delete(profile.id);
      await commit(next);
    },
    field(u("replaceWith"), replacement, u("linkedHelp")),
  );
}
function profilesView(main: HTMLElement): void {
  const add = el("details", "card create-panel");
  add.append(
    el("summary", "section-summary", u("addProfile")),
    profileEditor(),
  );
  main.append(add);
  const cards = el("div", "profile-grid");
  for (const profile of config.profiles.filter((p) => p.id !== NO_BREAKS)) {
    const cardNode = card();
    cardNode.classList.add("profile-card");
    cardNode.dataset.profileId = profile.id;
    const title = el("div", "section-header");
    title.append(
      el("h2", "", profile.name),
      el(
        "span",
        "badge",
        String(config.rules.filter((r) => r.profileId === profile.id).length) +
          " " +
          tr("sites"),
      ),
    );
    cardNode.append(
      title,
      el(
        "p",
        "muted",
        `${profile.breakEveryMinutes} ${tr("minutes")} → ${profile.breakMinutes} ${tr("minutes")}`,
      ),
      el("p", "", profile.checklist.join(" · ")),
    );
    const details = el("details", "profile-details");
    details.open = openProfiles.has(profile.id);
    details.addEventListener("toggle", () => {
      if (details.open) openProfiles.add(profile.id);
      else openProfiles.delete(profile.id);
    });
    details.append(
      el("summary", "button small", tr("edit")),
      connectedSites(profile),
      profileEditor(profile),
    );
    cardNode.append(
      details,
      button(
        u("deleteProfile"),
        () => deleteProfileDialog(profile),
        "button small danger profile-delete",
      ),
    );
    cards.append(cardNode);
  }
  main.append(cards);
}

function reportsView(main: HTMLElement): void {
  const box = card(),
    controls = el("div", "actions"),
    from = input(dayKey(Date.now() - 6 * 86_400_000), "date"),
    to = input(dayKey(Date.now()), "date");
  const rows = el("div");
  controls.append(field(tr("from"), from), field(tr("to"), to));
  let totals: [string, { usedMs: number; pausedMs: number }][] = [];
  const draw = (): void => {
    rows.replaceChildren();
    if (!from.value || !to.value || from.value > to.value) {
      rows.append(el("p", "error", "Choose a valid date range"));
      return;
    }
    const aggregate = new Map<string, { usedMs: number; pausedMs: number }>();
    for (const [day, sites] of Object.entries(state.days)) {
      if (day < from.value || day > to.value) continue;
      for (const [host, v] of Object.entries(sites)) {
        const old = aggregate.get(host) ?? { usedMs: 0, pausedMs: 0 };
        old.usedMs += v.usedMs;
        old.pausedMs += v.pausedMs;
        aggregate.set(host, old);
      }
    }
    totals = [...aggregate].sort((a, b) => b[1].usedMs - a[1].usedMs);
    if (!totals.length) rows.append(el("p", "empty", tr("noData")));
    const max = totals[0]?.[1].usedMs ?? 1;
    for (const [host, v] of totals) {
      const r = el("div", "report-row"),
        line = el("div", "report-line");
      line.append(
        el("strong", "domain", host),
        el("span", "", duration(v.usedMs, lang)),
      );
      const track = el("div", "bar-track"),
        bar = el("div", "bar");
      bar.style.width = Math.max(1, (v.usedMs / max) * 100) + "%";
      track.append(bar);
      r.append(
        line,
        track,
        el("small", "muted", `${tr("paused")}: ${duration(v.pausedMs, lang)}`),
      );
      rows.append(r);
    }
    const breaks = (state.breaks ?? [])
      .filter((entry) => {
        const date = dayKey(entry.endedAt);
        return date >= from.value && date <= to.value;
      })
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, 100);
    if (breaks.length) {
      const report = el("section", "break-report");
      report.append(el("h2", "", u("breakHistory")));
      for (const entry of breaks) {
        const row = el("article"),
          line = el("div", "report-line");
        line.append(
          el("strong", "domain", entry.host),
          el("span", "badge", u(entry.skipped ? "skipped" : "completed")),
        );
        row.append(
          line,
          el("small", "muted", new Date(entry.endedAt).toLocaleString(lang)),
        );
        const activities = el("div", "site-chips");
        for (const text of entry.checklist)
          activities.append(
            el(
              "span",
              "site-chip",
              (entry.checked.includes(text) ? "✓ " : "○ ") + text,
            ),
          );
        row.append(activities);
        report.append(row);
      }
      rows.append(report);
    }
  };
  for (const [key, days] of [
    ["today", 1],
    ["week", 7],
    ["month", 30],
  ] as const)
    controls.append(
      button(
        tr(key),
        () => {
          from.value = dayKey(Date.now() - (days - 1) * 86_400_000);
          to.value = dayKey(Date.now());
          draw();
        },
        "button small",
      ),
    );
  controls.append(
    button(
      tr("export"),
      () => {
        const csv = [
          "website,used_minutes,pause_minutes",
          ...totals.map(
            ([h, v]) =>
              `${h},${(v.usedMs / 60_000).toFixed(2)},${(v.pausedMs / 60_000).toFixed(2)}`,
          ),
        ].join("\r\n");
        const url = URL.createObjectURL(
          new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
        );
        const a = el("a");
        a.href = url;
        a.download = `timeharbor-${from.value}-${to.value}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      "button small",
    ),
  );
  from.addEventListener("change", draw);
  to.addEventListener("change", draw);
  box.append(controls, rows);
  main.append(box);
  draw();
}
function settingsView(main: HTMLElement): void {
  const box = card(),
    f = el("form", "stack"),
    language = select(
      [["auto", u("browserLanguage")], ...Object.entries(languageNames)],
      config.languageMode === "browser" ? "auto" : config.language,
    ),
    scope = select(
      [
        ["selected", tr("selected")],
        ["all", tr("allVisited")],
      ],
      config.reportScope,
    ),
    retention = numeric(config.retentionDays, 1, 3650),
    pause = toggle(tr("pauseAllowed"), config.pauseEnabled),
    max = numeric(config.pauseMaxPerDay, 0, 100),
    newPin = pinInput();
  const grid = el("div", "form-grid");
  grid.append(
    field(tr("language"), language),
    field(tr("reportScope"), scope),
    field(tr("retention"), retention),
    field(tr("pauseMax"), max),
    field(tr("newPin"), newPin),
  );
  f.append(grid, pause.node);
  const actions = el("div", "actions"),
    save = el("button", "button primary", tr("save"));
  save.type = "submit";
  actions.append(
    save,
    button(
      tr("family"),
      () => {
        if (!newPin.value) throwError("Enter a new four-digit PIN first");
        else {
          const next = structuredClone(config);
          next.pauseEnabled = false;
          next.profiles = next.profiles.map((p) => ({
            ...p,
            required: true,
            allowSkipBreak: false,
            checklist: p.checklist.length
              ? p.checklist
              : defaultConfig(lang).profiles[0]!.checklist,
          }));
          run(() => commit(next, newPin.value));
        }
      },
      "button",
    ),
  );
  f.append(actions, el("p", "muted", tr("local")));
  formSubmit(f, async () => {
    const next = structuredClone(config);
    next.languageMode = language.value === "auto" ? "browser" : "manual";
    if (language.value !== "auto") next.language = language.value as Language;
    next.reportScope = scope.value as Config["reportScope"];
    next.retentionDays = Number(retention.value);
    next.pauseEnabled = pause.control.checked;
    next.pauseMaxPerDay = Number(max.value);
    await commit(next, newPin.value);
  });
  box.append(f);
  main.append(box);
  const transfer = card();
  transfer.classList.add("transfer-card");
  transfer.append(
    el("h2", "", u("transfer")),
    el("p", "muted", u("transferHelp")),
  );
  const actionsTransfer = el("div", "actions"),
    file = input("", "file");
  file.accept = ".json,application/json";
  file.hidden = true;
  file.addEventListener("change", () =>
    run(async () => {
      const chosen = file.files?.[0];
      file.value = "";
      if (!chosen) return;
      if (chosen.size > MAX_SETTINGS_BYTES)
        throw Error("Settings file is too large (maximum 1 MiB)");
      const incoming = importSettings(await chosen.text());
      const summary = el(
        "div",
        "policy-summary",
        `${tr("sites")}: ${incoming.rules.length} · ${tr("profiles")}: ${incoming.profiles.length}`,
      );
      confirmChange(
        u("importReview"),
        u("importWarning"),
        async () => {
          const result = await request<{ token: string }>("importSettings", {
            config: incoming,
          });
          token = result.token;
          sessionStorage.setItem("token", token);
          await load();
          announce(u("importDone"));
        },
        summary,
      );
    }),
  );
  actionsTransfer.append(
    button(u("exportSettings"), () =>
      run(async () => {
        // Refresh authorization and settings before writing the file.
        const latest = await request<{ config: Config }>("read");
        const blob = URL.createObjectURL(
          new Blob([exportSettings(latest.config)], {
            type: "application/json",
          }),
        );
        const a = el("a");
        a.href = blob;
        a.download = `timeharbor-settings-${dayKey(Date.now())}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(blob), 1000);
      }),
    ),
    button(u("importSettings"), () => file.click()),
    file,
  );
  transfer.append(actionsTransfer);
  main.append(transfer);
  cloudView(main);
}
function cloudView(main: HTMLElement): void {
  const box = card();
  box.classList.add("cloud-card");
  if (cloudInfo.partial) box.append(el("p", "muted", u("cloudProgress")));
  box.append(el("h2", "", u("cloudTitle")), el("p", "muted", u("cloudHelp")));
  if (!cloudInfo.configured) {
    box.append(el("p", "policy-summary", u("cloudSetup")));
    if (!cloudInfo.enabled) {
      main.append(box);
      return;
    }
  } else if (cloudInfo.enabled)
    box.append(
      el(
        "p",
        "policy-summary",
        u("cloudConnected") +
          (cloudInfo.lastSync
            ? " · " + new Date(cloudInfo.lastSync).toLocaleString(lang)
            : ""),
      ),
    );
  if (cloudInfo.error)
    box.append(
      el(
        "p",
        "error",
        u(
          cloudInfo.error === "GOOGLE_AUTH_REQUIRED"
            ? "cloudReauthorize"
            : "cloudError",
        ),
      ),
    );
  const actions = el("div", "actions");
  if (!cloudInfo.enabled) {
    const agree = toggle(u("cloudConsent"), false);
    const preference = select(
      [
        ["cloud", u("cloudRestore")],
        ["local", u("cloudUseLocal")],
      ],
      "cloud",
    );
    const connect = button(
      u("cloudConnect"),
      () =>
        run(async () => {
          if (!agree.control.checked) throw Error(u("cloudConsent"));
          if (
            !chromium &&
            !(await browser.permissions.request({
              data_collection: ["browsingActivity", "authenticationInfo"],
            }))
          )
            throw Error(u("cloudConsent"));
          const prepared = await request<{ url: string }>("cloudPrepare");
          const returned = await browser.identity.launchWebAuthFlow({
            url: prepared.url,
            interactive: true,
          });
          await request("cloudComplete", {
            returned,
            preference: preference.value,
          });
          await load();
        }),
      "button primary",
    );
    connect.disabled = !cloudInfo.configured;
    box.append(
      agree.node,
      field(u("cloudInitial"), preference, u("cloudConflict")),
    );
    actions.append(connect);
  } else {
    actions.append(
      button(u("cloudSyncNow"), () =>
        run(async () => {
          await request("cloudSync");
          await load();
        }),
      ),
      button(
        u("cloudDisconnect"),
        () =>
          confirmChange(
            u("cloudDisconnect"),
            u("cloudDisconnectHelp"),
            async () => {
              await request("cloudDisconnect");
              await load();
            },
          ),
        "button danger",
      ),
    );
    box.append(
      el("p", "muted", u("cloudOffline")),
      el("small", "muted", u("cloudTimezone") + ": " + cloudInfo.timeZone),
    );
  }
  box.append(actions);
  main.append(box);
}
function aboutView(main: HTMLElement): void {
  const box = card();
  box.classList.add("about-card");
  box.append(
    el("h2", "", "Saeed Sepehr · سعید سپهر"),
    el("p", "author-note", u("authorNote")),
    el("h3", "", u("contact")),
  );
  const links = el("div", "social-links");
  for (const [label, url] of [
    ["GitHub · saeedsepehr", "https://github.com/saeedsepehr"],
    ["Instagram · BedeBestun", "https://instagram.com/bedebestun"],
    ["LinkedIn · Saeed Sepehr", "https://www.linkedin.com/in/saeedsepehr"],
    ["Telegram · saeedsepehr", "https://t.me/saeedsepehr"],
    ["X / Twitter · bedebestun", "https://x.com/bedebestun"],
    ["Virgool · seeed-sepehr", "https://virgool.io/@seeed-sepehr"],
    [u("bugReport"), "https://github.com/saeedsepehr/TimeHarbor/issues"],
  ]) {
    const a = el("a", "button", label);
    a.href = url!;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    links.append(a);
  }
  box.append(
    links,
    el(
      "p",
      "muted",
      "TimeHarbor · MIT · " + browser.runtime.getManifest().version,
    ),
  );
  main.append(box);
  const toolbar = card();
  toolbar.append(el("p", "", u("toolbarHelp")));
  main.append(toolbar);
}
function throwError(text: string): void {
  announce(text, true);
}
let publicViewKey = "",
  activeBreak: Verdict | null = null,
  activityStage = "";
async function leaveBreak(
  type: "breakDone" | "breakSkip",
  v: Verdict,
): Promise<void> {
  await request(type, {
    ruleId: v.ruleId,
    breakUntil: v.breakUntil,
    checks: [...checks],
  });
  const data = await request<PublicData>("public", { url: currentUrl });
  if (data.current?.blocked) {
    await renderPublic();
    if (data.current.reason === "quota") announce(u("quotaAfterBreak"));
    return;
  }
  if (!currentUrl) throw Error(u("missingReturnUrl"));
  const target = new URL(currentUrl);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password
  )
    throw Error(u("missingReturnUrl"));
  location.replace(target.href);
}
function pauseForm(data: PublicData): HTMLElement {
  const box = card();
  box.classList.add("pause-card");
  box.append(el("h2", "", tr("pause")), el("p", "muted", u("pauseHelp")));
  const left = Math.max(0, data.pauseMax - data.pauseCount);
  box.append(
    el(
      "p",
      "allowance-summary",
      `${u("pauseLeft")}: ${left} / ${data.pauseMax}`,
    ),
    el("small", "muted", u("pauseMaxHelp")),
  );
  if (data.pauseUntil > Date.now()) {
    box.append(
      el("p", "", new Date(data.pauseUntil).toLocaleTimeString(lang)),
      button(
        tr("resume"),
        () =>
          run(async () => {
            await request("resume");
            await renderPublic();
          }),
        "button primary",
      ),
    );
    return box;
  }
  if (!data.pauseEnabled) {
    box.append(el("p", "muted", u("pauseDisabled")));
    return box;
  }
  if (!data.pinSet) {
    box.append(el("p", "muted", u("pinNeeded")));
    return box;
  }
  const form = el("form", "stack"),
    pin = pinInput(),
    time = select(
      PAUSE_MINUTES.map((n) => [String(n), `${n} ${tr("minutes")}`]),
      "15",
    );
  pin.required = true;
  form.append(
    field(tr("minutes"), time, u("pauseHelp")),
    field(tr("pin"), pin),
  );
  const submit = el("button", "button primary", tr("pause"));
  submit.type = "submit";
  submit.disabled = left === 0;
  form.append(submit);
  formSubmit(form, async () => {
    await request("pause", {
      pin: pin.value,
      minutes: Number(time.value),
      url: currentUrl,
    });
    pin.value = "";
    await renderPublic();
  });
  box.append(form);
  return box;
}
function updateBreakClock(): void {
  const v = activeBreak;
  if (!v) return;
  const seconds = Math.max(0, Math.ceil((v.breakUntil - Date.now()) / 1000));
  const count = document.getElementById("break-countdown");
  if (count) {
    const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    if (count.textContent !== text) count.textContent = text;
  }
  const list = document.getElementById("break-activities"),
    stage = v.checklistRequired && seconds > 0 ? "reminders" : "checkboxes";
  if (list && stage !== activityStage) {
    activityStage = stage;
    list.replaceChildren();
    list.className = "break-activities " + stage;
    for (const [index, text] of v.checklist.entries()) {
      if (stage === "reminders") {
        const item = el("div", "activity-reminder");
        item.append(el("span", "activity-symbol", "✦"), el("span", "", text));
        list.append(item);
      } else {
        const item = toggle(text, checks.has(index));
        item.node.classList.add("activity-checkbox");
        item.control.id = "break-check-" + index;
        item.control.addEventListener("change", () => {
          if (item.control.checked) checks.add(index);
          else checks.delete(index);
          updateBreakClock();
          run(async () => {
            await request("breakChecks", {
              ruleId: v.ruleId,
              breakUntil: v.breakUntil,
              checks: [...checks],
            });
          });
        });
        list.append(item.node);
      }
    }
  }
  const help = document.getElementById("break-instructions");
  if (help) {
    const text = v.checklistRequired
      ? seconds > 0
        ? u("remember") + " " + u("requiredHelp")
        : u("confirmActivities")
      : u("optionalHelp");
    if (help.textContent !== text) help.textContent = text;
  }
  const done = document.querySelector<HTMLButtonElement>("#finish-break");
  if (done)
    done.disabled =
      seconds > 0 || (v.checklistRequired && checks.size < v.checklist.length);
}
async function renderPublic(): Promise<void> {
  const data = await request<PublicData>("public", { url: currentUrl });
  setLanguage(data.language);
  const v = data.current,
    reason = v?.reason ?? "none";
  const key = JSON.stringify([
    page,
    lang,
    reason,
    v?.ruleId,
    v?.breakUntil,
    v?.checklistRequired,
    v?.allowSkip,
    v?.checklist,
    v?.resetAt,
    data.pauseUntil,
    data.pauseCount,
    data.pauseMax,
    data.pauseEnabled,
    data.pinSet,
  ]);
  if (key === publicViewKey) {
    const today = document.getElementById("public-today");
    if (today) today.textContent = duration(data.todayMs, lang);
    const remaining = document.getElementById("public-remaining");
    if (remaining && v?.leftMs != null)
      remaining.textContent = `${tr("remaining")}: ${duration(v.leftMs + 59_999, lang)}`;
    if (reason === "break") {
      activeBreak = v;
      updateBreakClock();
    }
    return;
  }
  publicViewKey = key;
  activeBreak = null;
  activityStage = "";
  checks.clear();
  for (const check of v?.checks ?? []) checks.add(check);
  app.replaceChildren();
  const main = el("main", page === "popup" ? "popup" : "blocked");
  main.append(brand());
  if (page === "popup") {
    main.append(el("p", "muted", tr("intro")));
    const summary = card();
    if (v) summary.append(el("strong", "domain", v.host));
    const today = el("p", "metric", duration(data.todayMs, lang));
    today.id = "public-today";
    summary.append(today, el("small", "muted", tr("today")));
    if (v?.leftMs != null) {
      const remaining = el(
        "p",
        "",
        `${tr("remaining")}: ${duration(v.leftMs + 59_999, lang)}`,
      );
      remaining.id = "public-remaining";
      summary.append(remaining);
    }
    if (reason === "break") {
      summary.append(
        el("p", "", tr("break")),
        button(
          u("openBreak"),
          () => {
            void browser.tabs.create({
              url:
                browser.runtime.getURL("ui/blocked.html") +
                "?url=" +
                encodeURIComponent(currentUrl),
            });
          },
          "button primary wide",
        ),
      );
    }
    main.append(summary);
    if (
      reason === "quota" ||
      (data.pauseUntil > Date.now() &&
        reason !== "break" &&
        reason !== "manual")
    )
      main.append(pauseForm(data));
    main.append(
      button(
        tr("settings"),
        () => {
          void browser.runtime.openOptionsPage();
        },
        "button wide",
      ),
    );
    main.append(
      button(
        u("about"),
        () => {
          void browser.tabs.create({
            url: browser.runtime.getURL("ui/options.html") + "#about",
          });
        },
        "button subtle wide",
      ),
    );
  } else {
    const hero = card();
    hero.classList.add("lock-card");
    hero.append(
      el("div", "break-icon", reason === "break" ? "✦" : "◷"),
      el(
        "h1",
        "",
        reason === "none"
          ? tr("back")
          : tr(
              reason === "manual"
                ? "manual"
                : reason === "quota"
                  ? "quota"
                  : "break",
            ),
      ),
      el("p", "domain muted", v?.host ?? ""),
    );
    if (v)
      hero.append(
        el("p", "", `${tr("used")}: ${duration(data.todayMs, lang)}`),
      );
    if (v?.resetAt && reason === "quota")
      hero.append(
        el(
          "p",
          "",
          `${tr("resetAt")}: ${new Date(v.resetAt).toLocaleString(lang)}`,
        ),
      );
    if (v && reason === "break") {
      const count = el("p", "countdown");
      count.id = "break-countdown";
      count.setAttribute("role", "timer");
      count.setAttribute("aria-live", "off");
      count.setAttribute("aria-label", tr("remaining"));
      const help = el("p", "muted");
      help.id = "break-instructions";
      help.setAttribute("role", "status");
      const activities = el("div", "break-activities");
      activities.id = "break-activities";
      const done = button(
        tr("continue"),
        () => run(() => leaveBreak("breakDone", v)),
        "button primary wide",
      );
      done.id = "finish-break";
      done.disabled = true;
      hero.append(count, help, activities, done);
      activeBreak = v;
      if (v.allowSkip) {
        const skip = button(
          u("skip"),
          () => run(() => leaveBreak("breakSkip", v)),
          "button subtle wide",
        );
        skip.id = "skip-break";
        hero.append(skip);
      }
    }
    if (!v?.blocked)
      hero.append(
        button(
          tr("back"),
          () => {
            if (currentUrl) location.replace(currentUrl);
          },
          "button primary wide",
        ),
      );
    main.append(hero);
    if (
      reason === "quota" ||
      (data.pauseUntil > Date.now() &&
        reason !== "break" &&
        reason !== "manual")
    )
      main.append(pauseForm(data));
    main.append(
      button(
        tr("settings"),
        () => {
          void browser.runtime.openOptionsPage();
        },
        "button subtle",
      ),
    );
  }
  app.append(main);
  updateBreakClock();
}

async function start(): Promise<void> {
  if (page === "options") {
    if (location.hash === "#about") section = "about";
    const data = await request<PublicData>("public");
    setLanguage(data.language);
    try {
      await load();
    } catch (e) {
      if (e instanceof Error && e.message === "AUTH_REQUIRED") unlockView();
      else throw e;
    }
  } else {
    if (page === "popup") {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      currentUrl = tabs[0]?.url ?? "";
      if (currentUrl.startsWith(browser.runtime.getURL("ui/blocked.html")))
        currentUrl = blockedTarget(currentUrl);
    } else currentUrl = blockedTarget(location.href);
    try {
      const url = new URL(currentUrl);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        currentUrl = "";
    } catch {
      currentUrl = "";
    }
    await renderPublic();
    if (page === "blocked") {
      setInterval(() => {
        if (document.visibilityState === "visible") run(renderPublic);
      }, 5000);
      setInterval(updateBreakClock, 250);
      document.addEventListener("visibilitychange", updateBreakClock);
    }
  }
}
run(start);
