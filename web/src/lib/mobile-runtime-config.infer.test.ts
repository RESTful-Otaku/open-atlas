import { describe, expect, test } from "bun:test";
import { EMULATOR_GATEWAY_HOST } from "./dev-machine-host";
import { inferProfileFromBakedEnv, MAINCLOUD_STDB_WS } from "./mobile-runtime-config";

describe("inferProfileFromBakedEnv", () => {
  test("no ingest → cloud_live", () => {
    expect(inferProfileFromBakedEnv("", MAINCLOUD_STDB_WS)).toBe("cloud_live");
  });

  test("maincloud + emulator gateway → cloud_ingest_hybrid", () => {
    expect(
      inferProfileFromBakedEnv(
        `http://${EMULATOR_GATEWAY_HOST}:8080`,
        MAINCLOUD_STDB_WS,
      ),
    ).toBe("cloud_ingest_hybrid");
  });

  test("maincloud + LAN host → cloud_ingest_live", () => {
    expect(inferProfileFromBakedEnv("http://192.168.1.50:8080", MAINCLOUD_STDB_WS)).toBe(
      "cloud_ingest_live",
    );
  });

  test("local STDB + emulator → local_emulator", () => {
    expect(
      inferProfileFromBakedEnv(`http://${EMULATOR_GATEWAY_HOST}:8080`, "ws://127.0.0.1:3000"),
    ).toBe("local_emulator");
  });

  test("local STDB + LAN → local_lan", () => {
    expect(inferProfileFromBakedEnv("http://192.168.1.50:8080", "ws://127.0.0.1:3000")).toBe(
      "local_lan",
    );
  });
});
