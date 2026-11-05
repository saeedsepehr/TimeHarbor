import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createOAuthBroker } from "../server/oauth-broker.mjs";
test("broker binds state, exact redirects and PKCE; secret stays on server", async () => {
  const redirect = "https://extension-id.chromiumapp.org/",
    verifier = "v".repeat(43),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  let exchanges = 0;
  const server = createOAuthBroker(
    {
      clientId: "test-id",
      clientSecret: "server-secret",
      stateSecret: "s".repeat(40),
      baseUrl: "https://auth.example.test/",
      redirects: [redirect],
    },
    async (url, options) => {
      exchanges++;
      assert.equal(url, "https://oauth2.googleapis.com/token");
      assert.ok(
        options.body.toString().includes("client_secret=server-secret"),
      );
      return new Response(
        JSON.stringify({
          access_token: "dummy-access",
          refresh_token: "dummy-refresh",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/drive.appdata",
        }),
      );
    },
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, data, origin = "chrome-extension://extension-id") =>
    fetch(base + route, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify(data),
    });
  try {
    assert.equal(
      (
        await post("/start", {
          redirect: "https://evil.test/",
          challenge,
          nonce: "n".repeat(43),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          "/start",
          { redirect, challenge, nonce: "n".repeat(43) },
          "https://evil.test",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          "/start",
          { redirect, challenge, nonce: "n".repeat(43) },
          "chrome-extension://other-extension",
        )
      ).status,
      403,
    );
    const begin = await (
      await post("/start", { redirect, challenge, nonce: "n".repeat(43) })
    ).json();
    assert.equal(JSON.stringify(begin).includes("server-secret"), false);
    assert.equal(
      new URL(begin.url).searchParams.get("code_challenge_method"),
      "S256",
    );
    assert.equal(
      (
        await post("/token", {
          code: "code",
          verifier: "x".repeat(43),
          state: begin.state,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("/token", {
          code: "code",
          verifier,
          state: begin.state + "tampered",
        })
      ).status,
      400,
    );
    const callback = await fetch(
      base +
        "/callback?" +
        new URLSearchParams({ state: begin.state, code: "code" }),
      { redirect: "manual" },
    );
    assert.equal(
      new URL(callback.headers.get("location")).origin,
      new URL(redirect).origin,
    );
    assert.equal(
      (await post("/token", { code: "code", verifier, state: begin.state }))
        .status,
      200,
    );
    assert.equal(exchanges, 1);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
