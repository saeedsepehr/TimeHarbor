import { createServer } from "node:http";
import { writeFile, mkdir, cp, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { launchChromium } from "./cdp-client.mjs";
import { blockedTarget } from "../src/network-policy.ts";
const browserName = process.argv.includes("--edge") ? "edge" : "chrome";
const root = path.resolve(`work/${browserName}-smoke-${Date.now()}`);
const extension = path.join(root, "extension");
await mkdir(root, { recursive: true });
await cp("dist-chromium", extension, { recursive: true });
let finish;
const outcome = new Promise((resolve) => {
  finish = resolve;
});
const server = createServer(async (req, res) => {
  if (req.url === "/result") {
    let body = "";
    for await (const data of req) body += data;
    finish(JSON.parse(body));
    res.end("ok");
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end(
    "<!doctype html><title>TimeHarbor local fixture</title><button>Local activity fixture</button>",
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const site = `http://localhost:${server.address().port}/`;
let html = await readFile(path.join(extension, "ui/options.html"), "utf8");
html = html.replace("</head>", '<script src="smoke.js" defer></script></head>');
await writeFile(path.join(extension, "ui/options.html"), html);
const harness = (await readFile("scripts/firefox-harness.js", "utf8"))
  .replaceAll("__SITE_URL__", site)
  .replaceAll("__REPORT_URL__", site + "result");
await writeFile(path.join(extension, "ui/smoke.js"), harness);
let client, timer;
const wait = async (predicate, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await predicate();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error("CDP browser check timed out");
};
try {
  client = await launchChromium(browserName, root);
  const version = await client.call("Browser.getVersion");
  await client.call("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: root,
  });
  const installed = await client.call("Extensions.loadUnpacked", {
    path: extension,
  });
  const origin = `chrome-extension://${installed.id}/`;
  console.log(
    version.product +
      " isolated production bundle loaded; in-extension checks running",
  );
  const result = await Promise.race([
    outcome,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(Error("Extension smoke timed out")),
        115000,
      );
    }),
  ]);
  clearTimeout(timer);
  assert.equal(result.status, "PASS", JSON.stringify(result));
  console.log("Real extension checks passed: " + JSON.stringify(result.checks));
  const targets = (await client.call("Target.getTargets")).targetInfos;
  const about = targets.find(
    (t) => t.type === "page" && t.url.startsWith(origin + "ui/options.html"),
  );
  if (about) {
    const attached = await client.call("Target.attachToTarget", {
      targetId: about.targetId,
      flatten: true,
    });
    const screenshot = await client.call(
      "Page.captureScreenshot",
      { format: "png" },
      attached.sessionId,
    );
    await writeFile(
      `outputs/TimeHarbor-about-${browserName}.png`,
      Buffer.from(screenshot.data, "base64"),
    );
  }
  for (const t of targets.filter(
    (t) => t.type === "page" && t.url.startsWith(origin),
  ))
    await client.call("Target.closeTarget", { targetId: t.targetId });
  const worker = targets.find(
    (t) => t.type === "service_worker" && t.url.startsWith(origin),
  );
  assert.ok(worker, "No extension service worker found");
  await client.call("Target.closeTarget", { targetId: worker.targetId });
  const returnUrl = site + "watch?a=1&b=2";
  const created = await client.call("Target.createTarget", { url: returnUrl });
  const blocked = await wait(async () => {
    const t = (await client.call("Target.getTargets")).targetInfos.find(
      (t) => t.targetId === created.targetId,
    );
    return t?.url.includes("/ui/blocked.html") ? t : null;
  });
  assert.equal(blockedTarget(blocked.url), returnUrl);
  const session = await client.call("Target.attachToTarget", {
    targetId: created.targetId,
    flatten: true,
  });
  await wait(async () => {
    const result = await client.call(
      "Runtime.evaluate",
      {
        expression: 'document.querySelector(".lock-card h1")?.textContent',
        returnByValue: true,
      },
      session.sessionId,
    );
    return result.result?.value;
  });
  result.checks.push(
    "dynamic navigation rules survive worker termination, preserve full return URL and wake the worker from the lock page",
  );
  const tab = (
    await client.call("Target.getTargets", {
      filter: [{ type: "tab", exclude: false }, { exclude: true }],
    })
  ).targetInfos.find((t) => t.url === blocked.url && t.embedderData);
  assert.ok(tab, "Native browser tab target not found");
  await client.call("Extensions.triggerAction", {
    id: installed.id,
    targetId: tab.targetId,
  });
  const popup = await wait(async () =>
    (await client.call("Target.getTargets")).targetInfos.find(
      (t) => t.url === origin + "ui/popup.html",
    ),
  );
  const popupSession = await client.call("Target.attachToTarget", {
    targetId: popup.targetId,
    flatten: true,
  });
  const popupText = await wait(
    async () =>
      (
        await client.call(
          "Runtime.evaluate",
          {
            expression: 'document.querySelector(".popup")?.innerText',
            returnByValue: true,
          },
          popupSession.sessionId,
        )
      ).result?.value,
  );
  assert.ok(popupText.includes("تنظیمات") && popupText.includes("درباره"));
  const shot = await client.call(
    "Page.captureScreenshot",
    { format: "png" },
    popupSession.sessionId,
  );
  await writeFile(
    `outputs/TimeHarbor-toolbar-${browserName}.png`,
    Buffer.from(shot.data, "base64"),
  );
  result.checks.push(
    "native toolbar action opens the popup with settings and About shortcuts",
  );
  const files = await readdir(root);
  assert.ok(
    files.some(
      (f) => f.startsWith("timeharbor-settings-") && f.endsWith(".json"),
    ),
    "Settings download was not created",
  );
  result.checks.push("settings export creates a real JSON download");
  const report = {
    ...result,
    browser: browserName,
    version: version.product,
    platform: process.platform,
  };
  await writeFile(
    `outputs/${browserName}-smoke.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  if (client) await client.close();
  await new Promise((r) => server.close(r));
}
