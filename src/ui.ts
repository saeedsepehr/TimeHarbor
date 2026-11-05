import { dayKey, normalizeHost, PAUSE_MINUTES } from "./core.ts";
import type { Config, Language, Rule, State, Verdict } from "./core.ts";
import { duration, languageNames, t } from "./i18n.ts";

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
let section: "sites" | "profiles" | "reports" | "settings" = "sites";
let currentUrl = "",
  editingRule: string | null = null,
  editingProfile: string | null = null;
const selected = new Set<string>(),
  checks = new Set<number>();
type Word = Parameters<typeof t>[0];
const tr = (key: Word): string => t(key, lang);
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
function field(label: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = el("label", "field");
  wrapper.append(el("span", "label", label), control);
  return wrapper;
}
function toggle(
  label: string,
  checked: boolean,
): { node: HTMLLabelElement; control: HTMLInputElement } {
  const control = input("", "checkbox");
  control.checked = checked;
  const node = el("label", "toggle");
  node.append(control, el("span", "", label));
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
    el("div", "eyebrow", "YOUR TIME, WITH INTENTION"),
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
async function commit(next: Config, newPin?: string): Promise<void> {
  const result = await request<{ token: string }>("save", {
    config: next,
    ...(newPin ? { newPin } : {}),
  });
  token = result.token;
  sessionStorage.setItem("token", token);
  await load();
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
  const data = await request<{ config: Config; state: State }>("read");
  config = data.config;
  state = data.state;
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
  app.replaceChildren();
  const shell = el("div", "shell"),
    sidebar = el("aside", "sidebar");
  sidebar.append(brand(), el("p", "tagline", tr("intro")));
  const nav = el("nav");
  nav.setAttribute("aria-label", tr("settings"));
  for (const key of ["sites", "profiles", "reports", "settings"] as const) {
    const b = button(
      tr(key),
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
  main.append(heading(tr(section), tr("intro")));
  const today = Object.values(state.days[dayKey(Date.now())] ?? {}).reduce(
    (n, v) => n + v.usedMs,
    0,
  );
  const stats = el("div", "stats");
  for (const [label, value] of [
    [tr("today"), duration(today, lang)],
    [tr("sites"), String(config.rules.length)],
    [tr("profiles"), String(config.profiles.length)],
  ]) {
    const s = el("div", "stat");
    s.append(el("span", "muted", label), el("strong", "", value));
    stats.append(s);
  }
  main.append(stats);
  if (section === "sites") sitesView(main);
  else if (section === "profiles") profilesView(main);
  else if (section === "reports") reportsView(main);
  else settingsView(main);
  shell.append(sidebar, main);
  app.append(shell);
}
function sitesView(main: HTMLElement): void {
  const editor = card(),
    f = el("form", "stack"),
    r = config.rules.find((r) => r.id === editingRule);
  editor.append(el("h2", "", r ? tr("edit") : tr("add")));
  const domains = el("textarea");
  domains.rows = 2;
  domains.placeholder = "youtube.com\naparat.com";
  domains.required = true;
  domains.value = r?.host ?? "";
  domains.dir = "ltr";
  const mode = select(
    [
      ["limit", tr("limit")],
      ["block", tr("block")],
    ],
    r?.mode ?? "limit",
  );
  const minutes = numeric(r?.minutes ?? 60),
    reset = select(
      [
        ["daily", tr("daily")],
        ["period", tr("period")],
      ],
      r?.reset ?? "period",
    );
  const hours = numeric(r?.hours ?? 6, 1, 168),
    profile = select(
      config.profiles.map((p) => [p.id, p.name]),
      r?.profileId ?? config.profiles[0]!.id,
    );
  const grid = el("div", "form-grid");
  grid.append(
    field(tr("limit"), mode),
    field(tr("budget") + " · " + tr("minutes"), minutes),
    field(tr("resetAt"), reset),
    field(tr("window"), hours),
    field(tr("profile"), profile),
  );
  f.append(field(tr("website"), domains), grid);
  const actions = el("div", "actions"),
    save = el("button", "button primary", r ? tr("save") : tr("add"));
  save.type = "submit";
  actions.append(save);
  if (r)
    actions.append(
      button(
        "×",
        () => {
          editingRule = null;
          renderOptions();
        },
        "button subtle",
      ),
    );
  f.append(actions);
  editor.append(f);
  main.append(editor);
  formSubmit(f, async () => {
    const next = structuredClone(config);
    const hosts = domains.value
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normalizeHost);
    if (!hosts.length) throw Error("Enter a website");
    if (r && hosts.length !== 1) throw Error("Edit one website at a time");
    for (const host of hosts) {
      if (next.rules.some((other) => other.host === host && other.id !== r?.id))
        throw Error("Website already exists: " + host);
      const rule: Rule = {
        id: r?.id ?? crypto.randomUUID(),
        host,
        mode: mode.value as Rule["mode"],
        minutes: Number(minutes.value),
        reset: reset.value as Rule["reset"],
        hours: Number(hours.value),
        profileId: profile.value,
      };
      if (r)
        next.rules = next.rules.map((old) => (old.id === r.id ? rule : old));
      else next.rules.push(rule);
    }
    editingRule = null;
    await commit(next);
  });
  const list = card();
  list.append(el("h2", "", tr("sites")));
  if (config.rules.length) {
    const toolbar = el("div", "actions");
    const source = select(
      config.rules.map((r) => [r.id, r.host]),
      config.rules[0]!.id,
    );
    source.setAttribute("aria-label", tr("source"));
    toolbar.append(
      field(tr("source"), source),
      button(tr("copy"), () => {
        const template = config.rules.find((r) => r.id === source.value);
        if (!template || !selected.size) return;
        withChange((next) => {
          next.rules = next.rules.map((r) =>
            selected.has(r.id) ? { ...template, id: r.id, host: r.host } : r,
          );
        });
      }),
    );
    list.append(toolbar);
    const table = el("table"),
      head = el("thead"),
      hr = el("tr");
    for (const label of [
      tr("select"),
      tr("website"),
      tr("budget"),
      tr("profile"),
      tr("edit"),
    ])
      hr.append(el("th", "", label));
    head.append(hr);
    table.append(head);
    const body = el("tbody");
    for (const rule of config.rules) {
      const row = el("tr"),
        check = input("", "checkbox");
      check.checked = selected.has(rule.id);
      check.setAttribute("aria-label", tr("select") + " " + rule.host);
      check.addEventListener("change", () => {
        if (check.checked) selected.add(rule.id);
        else selected.delete(rule.id);
      });
      const c = el("td");
      c.append(check);
      const host = el("td", "domain", rule.host),
        budget = el(
          "td",
          "",
          rule.mode === "block"
            ? tr("block")
            : `${rule.minutes} ${tr("minutes")} / ${rule.reset === "daily" ? tr("daily") : `${rule.hours}h`}`,
        ),
        p = el(
          "td",
          "",
          config.profiles.find((p) => p.id === rule.profileId)?.name ?? "",
        );
      const a = el("td", "row-actions");
      a.append(
        button(
          tr("edit"),
          () => {
            editingRule = rule.id;
            renderOptions();
          },
          "button small",
        ),
        button(
          tr("delete"),
          () => {
            withChange((next) => {
              next.rules = next.rules.filter((r) => r.id !== rule.id);
            });
          },
          "button small danger",
        ),
      );
      row.append(c, host, budget, p, a);
      body.append(row);
    }
    table.append(body);
    const scroll = el("div", "table-scroll");
    scroll.append(table);
    list.append(scroll);
  } else list.append(el("p", "empty", tr("noData")));
  main.append(list);
}
function profilesView(main: HTMLElement): void {
  const p = config.profiles.find((p) => p.id === editingProfile),
    box = card(),
    f = el("form", "stack");
  box.append(el("h2", "", tr("profile")));
  const name = input(p?.name ?? "");
  name.required = true;
  name.maxLength = 80;
  const every = numeric(p?.breakEveryMinutes ?? 30, 0),
    length = numeric(p?.breakMinutes ?? 5, 1, 240),
    scope = select(
      [
        ["site", tr("siteOnly")],
        ["all", tr("allSites")],
      ],
      p?.scope ?? "site",
    );
  const idle = numeric(p?.idleMinutes ?? 5, 1, 60),
    reminder = numeric(p?.reminderMinutes ?? 10, 1, 120),
    required = toggle(tr("required"), p?.required ?? false),
    background = toggle(tr("backgroundMedia"), p?.backgroundMedia ?? true);
  const checklist = el("textarea");
  checklist.rows = 3;
  checklist.value = (
    p?.checklist ?? ["Drink water", "Take a walk", "Stretch"]
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
  f.append(
    grid,
    field(tr("checklist"), checklist),
    required.node,
    background.node,
  );
  const save = el("button", "button primary", tr("save"));
  save.type = "submit";
  f.append(save);
  box.append(f);
  main.append(box);
  formSubmit(f, async () => {
    const next = structuredClone(config);
    const profile = {
      id: p?.id ?? crypto.randomUUID(),
      name: name.value.trim(),
      breakEveryMinutes: Number(every.value),
      breakMinutes: Number(length.value),
      scope: scope.value as "site" | "all",
      required: required.control.checked,
      checklist: checklist.value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      backgroundMedia: background.control.checked,
      idleMinutes: Number(idle.value),
      reminderMinutes: Number(reminder.value),
    };
    if (p)
      next.profiles = next.profiles.map((old) =>
        old.id === p.id ? profile : old,
      );
    else next.profiles.push(profile);
    editingProfile = null;
    await commit(next);
  });
  const cards = el("div", "profile-grid");
  for (const profile of config.profiles) {
    const c = card();
    c.append(
      el("div", "eyebrow", tr("profile")),
      el("h2", "", profile.name),
      el(
        "p",
        "muted",
        `${profile.breakEveryMinutes} ${tr("minutes")} → ${profile.breakMinutes} ${tr("minutes")}`,
      ),
      el("p", "", profile.checklist.join(" · ")),
    );
    const actions = el("div", "actions");
    actions.append(
      button(
        tr("edit"),
        () => {
          editingProfile = profile.id;
          renderOptions();
        },
        "button small",
      ),
    );
    const remove = button(
      tr("delete"),
      () =>
        withChange((next) => {
          if (next.rules.some((r) => r.profileId === profile.id))
            throw Error("This profile is used by a website");
          if (next.profiles.length === 1)
            throw Error("Keep at least one profile");
          next.profiles = next.profiles.filter((p) => p.id !== profile.id);
        }),
      "button small danger",
    );
    actions.append(remove);
    c.append(actions);
    cards.append(c);
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
    language = select(Object.entries(languageNames), config.language),
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
            checklist: p.checklist.length
              ? p.checklist
              : ["Drink water", "Take a walk", "Stretch"],
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
    next.language = language.value as Language;
    next.reportScope = scope.value as Config["reportScope"];
    next.retentionDays = Number(retention.value);
    next.pauseEnabled = pause.control.checked;
    next.pauseMaxPerDay = Number(max.value);
    await commit(next, newPin.value);
  });
  box.append(f);
  main.append(box);
}
function throwError(text: string): void {
  announce(text, true);
}
function pauseForm(data: PublicData): HTMLElement {
  const box = card();
  box.append(el("h2", "", tr("pause")));
  if (data.pauseUntil > Date.now()) {
    box.append(
      el("p", "muted", new Date(data.pauseUntil).toLocaleTimeString(lang)),
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
  const f = el("form", "stack"),
    p = pinInput(),
    time = select(
      PAUSE_MINUTES.map((n) => [String(n), `${n} ${tr("minutes")}`]),
      "15",
    );
  p.required = true;
  f.append(field(tr("minutes"), time), field(tr("pin"), p));
  const submit = el("button", "button primary", tr("pause"));
  submit.type = "submit";
  submit.disabled =
    !data.pauseEnabled || !data.pinSet || data.pauseCount >= data.pauseMax;
  f.append(
    submit,
    el("small", "muted", `${data.pauseCount} / ${data.pauseMax}`),
  );
  formSubmit(f, async () => {
    await request("pause", {
      pin: p.value,
      minutes: Number(time.value),
      url: currentUrl,
    });
    p.value = "";
    await renderPublic();
  });
  box.append(f);
  return box;
}
async function renderPublic(): Promise<void> {
  const focusedId = document.activeElement?.id;
  const data = await request<PublicData>("public", { url: currentUrl });
  setLanguage(data.language);
  app.replaceChildren();
  const main = el("main", page === "popup" ? "popup" : "blocked");
  main.append(brand());
  if (page === "popup") {
    main.append(el("p", "muted", tr("intro")));
    const summary = card();
    if (data.current) summary.append(el("strong", "domain", data.current.host));
    summary.append(
      el("p", "metric", duration(data.todayMs, lang)),
      el("small", "muted", tr("today")),
    );
    if (data.current?.leftMs != null)
      summary.append(
        el(
          "p",
          "",
          `${tr("remaining")}: ${duration(data.current.leftMs + 59_999, lang)}`,
        ),
      );
    main.append(
      summary,
      pauseForm(data),
      button(
        tr("settings"),
        () => {
          void browser.runtime.openOptionsPage();
        },
        "button wide",
      ),
    );
  } else {
    const v = data.current,
      reason = v?.reason ?? "none",
      hero = card();
    hero.append(
      el("div", "break-icon", reason === "break" ? "☘" : "◷"),
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
    if (v) {
      hero.append(
        el("p", "", `${tr("used")}: ${duration(data.todayMs, lang)}`),
      );
      if (v.resetAt && reason === "quota")
        hero.append(
          el(
            "p",
            "",
            `${tr("resetAt")}: ${new Date(v.resetAt).toLocaleString(lang)}`,
          ),
        );
      if (reason === "break") {
        const left = Math.max(0, Math.ceil((v.breakUntil - Date.now()) / 1000)),
          count = el(
            "p",
            "countdown",
            `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`,
          );
        hero.append(count);
        for (const [i, label] of v.checklist.entries()) {
          const c = toggle(label, checks.has(i));
          c.control.id = "break-check-" + i;
          c.control.disabled = left > 0;
          c.control.addEventListener("change", () => {
            if (c.control.checked) checks.add(i);
            else checks.delete(i);
          });
          hero.append(c.node);
        }
        const done = button(
          tr("continue"),
          () =>
            run(async () => {
              await request("breakDone", {
                ruleId: v.ruleId,
                checks: [...checks],
              });
              location.replace(currentUrl);
            }),
          "button primary wide",
        );
        done.disabled =
          left > 0 || (v.needsChecklist && checks.size < v.checklist.length);
        hero.append(done);
      }
    }
    if (!v?.blocked)
      hero.append(
        button(
          tr("back"),
          () => {
            location.replace(currentUrl);
          },
          "button primary wide",
        ),
      );
    main.append(
      hero,
      pauseForm(data),
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
  if (focusedId) document.getElementById(focusedId)?.focus();
}
async function start(): Promise<void> {
  if (page === "options") {
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
        currentUrl = new URL(currentUrl).searchParams.get("url") ?? "";
    } else currentUrl = new URL(location.href).searchParams.get("url") ?? "";
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
    if (page === "blocked")
      setInterval(() => {
        if (
          document.visibilityState === "visible" &&
          !document.activeElement?.closest("form")
        )
          run(renderPublic);
      }, 5000);
  }
}
run(start);
