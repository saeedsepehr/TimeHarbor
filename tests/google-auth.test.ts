import test from "node:test";
import assert from "node:assert/strict";
import { completeOAuth, prepareOAuth } from "../src/google-auth.ts";
test("OAuth callback rejects wrong origins, state mismatch and expired flows before token exchange", async () => {
  const pending = {
    verifier: "v".repeat(43),
    state: "expected-state",
    redirect: "https://extension-id.chromiumapp.org/",
    expires: Date.now() + 60000,
  };
  await assert.rejects(
    () =>
      completeOAuth("https://evil.test/#code=x&state=expected-state", pending),
    /mismatch/,
  );
  await assert.rejects(
    () => completeOAuth(pending.redirect + "#code=x&state=other", pending),
    /not completed/,
  );
  await assert.rejects(
    () =>
      completeOAuth(pending.redirect + "#code=x&state=expected-state", {
        ...pending,
        expires: 0,
      }),
    /expired/,
  );
  await assert.rejects(
    () => prepareOAuth(pending.redirect),
    /GOOGLE_SETUP_REQUIRED/,
  );
});
