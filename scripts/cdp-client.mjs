import { spawn } from "node:child_process";
import { readFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
export async function launchChromium(name, root) {
  const candidates =
    name === "edge"
      ? [
          process.env.TIMEHARBOR_EDGE_BINARY,
          "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
          "/usr/bin/microsoft-edge",
        ]
      : [
          process.env.TIMEHARBOR_CHROME_BINARY,
          "C:/Program Files/Google/Chrome/Application/chrome.exe",
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/usr/bin/google-chrome",
          "/usr/bin/chromium",
        ];
  let binary;
  for (const candidate of candidates.filter(Boolean)) {
    try {
      await access(candidate);
      binary = candidate;
      break;
    } catch {
      /* Try next installed browser. */
    }
  }
  if (!binary)
    throw Error(
      "No installed " +
        name +
        " binary; set TIMEHARBOR_CHROME_BINARY or TIMEHARBOR_EDGE_BINARY",
    );
  const profile = path.join(root, "profile");
  await mkdir(profile, { recursive: true });
  const child = spawn(
    binary,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      "--enable-unsafe-extension-debugging",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1280,960",
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  child.on("error", () => {});
  let portInfo;
  for (let i = 0; i < 150; i++) {
    try {
      portInfo = await readFile(
        path.join(profile, "DevToolsActivePort"),
        "utf8",
      );
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!portInfo) {
    child.kill();
    throw Error("Isolated browser debugging endpoint did not start");
  }
  const [port, endpoint] = portInfo.trim().split(/\r?\n/);
  const socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer);
    pending.delete(message.id);
    if (message.error) item.reject(Error(message.error.message));
    else item.resolve(message.result);
  });
  const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error("CDP timeout: " + method));
      }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  return {
    call,
    async close() {
      try {
        await call("Browser.close");
      } catch {
        /* Browser may already be closed. */
      }
      socket.close();
      if (child.exitCode === null) child.kill();
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error("Browser closed"));
      }
      pending.clear();
    },
  };
}
