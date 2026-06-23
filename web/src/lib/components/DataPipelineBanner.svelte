<script lang="ts">
  import { dashboard } from "../state.svelte";
  import { readiness } from "../readiness.svelte";
  import { ingestModeLabel } from "../ingest-status";
  import { reconnectNow } from "../connection.svelte";
  import { navigate } from "../router.svelte";
  import CompactNumber from "./CompactNumber.svelte";

  const show = $derived(
    dashboard.dataMode === "live" &&
      dashboard.connection === "live" &&
      dashboard.events.length === 0,
  );

  const headline = $derived(
    readiness.ingestReady === false
      ? "Waiting for ingest → SpacetimeDB"
      : readiness.ingestStatus?.ingest_mode === "static"
        ? "Static fixtures loaded — waiting for rows"
        : "Connected — waiting for first events",
  );
</script>

{#if show}
  <aside class="pipeline-banner" role="status">
    <div class="pipeline-copy">
      <strong>{headline}</strong>
      <p>
        {#if readiness.ingestReady === false}
          Start the stack with <code>./dev.sh up</code> (hybrid: live APIs +
          simulators for all domains) or <code>./dev.sh up:live</code> (APIs
          only). The UI reads SpacetimeDB directly; ingest must be running to
          push events.
        {:else if readiness.ingestStatus}
          Ingest mode: <strong>{ingestModeLabel(readiness.ingestStatus.ingest_mode)}</strong>.
          {#if readiness.ingestStatus.stdb_event_count != null}
            SpacetimeDB holds <strong
              ><CompactNumber value={readiness.ingestStatus.stdb_event_count} /></strong
            >
            events.
          {/if}
          If the UI buffer stays at zero after reconnect, refresh the page.
        {:else}
          Ingest is reachable. Events should appear within a few seconds when
          simulators or live feeds are active.
        {/if}
      </p>
    </div>
    <div class="pipeline-actions">
      <button type="button" class="btn" onclick={() => reconnectNow()}>
        Reconnect STDB
      </button>
      <button type="button" class="btn" onclick={() => navigate("/settings")}>
        Integration settings
      </button>
    </div>
  </aside>
{/if}

<style>
  .pipeline-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    margin: 0 var(--space-6) var(--space-4);
    padding: var(--space-4);
    border-radius: var(--radius);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border-1));
    background: color-mix(in srgb, var(--accent-soft) 55%, var(--bg-1));
  }
  .pipeline-copy strong {
    display: block;
    font-size: 14px;
    color: var(--text-1);
    margin-bottom: var(--space-2);
  }
  .pipeline-copy p {
    font-size: 13px;
    line-height: 1.5;
    max-width: 52rem;
  }
  .pipeline-copy code {
    font-size: 12px;
  }
  .pipeline-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
