import { describe, expect, test } from "bun:test";
import { readResponseJson } from "./http-json";

describe("readResponseJson", () => {
  test("parses JSON object", async () => {
    const r = new Response(JSON.stringify({ ready: true }), {
      headers: { "content-type": "application/json" },
    });
    const out = await readResponseJson<{ ready: boolean }>(r);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.data.ready).toBe(true);
  });

  test("rejects HTML with clear error", async () => {
    const r = new Response("<!DOCTYPE html><html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const out = await readResponseJson(r);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.err).toMatch(/non-JSON|Unexpected/i);
  });
});
