let interacted = true,
  lastNotice = 0;
for (const event of [
  "pointerdown",
  "pointermove",
  "keydown",
  "scroll",
  "wheel",
])
  document.addEventListener(
    event,
    (e) => {
      if (e.isTrusted) interacted = true;
    },
    { capture: true, passive: true },
  );
function playing(): boolean {
  return [...document.querySelectorAll<HTMLMediaElement>("video,audio")].some(
    (media) => !media.paused && !media.ended && media.readyState >= 2,
  );
}
function notice(text: string): void {
  if (Date.now() - lastNotice < 30_000) return;
  lastNotice = Date.now();
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:340px";
  const shadow = host.attachShadow({ mode: "closed" }),
    box = document.createElement("div");
  box.style.cssText =
    "font:14px/1.6 system-ui,sans-serif;background:#142f31;color:#fff;padding:16px 20px;border-radius:16px;box-shadow:0 10px 40px #0003;white-space:pre-line";
  box.textContent = text;
  box.setAttribute("role", "status");
  shadow.append(box);
  document.documentElement.append(host);
  setTimeout(() => host.remove(), 7000);
}
async function heartbeat(): Promise<void> {
  const media = playing();
  if (document.visibilityState !== "visible" && !media && !interacted) return;
  try {
    const result = await browser.runtime.sendMessage({
      type: "activity",
      active: interacted,
      playing: media,
    });
    interacted = false;
    if (result?.ok && result.data?.remind) {
      const data = result.data;
      const language = data.language as string;
      const used = Math.floor(data.todayMs / 60_000),
        left =
          data.current?.leftMs == null
            ? "∞"
            : Math.ceil(data.current.leftMs / 60_000);
      const text =
        language === "fa"
          ? `TimeHarbor\nامروز: ${used} دقیقه · باقی‌مانده: ${left} دقیقه`
          : language === "ar"
            ? `TimeHarbor\nاليوم: ${used} دقيقة · المتبقي: ${left} دقيقة`
            : `TimeHarbor\nToday: ${used} min · Remaining: ${left} min`;
      notice(text);
    }
  } catch {
    /* The extension may be reloading; the next heartbeat reconnects. */
  }
}
document.addEventListener("visibilitychange", () => {
  void heartbeat();
});
for (const event of ["play", "pause", "ended"])
  document.addEventListener(
    event,
    () => {
      void heartbeat();
    },
    true,
  );
void heartbeat();
setInterval(() => {
  void heartbeat();
}, 5000);
