import { describe, expect, test } from "bun:test";

import {
  EMULATOR_GATEWAY_HOST,
  httpHostBase,
  resolveDevMachineHost,
} from "./dev-machine-host";

describe("resolveDevMachineHost", () => {
  test("uses custom ingest URL hostname when set", () => {
    expect(
      resolveDevMachineHost({
        lanHost: "",
        ingestBaseCustom: "http://192.168.1.50:8080",
      }),
    ).toBe("192.168.1.50");
  });

  test("uses lanHost when set", () => {
    expect(resolveDevMachineHost({ lanHost: "192.168.1.97", ingestBaseCustom: "" })).toBe(
      "192.168.1.97",
    );
  });

  test("prefers emulator gateway when requested", () => {
    expect(
      resolveDevMachineHost({
        lanHost: "",
        ingestBaseCustom: "",
        preferEmulatorGateway: true,
      }),
    ).toBe(EMULATOR_GATEWAY_HOST);
  });

  test("returns empty when no host and not emulator", () => {
    expect(
      resolveDevMachineHost({
        lanHost: "",
        ingestBaseCustom: "",
        preferEmulatorGateway: false,
      }),
    ).toBe("");
  });
});

describe("httpHostBase", () => {
  test("returns empty for blank host", () => {
    expect(httpHostBase("", 8080)).toBe("");
  });
});
