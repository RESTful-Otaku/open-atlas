import { describe, expect, it } from "vitest";
import { mainScrollModeForPattern } from "./index";

describe("mainScrollModeForPattern", () => {
  it("fills shell only on globe and map routes", () => {
    expect(mainScrollModeForPattern("/")).toBe("fill");
    expect(mainScrollModeForPattern("/map")).toBe("fill");
  });

  it("uses page scroll on hub, viz, and other routes", () => {
    expect(mainScrollModeForPattern("/hub")).toBe("page");
    expect(mainScrollModeForPattern("/viz")).toBe("page");
    expect(mainScrollModeForPattern("/settings")).toBe("page");
    expect(mainScrollModeForPattern("/domain/energy")).toBe("page");
    expect(mainScrollModeForPattern("/matrix/threat")).toBe("page");
  });
});
