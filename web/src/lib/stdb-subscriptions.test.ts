import { describe, expect, it } from "vitest";
import {
  CORE_SUBSCRIPTION_QUERIES,
  NARRATIVE_SUBSCRIPTION_QUERIES,
} from "./stdb-subscriptions";

describe("subscription queries", () => {
  it("core uses full-table SELECT only (no ORDER BY or LIMIT)", () => {
    for (const sql of CORE_SUBSCRIPTION_QUERIES) {
      expect(sql).toMatch(/^SELECT \* FROM \w+$/);
      expect(sql.toUpperCase()).not.toContain("ORDER BY");
      expect(sql.toUpperCase()).not.toContain("LIMIT");
    }
    expect(CORE_SUBSCRIPTION_QUERIES).not.toContain(
      "SELECT * FROM event_narrative",
    );
  });

  it("narratives are isolated for lazy subscribe", () => {
    expect(NARRATIVE_SUBSCRIPTION_QUERIES).toEqual([
      "SELECT * FROM event_narrative",
    ]);
  });
});
