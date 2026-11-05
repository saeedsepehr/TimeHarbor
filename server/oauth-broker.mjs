import { createServer } from "node:http";
import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const safeText = (v, max = 4096) =>
  typeof v === "string" && v.length > 0 && v.length <= max && !/[\r\n]/.test(v);
export function createOAuthBroker(options, fetchImpl = fetch) {
  const { clientId, clientSecret, stateSecret, baseUrl, redirects } = options;
  const base = new URL(baseUrl);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  )
    throw Error("Broker needs an HTTPS origin");
  if (
    !safeText(clientId) ||
    !safeText(clientSecret) ||
    typeof stateSecret !== "string" ||
    stateSecret.length < 32
  )
    throw Error("Missing server-side OAuth configuration");
  const allowed = new Set(redirects);
  if (
    !allowed.size ||
    [...allowed].some((url) => {
      const u = new URL(url);
      return (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        !/\.(chromiumapp\.org|extensions\.allizom\.org)$/.test(u.hostname)
      );
    })
  )
    throw Error("Only exact extension HTTPS redirect URLs are allowed");
  const callback = base.origin + "/callback",
    rates = new Map();
  const allowedChromeOrigins = new Set(
    [...allowed]
      .filter((value) => new URL(value).hostname.endsWith(".chromiumapp.org"))
      .map(
        (value) =>
          "chrome-extension://" +
          new URL(value).hostname.replace(/\.chromiumapp\.org$/, ""),
      ),
  );
  const validOrigin = (origin) =>
    allowedChromeOrigins.has(origin) ||
    /^moz-extension:\/\/[a-f0-9-]{36}$/.test(origin);
  const sign = (payload) =>
    createHmac("sha256", stateSecret).update(payload).digest("base64url");
  function unpack(state) {
    if (!safeText(state, 4096)) throw Error("Invalid OAuth state");
    const [payload, signature, extra] = state.split(".");
    if (extra || !payload || !signature) throw Error("Invalid OAuth state");
    const expected = Buffer.from(sign(payload)),
      actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw Error("Invalid OAuth state");
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      !allowed.has(value.redirect) ||
      !Number.isFinite(value.expires) ||
      value.expires < Date.now() ||
      value.expires > Date.now() + 601000 ||
      !/^[\w-]{43}$/.test(value.challenge)
    )
      throw Error("Expired or invalid OAuth state");
    return value;
  }
  async function tokens(parameters) {
    const response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...parameters,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) throw Error("Google authorization failed");
    const reader = response.body?.getReader();
    if (!reader) throw Error("Invalid token response");
    const chunks = [];
    let size = 0;
    try {
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        size += item.value.byteLength;
        if (size > 65536) throw Error("Invalid token response");
        chunks.push(Buffer.from(item.value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const text = Buffer.concat(chunks, size).toString("utf8");
    const data = JSON.parse(text);
    if (
      !safeText(data.access_token) ||
      data.token_type?.toLowerCase() !== "bearer" ||
      !Number.isFinite(data.expires_in) ||
      (data.scope && !data.scope.split(" ").includes(SCOPE))
    )
      throw Error("Google did not grant the required scope");
    return {
      access_token: data.access_token,
      expires_in: Math.min(3600, Math.max(60, data.expires_in)),
      ...(safeText(data.refresh_token)
        ? { refresh_token: data.refresh_token }
        : {}),
    };
  }
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    const origin = req.headers.origin;
    if (origin && validOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    }
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    try {
      const now = Date.now(),
        ip = req.socket.remoteAddress ?? "unknown";
      for (const [key, v] of rates) if (v.until < now) rates.delete(key);
      const rate = rates.get(ip) ?? { until: now + 60000, count: 0 };
      rate.count++;
      rates.set(ip, rate);
      if (rate.count > 60 || rates.size > 10000) {
        send(429, { error: "Rate limit" });
        return;
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const url = new URL(req.url, base);
      if (req.method === "GET" && url.pathname === "/callback") {
        const state = url.searchParams.get("state"),
          value = unpack(state);
        const redirect = new URL(value.redirect);
        const code = url.searchParams.get("code");
        if (!safeText(code)) {
          redirect.hash = new URLSearchParams({
            error: "authorization_denied",
            state,
          }).toString();
        } else redirect.hash = new URLSearchParams({ code, state }).toString();
        res.writeHead(302, { Location: redirect.href });
        res.end();
        return;
      }
      if (
        req.method !== "POST" ||
        !["/start", "/token", "/refresh"].includes(url.pathname)
      ) {
        send(404, { error: "Not found" });
        return;
      }
      if (origin && !validOrigin(origin)) {
        send(403, { error: "Extension origin required" });
        return;
      }
      if (!req.headers["content-type"]?.startsWith("application/json")) {
        send(415, { error: "JSON required" });
        return;
      }
      let size = 0,
        body = "";
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) throw Error("Request too large");
        body += chunk;
      }
      const data = JSON.parse(body);
      if (url.pathname === "/start") {
        if (
          !allowed.has(data.redirect) ||
          !/^[\w-]{43}$/.test(data.challenge) ||
          !/^[\w-]{43}$/.test(data.nonce)
        )
          throw Error("Invalid OAuth request");
        const payload = Buffer.from(
          JSON.stringify({
            redirect: data.redirect,
            challenge: data.challenge,
            nonce: data.nonce,
            expires: Date.now() + 600000,
          }),
        ).toString("base64url");
        const state = payload + "." + sign(payload),
          auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        auth.search = new URLSearchParams({
          client_id: clientId,
          redirect_uri: callback,
          response_type: "code",
          scope: SCOPE,
          state,
          code_challenge: data.challenge,
          code_challenge_method: "S256",
          access_type: "offline",
          prompt: "consent select_account",
        }).toString();
        send(200, { url: auth.href, state });
        return;
      }
      if (url.pathname === "/token") {
        const value = unpack(data.state);
        if (
          !safeText(data.code) ||
          !/^[\w.~-]{43,128}$/.test(data.verifier) ||
          createHash("sha256").update(data.verifier).digest("base64url") !==
            value.challenge
        )
          throw Error("PKCE validation failed");
        send(
          200,
          await tokens({
            grant_type: "authorization_code",
            code: data.code,
            code_verifier: data.verifier,
            redirect_uri: callback,
          }),
        );
        return;
      }
      if (!safeText(data.refresh_token)) throw Error("Invalid refresh request");
      send(
        200,
        await tokens({
          grant_type: "refresh_token",
          refresh_token: data.refresh_token,
          scope: SCOPE,
        }),
      );
    } catch {
      if (!res.headersSent)
        send(400, { error: "Authorization request could not be completed" });
      else res.end();
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createOAuthBroker({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    stateSecret: process.env.OAUTH_STATE_SECRET,
    baseUrl: process.env.OAUTH_BASE_URL,
    redirects: (process.env.OAUTH_REDIRECTS ?? "").split(",").filter(Boolean),
  });
  server.listen(
    Number(process.env.PORT ?? 8080),
    process.env.HOST ?? "127.0.0.1",
  );
}
