// Test-only script copied into an isolated, temporary addon. Never shipped in dist/.
void (async () => {
  const checks = [];
  const assert = (condition, text) => {
    if (!condition) throw Error(text);
  };
  const wait = async (predicate, timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await predicate()) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("Timed out waiting for test state");
  };
  const call = (type, extra = {}) =>
    browser.runtime.sendMessage({ type, ...extra });
  const report = async (result) =>
    fetch("__REPORT_URL__", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  try {
    await wait(() => document.querySelector(".nav-item"));
    const home = await browser.tabs.getCurrent();
    assert(document.title === "TimeHarbor — Dashboard", "Dashboard title");
    checks.push("temporary installation and dashboard startup");
    const form = document.querySelector("form");
    form.querySelector("textarea").value = "localhost";
    form.querySelector("[name=minutes]").value = "1";
    form.requestSubmit();
    await wait(
      () =>
        document.querySelector("tbody .domain")?.textContent === "localhost",
    );
    checks.push("real dashboard form creates website rule");
    let result = await call("read");
    assert(result.ok, "Read settings");
    const config = result.data.config;
    config.profiles[0].breakEveryMinutes = 1;
    config.profiles[0].breakMinutes = 1;
    config.profiles[0].allowSkipBreak = true;
    assert(
      (await call("save", { config })).ok,
      "Configure simultaneous break/quota test",
    );
    const tab = await browser.tabs.create({
      url: "__SITE_URL__",
      active: true,
    });
    await new Promise((r) => setTimeout(r, 12000));
    await browser.tabs.update(home.id, { active: true });
    result = await call("read");
    const usage = Object.values(result.data.state.days)
      .flatMap((day) => Object.entries(day))
      .filter(([h]) => h === "localhost")
      .reduce((n, [, v]) => n + v.usedMs, 0);
    assert(usage >= 5000 && usage <= 20000, "Foreground usage: " + usage);
    checks.push("real foreground accounting: " + Math.round(usage) + " ms");
    await new Promise((r) => setTimeout(r, 6000));
    result = await call("read");
    const afterInactive = Object.values(result.data.state.days)
      .flatMap((day) => Object.entries(day))
      .filter(([h]) => h === "localhost")
      .reduce((n, [, v]) => n + v.usedMs, 0);
    assert(
      Math.abs(afterInactive - usage) < 1000,
      "Inactive website must stop immediately, without idle grace",
    );
    checks.push(
      "background tab stops counting immediately, without the five-minute idle allowance",
    );
    [...document.querySelectorAll(".nav-item")]
      .find((b) => b.textContent === "Settings")
      .click();
    await wait(() => document.querySelector("input[type=password]"));
    const settings = document.querySelector("form");
    settings.querySelector("select").value = "fa";
    settings.querySelector("input[type=password]").value = "1234";
    settings.requestSubmit();
    await wait(() => document.documentElement.dir === "rtl");
    checks.push(
      "real settings form changes language and protects settings with PIN",
    );
    result = await call("read");
    assert(
      !result.ok && result.error === "AUTH_REQUIRED",
      "Settings must reject missing session",
    );
    checks.push("missing session rejected");
    result = await call("unlock", { pin: "0000" });
    assert(!result.ok, "Wrong PIN accepted");
    result = await call("unlock", { pin: "1234" });
    assert(result.ok, "Correct PIN rejected");
    const token = result.data.token;
    checks.push("wrong PIN rejected and correct PIN accepted");
    result = await call("importSettings", { config });
    assert(
      !result.ok && result.error === "AUTH_REQUIRED",
      "Import without session must be rejected",
    );
    const imported = structuredClone(config);
    imported.language = "fa";
    imported.languageMode = "manual";
    imported.rules[0].id = "foreign-rule-id";
    const fileInput = document.querySelector(".transfer-card input[type=file]");
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(
        [
          JSON.stringify({
            format: "timeharbor-settings",
            version: 1,
            config: imported,
          }),
        ],
        "settings.json",
        { type: "application/json" },
      ),
    );
    fileInput.files = transfer.files;
    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(() => document.querySelector("dialog[open] .actions .primary"));
    document.querySelector("dialog[open] .actions .primary").click();
    await wait(() => !document.querySelector("dialog[open]"));
    result = await call("unlock", { pin: "1234" });
    assert(result.ok, "Import must preserve local PIN");
    result = await call("read", { token });
    assert(
      result.data.config.rules[0].id === config.rules[0].id,
      "Import must retain destination identity",
    );
    assert(
      result.data.state.sites[config.rules[0].id].usedMs >= 5000,
      "Import must retain quota usage",
    );
    checks.push(
      "authorized settings import preserves PIN and quota; missing-session import rejected",
    );
    if (browser.runtime.getURL("").startsWith("chrome-extension:"))
      document.querySelector(".transfer-card button").click();
    result = await call("pause", {
      pin: "1234",
      minutes: 5,
      url: "__SITE_URL__",
    });
    assert(!result.ok, "Early quota pause should not be available");
    await browser.tabs.update(tab.id, { active: true });
    await new Promise((r) => setTimeout(r, 52000));
    await browser.tabs.update(home.id, { active: true });
    result = await call("public", { url: "__SITE_URL__" });
    assert(
      result.data.current?.reason === "break",
      "Simultaneous quota/break must show break first",
    );
    const breakUntil = result.data.current.breakUntil;
    result = await call("breakSkip", {
      ruleId: config.rules[0].id,
      breakUntil,
    });
    assert(result.ok, "Allowed skip should complete the break");
    result = await call("public", { url: "__SITE_URL__" });
    assert(
      result.data.current?.reason === "quota",
      "Actual quota should expire after one minute",
    );
    checks.push("real quota expiry and rejection of pre-quota pauses");
    checks.push(
      "simultaneous break and quota expiry keeps the quota locked after skipping",
    );
    result = await call("pause", {
      pin: "1234",
      minutes: 5,
      url: "__SITE_URL__",
    });
    assert(result.ok && result.data.pauseUntil > Date.now(), "Pause failed");
    result = await call("resume");
    assert(result.ok, "Resume failed");
    checks.push("PIN-protected pause and resume");
    config.language = "fa";
    config.languageMode = "manual";
    config.rules[0].mode = "block";
    result = await call("save", { config, token });
    assert(result.ok, "Block save failed");
    await browser.tabs.update(tab.id, { url: "__SITE_URL__" });
    await wait(async () => {
      const current = await browser.tabs.get(tab.id);
      return current.url?.includes("/ui/blocked.html");
    });
    checks.push("network-level manual blocking redirects navigation");
    document.querySelector("nav button:nth-child(5)").click();
    await wait(() => document.querySelector(".social-links"));
    assert(
      document.querySelectorAll(".social-links a").length === 7,
      "About contact links missing",
    );
    checks.push(
      "author note and all seven contact/project links are available",
    );
    await report({ status: "PASS", checks });
  } catch (error) {
    await report({ status: "FAIL", checks, error: String(error) });
  }
})();
