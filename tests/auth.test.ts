import test from "node:test";
import assert from "node:assert/strict";
import { createPin, trustedPage, verifyPin } from "../src/auth.ts";
test("salted PIN verification and backoff after five failed attempts", async () => {
  const record = await createPin("1234"),
    other = await createPin("1234");
  assert.notEqual(record.hash, other.hash);
  assert.notEqual(record.hash, "1234");
  assert.equal(await verifyPin(record, "1234", 0), true);
  for (let i = 0; i < 5; i++)
    assert.equal(await verifyPin(record, "0000", 0), false);
  await assert.rejects(() => verifyPin(record, "1234", 1), /Try again/);
  assert.equal(await verifyPin(record, "1234", 30_001), true);
  assert.equal(record.failures, 0);
  await assert.rejects(() => createPin("12"), /four digits/);
});
test("privileged requests require our extension ID, UUID and exact UI path", () => {
  const base = "moz-extension://our-uuid/";
  const id = "our-id";
  assert.equal(
    trustedPage({ id, url: base + "ui/options.html" }, id, base),
    true,
  );
  assert.equal(
    trustedPage(
      { id, url: "moz-extension://other-uuid/ui/options.html" },
      id,
      base,
    ),
    false,
  );
  assert.equal(
    trustedPage({ id, url: "https://example.test/ui/options.html" }, id, base),
    false,
  );
  assert.equal(
    trustedPage({ id: "other-id", url: base + "ui/options.html" }, id, base),
    false,
  );
  assert.equal(
    trustedPage({ id, url: base + "anything.html" }, id, base),
    false,
  );
});
