import { describe, expect, test } from "bun:test";
import { joinServiceUrl } from "./native-config";

describe("native ingest URL rules", () => {
  test("empty base yields relative path (dev proxy only)", () => {
    expect(joinServiceUrl("", "/status")).toBe("/status");
  });

  test("absolute base is required for native production ingest", () => {
    const url = joinServiceUrl("http://192.168.1.42:8080", "/status");
    expect(url).toBe("http://192.168.1.42:8080/status");
    expect(url.startsWith("http://")).toBe(true);
  });
});
