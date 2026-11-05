import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createOAuthBroker } from "../server/oauth-broker.mjs";
test("prepared extension and broker complete a PKCE code/refresh round trip against a fake Google endpoint", async () => {
  const redirect = "https://extension-id.chromiumapp.org/";
  const server = createOAuthBroker(
    {
      clientId: "dummy-client",
      clientSecret: "dummy-server-secret",
      stateSecret: "s".repeat(40),
      baseUrl: "https://auth.example.test/",
      redirects: [redirect],
    },
    async (_url, options) => {
      const grant = options.body.get("grant_type");
      assert.ok(["authorization_code", "refresh_token"].includes(grant));
      return new Response(
        JSON.stringify({
          access_token:
            grant === "refresh_token" ? "refreshed-token" : "initial-token",
          ...(grant === "authorization_code"
            ? { refresh_token: "dummy-refresh" }
            : {}),
          token_type: "Bearer",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/drive.appdata",
        }),
      );
    },
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const original = globalThis.fetch,
    base = `http://127.0.0.1:${server.address().port}`;
  globalThis.fetch = async (url, options) => {
    const target = new URL(String(url));
    assert.equal(target.origin, "https://auth.example.test");
    return original(base + target.pathname + target.search, {
      ...options,
      headers: {
        ...options.headers,
        Origin: "chrome-extension://extension-id",
      },
    });
  };
  try {
    const bundled = await build({
      entryPoints: ["src/google-auth.ts"],
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
      define: {
        __OAUTH_BROKER__: JSON.stringify("https://auth.example.test/"),
      },
    });
    const auth = await import(
      "data:text/javascript;base64," +
        Buffer.from(bundled.outputFiles[0].text).toString("base64")
    );
    const prepared = await auth.prepareOAuth(redirect);
    assert.equal(
      new URL(prepared.url).searchParams.get("code_challenge_method"),
      "S256",
    );
    const response = await original(
      base +
        "/callback?" +
        new URLSearchParams({
          state: prepared.pending.state,
          code: "dummy-code",
        }),
      { redirect: "manual" },
    );
    const value = await auth.completeOAuth(
      response.headers.get("location"),
      prepared.pending,
    );
    assert.equal(value.access, "initial-token");
    assert.equal(value.refresh, "dummy-refresh");
    const renewed = await auth.refreshGoogle({ ...value, expires: 0 });
    assert.equal(renewed.access, "refreshed-token");
    assert.equal(renewed.refresh, "dummy-refresh");
  } finally {
    globalThis.fetch = original;
    await new Promise((r) => server.close(r));
  }
});
