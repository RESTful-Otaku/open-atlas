import { describe, expect, test } from "bun:test";
import {
  normalizeStdbHost,
  normalizeWebSocketUri,
  resolveStdbWebSocketUri,
} from "./stdb-endpoint";

describe("normalizeStdbHost", () => {
  test("maps localhost and IPv6 loopback to 127.0.0.1", () => {
    expect(normalizeStdbHost("localhost")).toBe("127.0.0.1");
    expect(normalizeStdbHost("LOCALHOST")).toBe("127.0.0.1");
    expect(normalizeStdbHost("::1")).toBe("127.0.0.1");
    expect(normalizeStdbHost("[::1]")).toBe("127.0.0.1");
  });

  test("preserves LAN and public hostnames", () => {
    expect(normalizeStdbHost("192.168.1.10")).toBe("192.168.1.10");
    expect(normalizeStdbHost("openatlas.example.com")).toBe(
      "openatlas.example.com",
    );
  });
});

describe("resolveStdbWebSocketUri", () => {
  test("uses IPv4 loopback for localhost page host", () => {
    expect(resolveStdbWebSocketUri("localhost")).toBe("ws://127.0.0.1:3000");
    expect(resolveStdbWebSocketUri("::1")).toBe("ws://127.0.0.1:3000");
  });

  test("uses page host for non-loopback", () => {
    expect(resolveStdbWebSocketUri("10.0.0.5")).toBe("ws://10.0.0.5:3000");
  });
});

describe("normalizeWebSocketUri", () => {
  test("rewrites ws://localhost to IPv4 loopback", () => {
    expect(normalizeWebSocketUri("ws://localhost:3000")).toBe(
      "ws://127.0.0.1:3000/",
    );
  });
});
