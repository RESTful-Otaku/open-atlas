<script lang="ts">
  import { dashboardData } from "../../dashboard-revision.svelte";
  import { dashboard } from "../../state.svelte";
  import { flashpointCards, MATRIX_LIST_LIMIT } from "../builders";
  import CardList from "../panels/CardList.svelte";

  interface Props {
    domains: readonly string[];
    limit?: number;
  }

  const { domains, limit = MATRIX_LIST_LIMIT }: Props = $props();
  const items = $derived.by(() => {
    void dashboardData.revision;
    return flashpointCards(dashboard.events, domains, limit);
  });
</script>

<CardList {items} emptyLabel="No active flashpoints for this matrix." />
