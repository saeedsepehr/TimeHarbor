import { By, until } from "selenium-webdriver";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
export async function uxBrowserChecks(driver, base) {
  const checks = [];
  const open = async (
    path = "options.html",
    scenario = "dashboard",
    language = "en",
  ) => {
    await driver.get(
      `${base}preview/ui/${path}?lang=${language}&scenario=${scenario}${path === "blocked.html" ? "&url=" + encodeURIComponent("https://youtube.com/watch?v=demo&list=test") : ""}`,
    );
  };
  await open();
  await driver.wait(until.elementLocated(By.css("tbody .domain")), 10000);
  assert.ok(
    (await driver.findElement(By.css(".page-guide")).getText()).includes(
      "time allowance",
    ),
  );
  await driver
    .findElement(By.css("[data-rule-id=study] .row-actions button"))
    .click();
  await driver.wait(
    until.elementLocated(By.css("[data-editor-for=study]")),
    5000,
  );
  assert.equal(
    await driver
      .findElement(By.css("[data-editor-for=study] textarea"))
      .getAttribute("value"),
    "wikipedia.org",
  );
  assert.equal(
    await driver
      .findElement(By.css(".create-panel textarea"))
      .getAttribute("value"),
    "",
  );
  checks.push(
    "website editing expands below its own row without reusing the add form",
  );
  const profile = await driver.findElement(
    By.css("[data-editor-for=study] select[name=profileId]"),
  );
  await driver.executeScript(
    'arguments[0].value="__new_profile__";arguments[0].dispatchEvent(new Event("change",{bubbles:true}));',
    profile,
  );
  await driver.wait(until.elementLocated(By.css("dialog[open]")), 5000);
  await driver
    .findElement(By.css("dialog input[name=profileName]"))
    .sendKeys("Study routine");
  await driver.executeScript(
    'document.querySelector("dialog form").requestSubmit();',
  );
  await driver.wait(
    async () => !(await driver.findElements(By.css("dialog[open]"))).length,
    5000,
  );
  assert.equal(
    await driver
      .findElement(By.css("[data-editor-for=study] textarea"))
      .getAttribute("value"),
    "wikipedia.org",
  );
  assert.equal(
    await driver
      .findElement(
        By.css("[data-editor-for=study] select[name=profileId] option:checked"),
      )
      .getText(),
    "Study routine",
  );
  checks.push("create break profile from dropdown preserves the website draft");
  await driver.findElement(By.id("copy-launcher")).click();
  await driver.findElement(By.css("[data-action=next-copy]")).click();
  const identical = await driver.findElement(
    By.css("dialog input[value=identical]"),
  );
  assert.equal(await identical.isEnabled(), false);
  assert.equal(
    (await driver.findElements(By.css("dialog input[value=video]"))).length,
    0,
  );
  await driver.findElement(By.css("dialog input[value=aparat]")).click();
  await driver.findElement(By.css("[data-action=next-copy]")).click();
  assert.ok(
    (await driver.findElement(By.css(".review-list")).getText()).includes(
      "aparat.com",
    ),
  );
  await driver.findElement(By.css("[data-action=apply-copy]")).click();
  await driver.wait(
    async () => !(await driver.findElements(By.css("dialog[open]"))).length,
    5000,
  );
  const stored = await driver.executeScript(
    "return window.__timeHarborPreview().config;",
  );
  assert.equal(stored.rules.find((r) => r.id === "aparat").minutes, 60);
  assert.equal(stored.rules.find((r) => r.id === "study").minutes, 120);
  checks.push(
    "copy wizard disables identical destinations and changes only reviewed targets",
  );
  await driver.findElement(By.css("nav button:nth-child(2)")).click();
  await driver.wait(
    until.elementLocated(By.css("[data-profile-id=balanced]")),
    5000,
  );
  await driver
    .findElement(By.css("[data-profile-id=balanced] summary"))
    .click();
  const idle = await driver.findElement(
    By.css("[data-profile-id=balanced] input[name=idleMinutes]"),
  );
  const tip = await driver.executeScript(
    'return arguments[0].closest(".field").querySelector(".info-button");',
    idle,
  );
  await driver.executeScript("arguments[0].focus();", tip);
  assert.ok((await tip.getAttribute("title")).includes("no mouse"));
  await tip.click();
  await driver.wait(until.elementLocated(By.css("dialog[open]")), 5000);
  assert.ok(
    (
      await driver.findElement(By.css("dialog .dialog-body")).getText()
    ).includes("no mouse"),
  );
  await driver.findElement(By.css("dialog .icon-button")).click();
  checks.push(
    "native hover help and keyboard-clickable help dialog explain idle activity without a clipped tooltip",
  );
  assert.ok(
    (
      await driver
        .findElement(By.css("[data-profile-id=balanced] .connected-sites"))
        .getText()
    ).includes("youtube.com"),
  );
  await driver
    .findElement(By.css("[data-profile-id=balanced] .chip-remove"))
    .click();
  await driver.wait(async () => {
    const c = await driver.executeScript(
      "return window.__timeHarborPreview().config;",
    );
    return c.rules[0].profileId === "no-breaks";
  }, 5000);
  const after = await driver.executeScript(
    "return window.__timeHarborPreview().config;",
  );
  assert.equal(after.rules[0].minutes, 60);
  checks.push("profile site disconnection preserves the website allowance");
  await driver.findElement(By.css("nav button:nth-child(4)")).click();
  await driver.wait(until.elementLocated(By.css("input.pin-input")), 5000);
  const pin = await driver.findElement(By.css("input.pin-input"));
  assert.ok((await pin.getRect()).width < 150);
  assert.equal(await pin.getCssValue("text-align"), "center");
  checks.push("PIN input is compact and centered");
  await driver.findElement(By.css("nav button:nth-child(5)")).click();
  await driver.wait(until.elementLocated(By.css(".social-links")), 5000);
  assert.equal(
    (await driver.findElements(By.css(".social-links a"))).length,
    7,
  );
  assert.equal(
    await driver
      .findElement(By.css('a[href="https://www.linkedin.com/in/saeedsepehr"]'))
      .getText(),
    "LinkedIn · Saeed Sepehr",
  );
  await writeFile(
    "outputs/TimeHarbor-about-en.png",
    Buffer.from(await driver.takeScreenshot(), "base64"),
  );
  checks.push(
    "About page shows author note and seven verified contact/project links",
  );
  await open("blocked.html", "break-required");
  await driver.wait(until.elementLocated(By.id("break-countdown")), 5000);
  assert.equal(
    (await driver.findElements(By.css(".break-activities input"))).length,
    0,
  );
  assert.equal((await driver.findElements(By.css(".pause-card"))).length, 0);
  assert.equal((await driver.findElements(By.id("skip-break"))).length, 0);
  const first = await driver.findElement(By.id("break-countdown")).getText();
  await driver.executeScript(
    'window.savedClock=document.getElementById("break-countdown");',
  );
  await driver.sleep(1100);
  assert.notEqual(
    await driver.findElement(By.id("break-countdown")).getText(),
    first,
  );
  await driver.wait(
    until.elementLocated(By.css(".break-activities input")),
    5000,
  );
  assert.equal(
    await driver.findElement(By.id("finish-break")).isEnabled(),
    false,
  );
  for (const item of await driver.findElements(
    By.css(".break-activities input"),
  ))
    await item.click();
  assert.equal(
    await driver.findElement(By.id("finish-break")).isEnabled(),
    true,
  );
  await driver.sleep(1200);
  assert.equal(
    await driver.executeScript(
      'return window.savedClock===document.getElementById("break-countdown");',
    ),
    true,
  );
  checks.push(
    "required break has live seconds, delayed checkboxes, immediate Continue enablement and stable DOM",
  );
  await open("blocked.html", "break-optional");
  await driver.wait(
    until.elementLocated(By.css(".break-activities input")),
    5000,
  );
  assert.equal(
    await driver.findElement(By.css(".break-activities input")).isEnabled(),
    true,
  );
  await driver.findElement(By.css(".break-activities input")).click();
  assert.deepEqual(
    await driver.executeScript("return window.__timeHarborPreview().checks;"),
    [0],
  );
  await driver.wait(
    until.elementIsEnabled(await driver.findElement(By.id("finish-break"))),
    6000,
  );
  checks.push(
    "optional break check-ins work before the timer and do not gate Continue",
  );
  await open("blocked.html", "break-skip");
  await driver.wait(until.elementLocated(By.id("skip-break")), 5000);
  checks.push("skip action is visible only when explicitly enabled");
  await open("blocked.html", "break-skip-quota");
  await driver.wait(until.elementLocated(By.id("skip-break")), 5000);
  const returnLocation = await driver.getCurrentUrl();
  await driver.findElement(By.id("skip-break")).click();
  await driver.wait(until.elementLocated(By.css(".pause-card")), 5000);
  assert.equal(await driver.getCurrentUrl(), returnLocation);
  assert.equal(
    new URL(await driver.getCurrentUrl()).searchParams.get("url"),
    "https://youtube.com/watch?v=demo&list=test",
  );
  checks.push(
    "Skip at quota exhaustion stays on a useful lock page and preserves the full return URL",
  );
  await open("popup.html", "quota", "fa");
  await driver.wait(until.elementLocated(By.css(".pause-card")), 5000);
  assert.ok(
    (await driver.findElement(By.css(".popup")).getText()).includes("وقفه"),
  );
  assert.ok(
    (await driver.findElement(By.css(".popup")).getText()).includes("درباره"),
  );
  await writeFile(
    "outputs/TimeHarbor-popup-fa.png",
    Buffer.from(await driver.takeScreenshot(), "base64"),
  );
  await open("popup.html", "break-required");
  await driver.wait(until.elementLocated(By.css(".popup")), 5000);
  assert.equal((await driver.findElements(By.css(".pause-card"))).length, 0);
  assert.ok(
    (await driver.findElement(By.css(".popup")).getText()).includes(
      "Open break checklist",
    ),
  );
  checks.push(
    "toolbar popup exposes settings/About and quota pause, but uses break access instead of a pause during breaks",
  );
  await open("blocked.html", "break-required", "fa");
  await driver.wait(until.elementLocated(By.css(".activity-reminder")), 5000);
  await writeFile(
    "outputs/TimeHarbor-break-required-fa.png",
    Buffer.from(await driver.takeScreenshot(), "base64"),
  );
  await driver.wait(until.elementLocated(By.css(".activity-checkbox")), 6000);
  await driver.sleep(400);
  await writeFile(
    "outputs/TimeHarbor-break-ready-fa.png",
    Buffer.from(await driver.takeScreenshot(), "base64"),
  );
  await driver.get(base + "preview/reminder.html?lang=fa");
  await driver.wait(
    until.elementLocated(By.css("[data-timeharbor-reminder]")),
    5000,
  );
  await driver.sleep(1300);
  await writeFile(
    "outputs/TimeHarbor-reminder.png",
    Buffer.from(await driver.takeScreenshot(), "base64"),
  );
  const host = await driver.findElement(By.css("[data-timeharbor-reminder]")),
    rect = await host.getRect();
  await driver
    .actions()
    .move({
      x: Math.round(rect.x + rect.width - 38),
      y: Math.round(rect.y + rect.height / 2),
      origin: "viewport",
    })
    .click()
    .perform();
  await driver.wait(
    async () =>
      !(await driver.findElements(By.css("[data-timeharbor-reminder]"))).length,
    3000,
  );
  checks.push(
    "animated in-page reminder can be dismissed with its close button",
  );
  return checks;
}
