<!--
  Stacked toasts: bottom-right, live region, manual dismiss, springy enter
  and slide fade exit. Paired with `notify.ts` + `notify-log.svelte`.
-->
<script lang="ts">
  import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from "@lucide/svelte";
  import { backOut, cubicIn } from "svelte/easing";
  import { fly } from "svelte/transition";
  import { toasts, dismissToast, type ToastItem } from "./toast-state.svelte";

  const icon = (l: ToastItem["level"]) => {
    if (l === "success") return CheckCircle;
    if (l === "warning") return AlertTriangle;
    if (l === "error") return AlertCircle;
    return Info;
  };

  const levelClass = (l: ToastItem["level"]) => `toast--${l}`;
</script>

<div
  class="toast-a11y"
  role="log"
  aria-relevant="additions"
  aria-live="polite"
  aria-atomic="false"
>
  <ol class="toast-stack" aria-label="Notifications">
    {#each toasts.items as t (t.id)}
      {@const I = icon(t.level)}
      <li class="toast-wrap">
        <div
          class="toast {levelClass(t.level)}"
          in:fly={{ x: 56, y: 10, duration: 420, opacity: 0, easing: backOut }}
          out:fly={{ x: 40, y: 6, duration: 220, opacity: 0, easing: cubicIn }}
        >
          <div class="toast-icon" aria-hidden="true">
            <I size={18} strokeWidth={1.75} />
          </div>
          <div class="toast-body">
            <div class="toast-headline">
              <span class="toast-title">{t.title}</span>
              <span class="toast-code" title="Support / diagnostics code">{t.code}</span>
            </div>
            <p class="toast-msg">{t.message}</p>
            {#if t.detail}
              <pre class="toast-detail">{t.detail}</pre>
            {/if}
            {#if t.action}
              <p class="toast-action"><strong>What to do:</strong> {t.action}</p>
            {/if}
          </div>
          <button
            type="button"
            class="toast-dismiss"
            aria-label="Dismiss notification"
            onclick={() => dismissToast(t.id)}
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </li>
    {/each}
  </ol>
</div>

<style>
  .toast-a11y {
    position: fixed;
    right: 0;
    bottom: 0;
    z-index: 2500;
    display: flex;
    justify-content: flex-end;
    align-items: flex-end;
    max-height: 100dvh;
    width: 100%;
    max-width: 100vw;
    box-sizing: border-box;
    padding: 0.75rem 0.9rem 0.85rem;
    pointer-events: none;
  }
  .toast-stack {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    align-items: flex-end;
    max-width: min(22.5rem, calc(100vw - 1.2rem));
    pointer-events: auto;
  }
  .toast-wrap {
    list-style: none;
    margin: 0;
  }
  .toast {
    position: relative;
    display: flex;
    flex-direction: row;
    gap: 0.55rem;
    width: 100%;
    padding: 0.65rem 0.5rem 0.65rem 0.7rem;
    border-radius: var(--radius);
    background: var(--bg-glass);
    backdrop-filter: saturate(150%) blur(10px);
    -webkit-backdrop-filter: saturate(150%) blur(10px);
    border: 1px solid var(--border-1);
    box-shadow: var(--shadow);
    --toast-accent: var(--accent);
  }
  .toast--info {
    --toast-accent: color-mix(in srgb, var(--accent) 80%, #fff 20%);
  }
  .toast--success {
    --toast-accent: var(--sev-low);
  }
  .toast--warning {
    --toast-accent: var(--status-warn);
  }
  .toast--error {
    --toast-accent: var(--status-err);
  }
  .toast {
    box-shadow: var(--shadow), 0 0 0 1px
        color-mix(in srgb, var(--toast-accent) 20%, transparent) inset;
    background: color-mix(in srgb, var(--bg-1) 91%, var(--toast-accent) 8%);
  }
  .toast::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0.45rem;
    bottom: 0.45rem;
    width: 3px;
    border-radius: 2px;
    background: var(--toast-accent);
    opacity: 0.9;
  }
  .toast-icon {
    flex-shrink: 0;
    margin-top: 0.1rem;
    color: var(--toast-accent);
  }
  .toast--error .toast-icon {
    color: color-mix(in srgb, var(--status-err) 90%, #fff 10%);
  }
  .toast--warning .toast-icon {
    color: color-mix(in srgb, var(--status-warn) 85%, #fff 15%);
  }
  .toast--success .toast-icon {
    color: color-mix(in srgb, var(--sev-low) 85%, #fff 15%);
  }
  .toast-body {
    flex: 1;
    min-width: 0;
  }
  .toast-headline {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.4rem 0.6rem;
    margin-bottom: 0.2rem;
  }
  .toast-title {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-1);
    letter-spacing: -0.01em;
  }
  .toast-code {
    font: 0.65rem / 1.2 var(--font-mono);
    font-weight: 500;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    background: color-mix(in srgb, var(--text-muted) 12%, var(--bg-0));
  }
  .toast-msg {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--text-2);
  }
  .toast-detail {
    margin: 0.35rem 0 0;
    padding: 0.3rem 0.4rem;
    font: 0.64rem/1.35 var(--font-mono);
    color: var(--text-3);
    background: color-mix(in srgb, var(--bg-0) 60%, var(--text-muted) 4%);
    border: 1px solid var(--border-1);
    border-radius: 5px;
    max-height: 5rem;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .toast-action {
    margin: 0.4rem 0 0;
    font-size: 0.72rem;
    line-height: 1.4;
    color: var(--text-2);
  }
  .toast-action strong {
    color: var(--text-1);
  }
  .toast-dismiss {
    flex-shrink: 0;
    display: flex;
    align-items: flex-start;
    align-self: flex-start;
    width: 28px;
    height: 28px;
    margin: -0.1rem 0 0 0;
    border: none;
    border-radius: 6px;
    color: var(--text-3);
    background: transparent;
    cursor: pointer;
    transition:
      color var(--motion-fast) var(--ease),
      background var(--motion-fast) var(--ease);
  }
  .toast-dismiss:hover {
    color: var(--text-1);
    background: var(--overlay);
  }
  @media (max-width: 480px) {
    .toast-a11y {
      padding: 0.4rem 0.45rem 0.55rem;
    }
  }
</style>
