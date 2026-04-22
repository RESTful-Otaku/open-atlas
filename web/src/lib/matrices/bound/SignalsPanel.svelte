<!--
  Live signal list scoped to the matrix's domains. Rendered as a
  StatusTable with severity-bucketed status dots per row.
-->
<script lang="ts">
  import { dashboard } from "../../state.svelte";
  import { signalRows, MATRIX_LIST_LIMIT } from "../builders";
  import StatusTable from "../panels/StatusTable.svelte";

  interface Props {
    domains: readonly string[];
    limit?: number;
  }

  const { domains, limit = MATRIX_LIST_LIMIT }: Props = $props();
  const rows = $derived(signalRows(dashboard.recentSignals, domains, limit));
</script>

<StatusTable {rows} emptyLabel="No active signals." />
