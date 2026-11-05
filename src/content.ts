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
  host.dataset.timeharborReminder = "true";
  host.style.cssText =
    "position:fixed;bottom:28px;left:50%;transform:translateX(-50%);z-index:2147483647;width:max-content;max-width:calc(100vw - 40px)";
  const shadow = host.attachShadow({ mode: "closed" }),
    box = document.createElement("div");
  box.style.cssText =
    "display:flex;align-items:center;gap:20px;font:14px/1.7 system-ui,sans-serif;background:#382c86;color:#fff;padding:17px 20px;border:1px solid #aaa2ff;border-radius:18px;box-shadow:0 14px 45px #34235c44;white-space:pre-line";
  const message = document.createElement("span");
  message.textContent = text;
  box.append(message);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close reminder");
  close.style.cssText =
    "background:#ffffff18;color:#fff;border:0;border-radius:50%;font:24px system-ui;cursor:pointer;width:34px;height:34px;flex-shrink:0";
  close.addEventListener("click", () => host.remove());
  box.append(close);
  box.setAttribute("role", "status");
  shadow.append(box);
  const parent = document.fullscreenElement;
  (parent && !(parent instanceof HTMLMediaElement)
    ? parent
    : document.documentElement
  ).append(host);
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    host.animate(
      [
        {
          transform: "translateX(calc(-50% - 100vw))",
          opacity: 0,
          offset: 0,
          easing: "ease-out",
        },
        { transform: "translateX(-50%)", opacity: 1, offset: 0.1 },
        {
          transform: "translateX(-50%)",
          opacity: 1,
          offset: 0.88,
          easing: "ease-in",
        },
        { transform: "translateX(calc(-50% + 100vw))", opacity: 0, offset: 1 },
      ],
      { duration: 9000, easing: "linear", fill: "forwards" },
    );
  setTimeout(() => host.remove(), 9000);
}
async function heartbeat(force = false): Promise<void> {
  const media = playing();
  if (!force && document.visibilityState !== "visible") return;
  try {
    const result = await browser.runtime.sendMessage({
      type: "activity",
      active: interacted,
      playing: media,
      visible: document.visibilityState === "visible",
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
  void heartbeat(true);
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
