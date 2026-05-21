/**
 * NL filter state + apply to dashboard (operator bar).
 */

import type { NlFilterIntent } from "./nl-filter-parse";
import { setSelectedDomain } from "./state.svelte";

export type { NlFilterIntent } from "./nl-filter-parse";
export { parseNlFilterIntent } from "./nl-filter-parse";

/** Reactive NL filter applied from the operator bar. */
export const nlFilter = $state({
  intent: null as NlFilterIntent | null,
});

/** Apply parsed intent to global dashboard filter (+ ops strip hint). */
export function applyNlFilterIntent(intent: NlFilterIntent): void {
  nlFilter.intent = intent;
  setSelectedDomain(intent.domain);
}
