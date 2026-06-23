
import { onMount } from "svelte";
import { acquireNarrativeSubscription } from "./connection.svelte";


export function useNarrativeSubscription(): void {
  onMount(() => acquireNarrativeSubscription());
}
