import { build } from "esbuild";
import { mkdir, cp, writeFile, readFile } from "node:fs/promises";
import { iconPng } from "./icons.mjs";
const chromium = process.argv.includes("--chromium");
const outdir = chromium ? "dist-chromium" : "dist";
const oauthBroker = process.env.TIMEHARBOR_OAUTH_BROKER ?? "";
if (oauthBroker) {
  const url = new URL(oauthBroker);
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error(
      "TIMEHARBOR_OAUTH_BROKER must be an HTTPS origin with a trailing slash",
    );
}
await mkdir(outdir + "/ui", { recursive: true });
await build({
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    "ui/app": "src/ui.ts",
  },
  outdir,
  bundle: true,
  target: chromium ? "chrome120" : "firefox142",
  define: {
    __CHROMIUM__: JSON.stringify(chromium),
    __OAUTH_BROKER__: JSON.stringify(oauthBroker),
  },
  banner: chromium
    ? { js: "var browser = globalThis.browser || globalThis.chrome;" }
    : {},
  format: "iife",
  minify: false,
  sourcemap: false,
  legalComments: "eof",
});
await cp("public", outdir, { recursive: true });
await mkdir(outdir + "/icons", { recursive: true });
const icons = {};
for (const size of [16, 32, 48, 96, 128]) {
  icons[size] = `icons/${size}.png`;
  await writeFile(`${outdir}/${icons[size]}`, iconPng(size));
}
const manifest = {
  manifest_version: 3,
  name: "TimeHarbor",
  version: JSON.parse(await readFile("package.json", "utf8")).version,
  description:
    "Mindful browsing with private time limits, healthy breaks, PIN controls and local reports.",
  permissions: [
    "storage",
    "tabs",
    "alarms",
    ...(oauthBroker ? ["identity"] : []),
    ...(chromium
      ? ["declarativeNetRequestWithHostAccess"]
      : ["webRequest", "webRequestBlocking"]),
  ],
  host_permissions: ["http://*/*", "https://*/*"],
  background: chromium
    ? { service_worker: "background.js" }
    : { scripts: ["background.js"] },
  action: {
    default_title: "TimeHarbor",
    default_popup: "ui/popup.html",
    default_icon: icons,
  },
  icons,
  options_ui: { page: "ui/options.html", open_in_tab: true },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["content.js"],
      run_at: "document_idle",
    },
  ],
  ...(chromium
    ? {
        minimum_chrome_version: "120",
        web_accessible_resources: [
          {
            resources: ["ui/blocked.html"],
            matches: ["http://*/*", "https://*/*"],
          },
        ],
      }
    : {
        browser_specific_settings: {
          gecko: {
            id: "timeharbor@saeedsepehr.github.io",
            strict_min_version: "142.0",
            data_collection_permissions: {
              required: ["none"],
              ...(oauthBroker
                ? { optional: ["browsingActivity", "authenticationInfo"] }
                : {}),
            },
          },
        },
      }),
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'",
  },
};
await writeFile(
  outdir + "/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `${chromium ? "Chromium" : "Firefox"} extension built in ${outdir}/`,
);
