<!--
  Slim top bar for the redesigned shell. Shows the brand, the currently
  active view title, connection status, and a search / navigation affordance
  (opens the command palette; ⌘K is handled in Shell.svelte).
-->
<script lang="ts">
  import { Search } from "@lucide/svelte";
  import { router } from "../router.svelte";
  import { viewForPattern } from "../views";
  import SystemStatusBar from "../components/SystemStatusBar.svelte";

  interface Props {
    onopensearch?: () => void;
  }
  const { onopensearch }: Props = $props();

  const activeView = $derived(viewForPattern(router.match.pattern));
</script>

<header class="shell-top">
  <div class="shell-brand">
    <img
      class="brand-logo"
      src="/logo.png"
      width="28"
      height="28"
      alt=""
      decoding="async"
    />
    <span class="brand-wordmark">OpenAtlas</span>
    <span class="brand-divider" aria-hidden="true"></span>
    <span class="brand-view" title="Active view">{activeView.title}</span>
  </div>

  <button
    type="button"
    class="shell-search"
    aria-label="Open command palette and navigation"
    onclick={() => onopensearch?.()}
  >
    <Search size={14} strokeWidth={1.75} />
    <span class="shell-search-label">Search nodes, datasets, or type a command…</span>
    <kbd class="shell-search-kbd">⌘K</kbd>
  </button>

  <div class="shell-status">
    <SystemStatusBar />
  </div>
</header>

<style>
  .shell-top {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-3) var(--space-5);
    background: var(--bg-glass);
    backdrop-filter: saturate(160%) blur(12px);
    -webkit-backdrop-filter: saturate(160%) blur(12px);
    border-bottom: 1px solid var(--border-1);
  }

  .shell-brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .brand-logo {
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    object-fit: contain;
    flex-shrink: 0;
    box-shadow: var(--shadow-glow);
    background: color-mix(in srgb, var(--bg-2) 60%, transparent);
  }
  .brand-wordmark {
    font-size: 14px;
    color: var(--text-1);
  }
  .brand-divider {
    width: 1px;
    height: 16px;
    background: var(--border-2);
  }
  .brand-view {
    font-size: 12px;
    color: var(--text-2);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .shell-search {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 32px;
    padding: 0 var(--space-3);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius);
    color: var(--text-3);
    font-size: 12px;
    width: 100%;
    max-width: 520px;
    justify-self: center;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .shell-search:hover {
    border-color: var(--border-2);
    color: var(--text-2);
  }
  .shell-search-label {
    flex: 1;
  }
  .shell-search-kbd {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-3);
    padding: 2px 6px;
    border: 1px solid var(--border-1);
    border-radius: var(--radius-xs);
    background: var(--overlay);
  }

  .shell-status {
    justify-self: end;
  }

  @media (max-width: 960px) {
    .shell-top {
      grid-template-columns: 1fr auto;
    }
    .shell-search {
      display: none;
    }
  }
</style>
