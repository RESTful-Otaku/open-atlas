/**
 * Lazy `event_narrative` subscription — only while a mounted view needs it.
 */
import { onMount } from "svelte";
import { acquireNarrativeSubscription } from "./connection.svelte";

/** Mount hook: subscribe on enter, stop processing on leave. */
export function useNarrativeSubscription(): void {
  onMount(() => acquireNarrativeSubscription());
}
