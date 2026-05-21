<script lang="ts">
  import { onMount } from "svelte";
  import { RefreshCw, Play, Link2, Save } from "@lucide/svelte";
  import {
    connectionLabel,
    fetchFeedCatalog,
    formatLastPoll,
    formatNextPoll,
    minPollIntervalSecs,
    pollIntervalLabel,
    reconnectFeed,
    testFeed,
    updateFeedPollIntervals,
    updateFeedSecrets,
    type FeedCatalog,
    type FeedConnectionStatus,
    type FeedRow,
  } from "../feed-config";
  import { feedLive } from "../feed-live.svelte";
  import { ingestModeLabel } from "../ingest-status";
  import { formatCompactNumber } from "../format-compact-number";
  import CompactNumber from "./CompactNumber.svelte";

  let catalog = $state<FeedCatalog | null>(null);
  let loadError = $state<string | null>(null);
  let loading = $state(false);
  let saving = $state(false);
  let saveMessage = $state<string | null>(null);

  /** Draft API key values (only keys that require env). */
  let keyDrafts = $state<Record<string, string>>({});
  let busyFeed = $state<string | null>(null);
  let pollSaving = $state<string | null>(null);
  let feedActionMsg = $state<Record<string, string>>({});

  onMount(() => {
    void reload();
  });

  async function reload(quiet = false): Promise<void> {
    if (!quiet) loading = true;
    loadError = null;
    try {
      catalog = await fetchFeedCatalog();
      feedLive.catalog = catalog;
      feedLive.error = null;
      const drafts: Record<string, string> = {};
      for (const field of catalog.secret_fields) {
        drafts[field.env_key] = "";
      }
      keyDrafts = drafts;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      loadError = msg;
      feedLive.error = msg;
    } finally {
      if (!quiet) loading = false;
    }
  }

  async function onPollChange(feed: FeedRow, secs: number): Promise<void> {
    if (secs === feed.poll_interval_secs) return;
    pollSaving = feed.name;
    try {
      catalog = await updateFeedPollIntervals({ [feed.name]: secs });
      feedLive.catalog = catalog;
    } catch (e) {
      feedActionMsg = {
        ...feedActionMsg,
        [feed.name]: e instanceof Error ? e.message : String(e),
      };
    } finally {
      pollSaving = null;
    }
  }

  async function saveKeys(): Promise<void> {
    saving = true;
    saveMessage = null;
    try {
      const toSend: Record<string, string> = {};
      for (const [key, value] of Object.entries(keyDrafts)) {
        if (value.trim()) toSend[key] = value.trim();
      }
      catalog = await updateFeedSecrets(toSend);
      for (const key of Object.keys(keyDrafts)) {
        keyDrafts[key] = "";
      }
      saveMessage = "API keys saved and applied to the running ingest service.";
    } catch (e) {
      saveMessage = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  async function runTest(feed: FeedRow): Promise<void> {
    busyFeed = feed.name;
    try {
      const r = await testFeed(feed.name);
      feedActionMsg = {
        ...feedActionMsg,
        [feed.name]: r.ok
          ? `Test OK — ${formatCompactNumber(r.event_count).display} events (${r.duration_ms} ms)`
          : `Test failed — ${r.message}`,
      };
      await reload();
    } catch (e) {
      feedActionMsg = {
        ...feedActionMsg,
        [feed.name]: e instanceof Error ? e.message : String(e),
      };
    } finally {
      busyFeed = null;
    }
  }

  async function runReconnect(feed: FeedRow): Promise<void> {
    busyFeed = feed.name;
    try {
      const r = await reconnectFeed(feed.name);
      feedActionMsg = {
        ...feedActionMsg,
        [feed.name]: r.ok
          ? `Reconnected — ${formatCompactNumber(r.event_count).display} events (${r.duration_ms} ms)`
          : `Reconnect failed — ${r.message}`,
      };
      await reload();
    } catch (e) {
      feedActionMsg = {
        ...feedActionMsg,
        [feed.name]: e instanceof Error ? e.message : String(e),
      };
    } finally {
      busyFeed = null;
    }
  }

  function statusClass(status: FeedConnectionStatus): string {
    if (status === "ok") return "ok";
    if (status === "needs_key" || status === "mode_off") return "muted";
    if (status === "idle" || status === "starting") return "muted";
    if (status === "circuit_open") return "err";
    return "err";
  }
</script>

<div class="feed-apis">
  <p>
    Manage live open-data feeds from here. Keys are stored in
    <code>{catalog?.secrets_path ?? ".dev/feed-secrets.json"}</code> on the
    machine running ingest and applied without restarting the service.
  </p>

  {#if loading && !catalog}
    <p class="muted">Loading feed catalog…</p>
  {:else if loadError}
    <p class="err-block" role="alert">
      Could not reach ingest feed API: {loadError}. Start ingest
      (<code>./dev.sh start</code>) — Vite proxies <code>/feeds</code> to port 8080.
    </p>
  {:else if catalog}
    <p class="row">
      Ingest mode: <code>{catalog.ingest_mode}</code>
      ({ingestModeLabel(catalog.ingest_mode as "sim" | "live" | "hybrid" | "static")}).
      SpacetimeDB retains about <strong>{catalog.retention_hours}h</strong> of events
      (incremental append + time prune). Poll cadence is stored in
      <code>{catalog.poll_config_path}</code>.
      {#if !catalog.live_feeds_enabled}
        <span class="warn">Live feeds are off in this mode.</span>
      {/if}
    </p>

    {#if catalog.secret_fields.length > 0}
      <h4>API keys</h4>
      <div class="keys-grid">
        {#each catalog.secret_fields as field (field.env_key)}
          <label class="key-field">
            <span class="key-label">{field.env_key}</span>
            <span class="key-desc">{field.description}</span>
            {#if field.configured && field.preview}
              <span class="key-preview mono">Configured {field.preview}</span>
            {:else}
              <span class="key-preview muted">Not set — feeds: {field.feeds.join(", ")}</span>
            {/if}
            <input
              type="password"
              class="key-input"
              placeholder={field.env_key === "OPENSKY_CLIENT_ID"
                ? field.configured
                  ? "Replace client ID…"
                  : "Paste OpenSky client ID…"
                : field.env_key === "OPENSKY_CLIENT_SECRET"
                  ? field.configured
                    ? "Replace client secret…"
                    : "Paste OpenSky client secret…"
                  : field.configured
                    ? "Replace key…"
                    : "Paste API key…"}
              autocomplete="off"
              bind:value={keyDrafts[field.env_key]}
            />
          </label>
        {/each}
      </div>
      <p class="settings-actions">
        <button type="button" class="btn primary" disabled={saving} onclick={() => void saveKeys()}>
          <Save size={14} strokeWidth={1.75} />
          {saving ? "Saving…" : "Save API keys"}
        </button>
      </p>
      {#if saveMessage}
        <p class="settings-sub" role="status">{saveMessage}</p>
      {/if}
    {/if}

    <h4>Feeds</h4>
    <div class="feed-table-wrap">
      <table class="feed-table">
        <thead>
          <tr>
            <th>Feed</th>
            <th>Status</th>
            <th>Poll interval</th>
            <th>Last cycle</th>
            <th>Success</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each catalog.feeds as feed (feed.name)}
            <tr>
              <td>
                <div class="feed-name">{feed.label}</div>
                <div class="feed-meta mono">{feed.name}</div>
                <a class="feed-link" href={feed.source_url} target="_blank" rel="noopener"
                  >API docs</a
                >
              </td>
              <td>
                <span class={statusClass(feed.connection)}>{connectionLabel(feed.connection)}</span>
                {#if feed.api_key_preview}
                  <div class="feed-meta mono">{feed.api_key_preview}</div>
                {/if}
                {#if feed.last_error}
                  <div class="feed-err" title={feed.last_error}>{feed.last_error}</div>
                {/if}
                {#if feedActionMsg[feed.name]}
                  <div class="feed-meta">{feedActionMsg[feed.name]}</div>
                {/if}
              </td>
              <td>
                <select
                  class="poll-select"
                  disabled={pollSaving === feed.name || feed.connection === "mode_off"}
                  value={feed.poll_interval_secs}
                  onchange={(e) =>
                    void onPollChange(feed, Number(e.currentTarget.value))}
                >
                  {#each catalog.poll_interval_options_secs as secs (secs)}
                    <option
                      value={secs}
                      disabled={secs < minPollIntervalSecs(feed.name)}
                    >
                      {pollIntervalLabel(secs)}
                      {#if secs === feed.default_poll_interval_secs}
                        (default){/if}
                    </option>
                  {/each}
                </select>
                {#if pollSaving === feed.name}
                  <div class="feed-meta">Saving…</div>
                {/if}
              </td>
              <td class="mono">
                {#if feed.worker_running}
                  <span class="ok">worker</span>
                {:else}
                  —
                {/if}
                <div class="feed-meta">last {formatLastPoll(feed.last_poll_at)}</div>
                <div class="feed-meta">next {formatNextPoll(feed.next_poll_at)}</div>
                {#if feed.last_events_accepted > 0 || feed.last_events_duplicate > 0}
                  <div class="feed-meta">
                    +<CompactNumber value={feed.last_events_accepted} /> new,
                    <CompactNumber value={feed.last_events_duplicate} /> dup
                  </div>
                {/if}
              </td>
              <td class="mono">
                <CompactNumber value={feed.success_count} />
                {#if feed.failure_count > 0}
                  <span class="err">
                    / <CompactNumber value={feed.failure_count} /> fail</span
                  >
                {/if}
              </td>
              <td class="feed-actions">
                <button
                  type="button"
                  class="btn btn-sm"
                  disabled={busyFeed === feed.name || feed.connection === "mode_off"}
                  title="Fetch once from the upstream API (no STDB write)"
                  onclick={() => void runTest(feed)}
                >
                  <Play size={12} />
                  Test
                </button>
                <button
                  type="button"
                  class="btn btn-sm"
                  disabled={busyFeed === feed.name || feed.connection === "needs_key" || feed.connection === "mode_off"}
                  title="Clear backoff, start worker, and test"
                  onclick={() => void runReconnect(feed)}
                >
                  <Link2 size={12} />
                  Reconnect
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <p class="settings-actions">
    <button type="button" class="btn" disabled={loading} onclick={() => void reload()}>
      <RefreshCw size={14} strokeWidth={1.75} />
      {loading ? "Refreshing…" : "Refresh feeds"}
    </button>
  </p>
</div>

<style>
  .feed-apis h4 {
    margin: var(--space-4) 0 var(--space-2);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-1);
  }
  .keys-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .key-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .key-label {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-1);
  }
  .key-desc {
    font-size: 11px;
    color: var(--text-3);
  }
  .key-preview {
    font-size: 11px;
  }
  .key-input {
    font: inherit;
    font-size: 12px;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
  }
  .feed-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
  }
  .feed-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .feed-table th,
  .feed-table td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--border-1);
    text-align: left;
    vertical-align: top;
  }
  .feed-table th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-3);
    background: var(--bg-2);
  }
  .feed-name {
    font-weight: 600;
    color: var(--text-1);
  }
  .feed-meta {
    font-size: 11px;
    color: var(--text-3);
    margin-top: 2px;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .feed-err {
    font-size: 11px;
    color: #f87171;
    margin-top: 4px;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .feed-link {
    font-size: 11px;
    color: var(--accent);
  }
  .poll-select {
    font: inherit;
    font-size: 11px;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    max-width: 160px;
  }
  .feed-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .btn-sm {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
  }
  .btn.primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-color: var(--accent);
    color: var(--text-1);
  }
  .warn {
    color: #fbbf24;
  }
  .mono {
    font-family: var(--font-mono);
  }
</style>
