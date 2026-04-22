<!--
  Live-bound AI synthesis panel. Reads the reactive dashboard store and
  dispatches to the matrix-specific body builder in `../ai-synthesis`.

  Output is deterministic — no wall clock, no RNG — so reloading or
  replaying the event log reproduces the same card.
-->
<script lang="ts">
  import { dashboard } from "../../state.svelte";
  import { synthesizeMatrix } from "../ai-synthesis";
  import AiSynthesisCard from "../panels/AiSynthesisCard.svelte";

  interface Props {
    matrixId: string;
    scope: readonly string[];
    title: string;
    kicker?: string;
    accent?: "accent" | "violet" | "rose" | "amber";
  }

  const { matrixId, scope, title, kicker, accent = "accent" }: Props =
    $props();

  const output = $derived(
    synthesizeMatrix(matrixId, scope, {
      domainState: dashboard.domainState,
      insights: dashboard.domainInsights,
      events: dashboard.events,
      signals: dashboard.recentSignals,
    }),
  );
</script>

<AiSynthesisCard
  {title}
  {kicker}
  {accent}
  body={output.body}
  citations={output.citations}
/>
