import { describe, expect, test } from "bun:test";

import { DOMAIN_CATALOG } from "../../colors";
import { buildDomainPrimary, deskChartPack } from "./domain-desk-charts";
import { deskProfileForDomain } from "./domain-desk-types";

const emptyParams = {
  accent: "#22c55e",
  events: [],
  severityHistory: [] as readonly number[],
  causalEdges: [],
};

describe("buildDomainPrimary", () => {
  test("each catalog domain has a distinct primary tag", () => {
    const tags = new Set<string>();
    for (const d of DOMAIN_CATALOG) {
      const r = buildDomainPrimary(d.id, {
        domainId: d.id,
        ...emptyParams,
      });
      tags.add(r.tag);
    }
    expect(tags.size).toBe(DOMAIN_CATALOG.length);
  });

  test("finance is donut and transport is parallel", () => {
    const f = buildDomainPrimary("finance", { domainId: "finance", ...emptyParams });
    const t = buildDomainPrimary("transport", { domainId: "transport", ...emptyParams });
    expect(f.tag).toBe("donut");
    expect(t.tag).toBe("parallel");
  });

  test("each domain desk pack has five panels (primary + four extras)", () => {
    for (const d of DOMAIN_CATALOG) {
      const pack = deskChartPack(deskProfileForDomain(d.id), {
        domainId: d.id,
        ...emptyParams,
      });
      expect(pack.panels.length).toBe(5);
    }
  });
});
