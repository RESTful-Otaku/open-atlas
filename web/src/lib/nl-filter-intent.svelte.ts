

import type { NlFilterIntent } from "./nl-filter-parse";
import { setSelectedDomain } from "./state.svelte";

export type { NlFilterIntent } from "./nl-filter-parse";
export { parseNlFilterIntent } from "./nl-filter-parse";


export const nlFilter = $state({
  intent: null as NlFilterIntent | null,
});


export function applyNlFilterIntent(intent: NlFilterIntent): void {
  nlFilter.intent = intent;
  setSelectedDomain(intent.domain);
}
