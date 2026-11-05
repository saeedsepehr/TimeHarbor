import test from "node:test";
import assert from "node:assert/strict";
import { GoogleDrive, boundedJson } from "../src/drive.ts";
test("Drive transport targets only appDataFolder and binds document names to content", async () => {
  const id = "a".repeat(32),
    name = `timeharbor-v1_${id}_2026-11-05.json`;
  let calls = 0;
  const api = new GoogleDrive("dummy-token", (async (url, options) => {
    calls++;
    assert.equal(
      (options!.headers as Record<string, string>).Authorization,
      "Bearer dummy-token",
    );
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://www.googleapis.com");
    if (parsed.searchParams.get("alt") === "media")
      return new Response(
        JSON.stringify({
          protocol: 1,
          kind: "usage",
          deviceId: id,
          day: "2026-11-05",
          seq: 1,
          used: {},
          segments: [],
        }),
      );
    assert.equal(parsed.searchParams.get("spaces"), "appDataFolder");
    return new Response(
      JSON.stringify({
        files: [{ id: "file", name, modifiedTime: "2026-11-05T00:00:00Z" }],
      }),
    );
  }) as typeof fetch);
  const files = await api.list();
  assert.equal((await api.read(files[0]!)).deviceId, id);
  await assert.rejects(
    () => api.read({ ...files[0]!, id: "../other" }),
    /Invalid/,
  );
  assert.equal(calls, 2);
  await assert.rejects(
    () => boundedJson(new Response("x".repeat(100)), 10),
    /large/,
  );
});
