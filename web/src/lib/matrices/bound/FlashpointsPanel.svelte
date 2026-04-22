<!--
  Live-bound "flashpoints" panel. Reads the most recent events scoped
  to the given domains from the reactive dashboard store and projects
  them into a CardList.

  The display-only `CardList` stays pure; this wrapper handles the
  dashboard binding so catalog entries remain declarative.
-->
<script lang="ts">
  import { dashboard } from "../../state.svelte";
  import { flashpointCards, MATRIX_LIST_LIMIT } from "../builders";
  import CardList from "../panels/CardList.svelte";

  interface Props {
    domains: readonly string[];
    limit?: number;
  }

  const { domains, limit = MATRIX_LIST_LIMIT }: Props = $props();
  const items = $derived(flashpointCards(dashboard.events, domains, limit));
</script>

<CardList {items} emptyLabel="No active flashpoints for this matrix." />
