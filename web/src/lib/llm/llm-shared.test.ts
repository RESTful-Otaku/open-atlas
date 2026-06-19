import { describe, expect, test } from "bun:test";
import { parseApiError } from "./llm-shared";

describe("parseApiError", () => {
  test("extracts string error field", async () => {
    const r = new Response(JSON.stringify({ error: "rate limit exceeded" }), {
      status: 429,
      statusText: "Too Many Requests",
    });
    expect(await parseApiError(r)).toBe("rate limit exceeded");
  });

  test("extracts nested message from error object", async () => {
    const r = new Response(
      JSON.stringify({ error: { message: "API key invalid" } }),
      { status: 401, statusText: "Unauthorized" },
    );
    expect(await parseApiError(r)).toBe("API key invalid");
  });

  test("falls back to statusText when body is not JSON", async () => {
    const r = new Response("gateway timeout", {
      status: 504,
      statusText: "Gateway Timeout",
    });
    expect(await parseApiError(r)).toBe("Gateway Timeout");
  });

  test("falls back to statusText when error field is missing", async () => {
    const r = new Response(JSON.stringify({ detail: "something broke" }), {
      status: 500,
      statusText: "Internal Server Error",
    });
    expect(await parseApiError(r)).toBe("Internal Server Error");
  });

  test("handles empty response body", async () => {
    const r = new Response("", { status: 503, statusText: "Service Unavailable" });
    expect(await parseApiError(r)).toBe("Service Unavailable");
  });
});
