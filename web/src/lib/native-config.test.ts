import { describe, expect, test } from "bun:test";
import { joinServiceUrl } from "./native-config";

describe("joinServiceUrl", () => {
  test("returns relative path when base is empty", () => {
    expect(joinServiceUrl("", "/status")).toBe("/status");
    expect(joinServiceUrl("", "ready")).toBe("/ready");
  });

  test("joins absolute base without duplicate slashes", () => {
    expect(joinServiceUrl("http://10.0.2.2:8080", "/metrics")).toBe(
      "http://10.0.2.2:8080/metrics",
    );
    expect(joinServiceUrl("http://192.168.1.10:8080/", "/feeds")).toBe(
      "http://192.168.1.10:8080/feeds",
    );
  });
});
