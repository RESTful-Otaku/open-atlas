<!--
  Route handler for `/matrix/:id`. Looks the id up in MATRIX_CATALOG and
  renders the generic MatrixView, or a structured "unknown" state if
  the id doesn't exist.
-->
<script lang="ts">
  import { router, navigate } from "../router.svelte";
  import { matrixById, MatrixView } from "../matrices";

  const matrixId = $derived(router.match.params.id ?? "");
  const matrix = $derived(matrixById(matrixId));
</script>

{#if matrix}
  <MatrixView {matrix} />
{:else}
  <section class="matrix-unknown">
    <h2>Unknown matrix</h2>
    <p>No matrix is registered under <code>{matrixId}</code>.</p>
    <button type="button" onclick={() => navigate("/hub")}>
      Back to executive hub
    </button>
  </section>
{/if}

<style>
  .matrix-unknown {
    padding: var(--space-10);
    max-width: 480px;
    margin: 0 auto;
    text-align: center;
  }
  .matrix-unknown h2 {
    margin-top: 0;
    font-size: 18px;
    color: var(--text-1);
  }
  .matrix-unknown p {
    color: var(--text-2);
    margin: var(--space-2) 0 var(--space-5);
  }
  code {
    font-family: var(--font-mono);
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: var(--radius-xs);
    padding: 1px 6px;
  }
  button {
    padding: 8px 14px;
    border-radius: var(--radius);
    border: 1px solid var(--border-1);
    background: var(--bg-2);
    color: var(--text-1);
    cursor: pointer;
  }
  button:hover {
    background: var(--bg-3);
  }
</style>
