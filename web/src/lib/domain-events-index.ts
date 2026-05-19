/** Pure index builder (testable without Svelte runes). */
import type { UiEvent } from "./types";

export function buildEventsByDomain(
  events: readonly UiEvent[],
): ReadonlyMap<string, readonly UiEvent[]> {
  const byDomain = new Map<string, UiEvent[]>();
  for (const e of events) {
    const list = byDomain.get(e.domain);
    if (list) list.push(e);
    else byDomain.set(e.domain, [e]);
  }
  return byDomain;
}
