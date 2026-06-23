<script lang="ts">
  import { dashboard } from "../../state.svelte";
  import { DOMAIN_CATALOG } from "../../colors";
  import { domainRiskBars } from "../builders";
  import RegionBarBadges from "../panels/RegionBarBadges.svelte";

  interface Props {
    domains: readonly string[];
  }

  const { domains }: Props = $props();
  const resolved = $derived(
    domains.length > 0 ? domains : DOMAIN_CATALOG.map((d) => d.id),
  );
  const items = $derived(domainRiskBars(dashboard.domainState, resolved));
</script>

<RegionBarBadges {items} emptyLabel="No domain readings yet." />
