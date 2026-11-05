// Local demo/testing transport only. It is never included in the addon bundle.
function previewRuntime(seed) {
  let config = seed.config,
    state = seed.state,
    checks = [];
  const deadline = Date.now() + 4000;
  const scenario = seed.scenario;
  const response = (data) => ({ ok: true, data: structuredClone(data) });
  window.__timeHarborPreview = () => structuredClone({ config, state, checks });
  window.browser = {
    runtime: {
      getURL: (p) => "moz-extension://preview/" + p,
      openOptionsPage: async () => {},
      sendMessage: async (message) => {
        if (message.type === "read") return response({ config, state });
        if (message.type === "save") {
          config = structuredClone(message.config);
          return response({ token: "demo" });
        }
        if (message.type === "breakChecks") {
          checks = [...message.checks];
          return response(true);
        }
        if (message.type === "public" || message.type === "activity") {
          const isBreak = scenario.startsWith("break"),
            required = scenario === "break-required";
          return response({
            language: config.language,
            pinSet: true,
            pauseEnabled: true,
            pauseUntil: 0,
            pauseCount: 0,
            pauseMax: 1,
            todayMs: 1200000,
            remind: scenario === "reminder",
            current: {
              blocked: isBreak || scenario === "quota",
              reason: isBreak
                ? "break"
                : scenario === "quota"
                  ? "quota"
                  : "none",
              host: "youtube.com",
              ruleId: "video",
              usedMs: 1200000,
              leftMs: scenario === "quota" ? 0 : 2400000,
              resetAt: deadline + 3600000,
              breakUntil: isBreak ? deadline : 0,
              needsChecklist: required && Date.now() >= deadline,
              checklistRequired: required,
              allowSkip: scenario === "break-skip",
              checks,
              checklist: ["Drink water", "Take a walk", "Stretch"],
            },
          });
        }
        return response({ token: "demo" });
      },
    },
    tabs: { query: async () => [{ url: "https://youtube.com/" }] },
  };
}
export function previewScript(config, state, language, scenario = "dashboard") {
  const copy = structuredClone(config);
  copy.language = language;
  copy.rules.push({ ...copy.rules[0], id: "identical", host: "example.org" });
  return `(${previewRuntime.toString()})(${JSON.stringify({ config: copy, state, scenario })});`;
}
