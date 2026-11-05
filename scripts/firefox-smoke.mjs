import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { createServer } from "node:http";
import { writeFile, readFile, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { openSync } from "node:fs";
import { previewScript } from "./preview-transport.mjs";
import { uxBrowserChecks } from "./ux-browser-checks.mjs";
import { defaultConfig, freshState, dayKey } from "../src/core.ts";
const uuid = "58c9de2a-1717-4d49-a1cf-8b3f6af45a21",
  id = "timeharbor@saeedsepehr.github.io";
let finish;
const outcome = new Promise((r) => {
  finish = r;
});
const config = defaultConfig();
config.rules = [
  {
    id: "video",
    host: "youtube.com",
    mode: "limit",
    minutes: 60,
    reset: "period",
    hours: 6,
    profileId: "balanced",
  },
  {
    id: "aparat",
    host: "aparat.com",
    mode: "limit",
    minutes: 45,
    reset: "daily",
    hours: 24,
    profileId: "balanced",
  },
  {
    id: "study",
    host: "wikipedia.org",
    mode: "limit",
    minutes: 120,
    reset: "daily",
    hours: 24,
    profileId: "balanced",
  },
];
const state = freshState();
state.days[dayKey(Date.now())] = {
  "youtube.com": { usedMs: 1_020_000, pausedMs: 0 },
  "aparat.com": { usedMs: 480_000, pausedMs: 120_000 },
};
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/result") {
      let body = "";
      for await (const chunk of req) body += chunk;
      finish(JSON.parse(body));
      res.end("ok");
      return;
    }
    if (req.url?.startsWith("/preview")) {
      const u = new URL(req.url, "http://localhost");
      const resource = u.pathname.replace("/preview", "");
      if (resource === "/mock.js") {
        res.setHeader("Content-Type", "application/javascript");
        res.end(
          previewScript(
            config,
            state,
            u.searchParams.get("lang") ?? "en",
            u.searchParams.get("scenario") ?? "dashboard",
          ),
        );
        return;
      }
      if (resource === "/reminder.html") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          '<!doctype html><html><head><meta charset="utf-8"><script src="/preview/mock.js?lang=fa&scenario=reminder"></script><script src="/preview/content.js" defer></script></head><body style="background:#f5f6fc;font:20px system-ui;color:#262b49;margin:0;min-height:95vh;display:grid;place-items:center"><p>TimeHarbor · پیش‌نمایش یادآوری مصرف</p></body></html>',
        );
        return;
      }
      const file = resource || "/ui/options.html";
      if (
        ![
          "/ui/options.html",
          "/ui/blocked.html",
          "/content.js",
          "/ui/app.js",
          "/ui/app.css",
          "/icon.svg",
        ].includes(file)
      ) {
        res.statusCode = 404;
        res.end();
        return;
      }
      let contents = await readFile(path.join("dist", file));
      if (file.endsWith(".html"))
        contents = Buffer.from(
          contents
            .toString()
            .replace(
              '<script src="app.js"',
              '<script src="/preview/mock.js?lang=' +
                (u.searchParams.get("lang") ?? "en") +
                "&scenario=" +
                (u.searchParams.get("scenario") ?? "dashboard") +
                '"></script><script src="app.js"',
            ),
        );
      res.setHeader(
        "Content-Type",
        file.endsWith(".html")
          ? "text/html"
          : file.endsWith(".js")
            ? "application/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : "image/svg+xml",
      );
      res.end(contents);
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      "<!doctype html><title>TimeHarbor local fixture</title><button>Activity fixture</button>",
    );
  } catch (error) {
    res.statusCode = 500;
    res.end(String(error));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port,
  site = "http://localhost:" + port + "/";
const testDir = path.resolve("work/firefox-smoke-extension");
await mkdir(testDir, { recursive: true });
await cp("dist", testDir, { recursive: true });
let html = await readFile(path.join(testDir, "ui/options.html"), "utf8");
html = html.replace("</head>", '<script src="smoke.js" defer></script></head>');
await writeFile(path.join(testDir, "ui/options.html"), html);
let harness = await readFile("scripts/firefox-harness.js", "utf8");
harness = harness
  .replaceAll("__SITE_URL__", site)
  .replaceAll("__REPORT_URL__", site + "result");
await writeFile(path.join(testDir, "ui/smoke.js"), harness);
let driver, timer;
try {
  await mkdir("work/firefox-profiles", { recursive: true });
  const log = openSync("work/geckodriver.log", "w");
  const service = new firefox.ServiceBuilder()
    .addArguments("--profile-root", path.resolve("work/firefox-profiles"))
    .enableVerboseLogging()
    .setStdio(["ignore", log, log]);
  const options = new firefox.Options()
    .addArguments("-headless")
    .setPreference(
      "extensions.webextensions.uuids",
      JSON.stringify({ [id]: uuid }),
    );
  driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxService(service)
    .setFirefoxOptions(options)
    .build();
  console.log("Isolated Firefox session ready");
  await driver.manage().window().setRect({ width: 1280, height: 960 });
  await driver.installAddon(testDir, true);
  console.log("Temporary extension installed; running in-extension checks");
  const result = await Promise.race([
    outcome,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Error("Extension smoke timed out")),
        110000,
      );
    }),
  ]);
  clearTimeout(timer);
  if (result.status !== "PASS") throw Error(JSON.stringify(result));
  const capabilities = await driver.getCapabilities();
  const report = {
    ...result,
    browser: "Firefox",
    version: capabilities.get("browserVersion"),
    platform: capabilities.get("platformName"),
  };
  console.log("Real extension checks passed:", JSON.stringify(result.checks));
  await driver.quit();
  driver = undefined;
  driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxService(service)
    .setFirefoxOptions(options)
    .build();
  await driver.manage().window().setRect({ width: 1280, height: 960 });
  for (const language of ["en", "fa"]) {
    await driver.get(site + "preview/ui/options.html?lang=" + language);
    await driver.wait(until.elementLocated(By.css("tbody .domain")), 10000);
    await writeFile(
      "outputs/TimeHarbor-dashboard-" + language + ".png",
      Buffer.from(await driver.takeScreenshot(), "base64"),
    );
  }
  report.checks.push(
    "English and Persian UI visual previews rendered in Firefox",
  );
  report.checks.push(...(await uxBrowserChecks(driver, site)));
  await writeFile(
    "outputs/firefox-smoke.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  if (driver) await driver.quit();
  await new Promise((r) => server.close(r));
}
