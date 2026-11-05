import { build } from "esbuild";
import { mkdir, cp, writeFile, readFile } from "node:fs/promises";
await mkdir("dist/ui", { recursive: true });
await build({
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    "ui/app": "src/ui.ts",
  },
  outdir: "dist",
  bundle: true,
  target: "firefox140",
  format: "iife",
  minify: false,
  sourcemap: false,
  legalComments: "eof",
});
await cp("public", "dist", { recursive: true });
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
    "webRequest",
    "webRequestBlocking",
  ],
  host_permissions: ["http://*/*", "https://*/*"],
  background: { scripts: ["background.js"] },
  action: { default_popup: "ui/popup.html", default_icon: { 48: "icon.svg" } },
  icons: { 48: "icon.svg", 96: "icon.svg" },
  options_ui: { page: "ui/options.html", open_in_tab: true },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["content.js"],
      run_at: "document_idle",
    },
  ],
  browser_specific_settings: {
    gecko: {
      id: "timeharbor@saeedsepehr.github.io",
      strict_min_version: "142.0",
      data_collection_permissions: { required: ["none"] },
    },
  },
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none'",
  },
};
await writeFile("dist/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log("Firefox extension built in dist/");
