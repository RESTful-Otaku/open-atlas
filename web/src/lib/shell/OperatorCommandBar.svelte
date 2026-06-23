<script lang="ts">
  import { List, Settings as SettingsIcon } from "@lucide/svelte";
  import { navigate } from "../router.svelte";
  import { runOperatorLine } from "../operator-commands";

  let input = $state("");
  let showRecent = $state(false);
  let recent = $state<string[]>([]);
  let status = $state<{ kind: "idle" | "ok" | "err"; message: string }>({
    kind: "idle",
    message: "",
  });

  function record(cmd: string): void {
    const t = cmd.trim();
    if (!t) return;
    recent = [t, ...recent.filter((c) => c !== t)].slice(0, 8);
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const command = input.trim();
    if (!command) return;
    const r = runOperatorLine(command);
    record(command);
    status =
      r.kind === "ok"
        ? { kind: "ok", message: r.message }
        : { kind: "err", message: r.message };
    input = "";
  }

  function openSettings(): void {
    navigate("/settings");
  }
</script>

<div class="cmd-wrap">
  {#if showRecent && recent.length > 0}
    <ul class="cmd-recent" aria-label="Recent commands">
      {#each recent as c (c)}
        <li>
          <button
            type="button"
            class="cmd-recent-line mono"
            onclick={() => (input = c)}>{c}</button
          >
        </li>
      {/each}
    </ul>
  {/if}
  <form class="cmd-bar" onsubmit={submit} role="search">
    <span class="cmd-prompt" aria-hidden="true">&gt;_</span>
    <input
      type="text"
      class="cmd-input mono"
      placeholder="help · go /hub · domain energy · matrix threat…"
      bind:value={input}
      aria-label="Operator command"
    />
  {#if status.kind === "err"}
    <span class="cmd-status cmd-err" role="alert">{status.message}</span>
  {:else if status.kind === "ok"}
    <span class="cmd-status cmd-ok" role="status" title={status.message}
      >{status.message.length > 120
        ? status.message.slice(0, 117) + "…"
        : status.message}</span
    >
  {/if}
  <span class="spacer"></span>
  <button
    type="button"
    class="cmd-aux"
    class:cmd-aux-on={showRecent}
    title="Show recent commands"
    aria-pressed={showRecent}
    aria-label="Show recent commands"
    onclick={() => (showRecent = !showRecent)}
  >
    <List size={14} strokeWidth={1.75} />
  </button>
  <button
    type="button"
    class="cmd-aux"
    title="Open settings and integration"
    aria-label="Open settings and integration"
    onclick={openSettings}
  >
    <SettingsIcon size={14} strokeWidth={1.75} />
  </button>
  </form>
</div>

<style>
  .cmd-wrap {
    grid-area: cmd;
  }
  .cmd-recent {
    list-style: none;
    margin: 0;
    padding: var(--space-2) var(--space-5);
    background: var(--bg-2);
    border-top: 1px solid var(--border-1);
    font-size: 11px;
    max-height: 120px;
    overflow: auto;
  }
  .cmd-recent li {
    margin: 0;
  }
  .cmd-recent-line {
    display: block;
    width: 100%;
    text-align: left;
    padding: 4px 0;
    border: 0;
    background: none;
    color: var(--text-2);
    cursor: pointer;
    font-size: 11px;
  }
  .cmd-recent-line:hover {
    color: var(--accent);
  }
  .cmd-bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    background: var(--bg-1);
    border-top: 1px solid var(--border-1);
  }
  .cmd-prompt {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-3);
  }
  .cmd-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--text-1);
    font-size: 12px;
  }
  .cmd-input::placeholder {
    color: var(--text-3);
  }
  .cmd-status {
    font-size: 11px;
    max-width: min(420px, 40vw);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cmd-err {
    color: var(--sev-high);
  }
  .cmd-ok {
    color: var(--sev-low);
  }
  .cmd-aux {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    background: transparent;
    border: 1px solid var(--border-1);
    color: var(--text-2);
    cursor: pointer;
    transition:
      background var(--motion-fast) var(--ease),
      color var(--motion-fast) var(--ease);
  }
  .cmd-aux:hover {
    background: var(--overlay);
    color: var(--text-1);
  }
  .cmd-aux-on {
    background: var(--bg-3);
    border-color: var(--border-2);
  }
</style>
