<script lang="ts">
  import { dashboard } from "../../state.svelte";
  import { domainKpiCells } from "../builders";
  import KpiGrid from "../panels/KpiGrid.svelte";

  interface Props {
    domain: string;
    columns?: 2 | 3 | 4 | 6;
  }

  const { domain, columns = 4 }: Props = $props();
  const cells = $derived(
    domainKpiCells(dashboard.domainState, dashboard.domainInsights, domain),
  );
</script>

<KpiGrid {cells} {columns} />
