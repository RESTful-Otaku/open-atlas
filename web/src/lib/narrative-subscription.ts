/**
 * Lazy `event_narrative` subscription — call from views that need headlines.
 */
import { onMount } from "svelte";
import { ensureNarrativeSubscription } from "./connection.svelte";

/** Mount hook: starts narrative table sync when the component loads. */
export function useNarrativeSubscription(): void {
  onMount(() => {
    ensureNarrativeSubscription();
  });
}
