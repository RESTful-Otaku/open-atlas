<script lang="ts">
  type Block =
    | { kind: "h1" | "h2" | "h3"; text: string }
    | { kind: "li"; text: string }
    | { kind: "p"; text: string };

  let { source = "" }: { source: string } = $props();

  function inlineHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  function parse(md: string): Block[] {
    const blocks: Block[] = [];
    for (const line of md.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith("### ")) blocks.push({ kind: "h3", text: t.slice(4) });
      else if (t.startsWith("## ")) blocks.push({ kind: "h2", text: t.slice(3) });
      else if (t.startsWith("# ")) blocks.push({ kind: "h1", text: t.slice(2) });
      else if (t.startsWith("- ")) blocks.push({ kind: "li", text: t.slice(2) });
      else blocks.push({ kind: "p", text: t });
    }
    return blocks;
  }

  const blocks = $derived(parse(source));
</script>

<article class="briefing-md">
  {#each blocks as block, i (i)}
    {#if block.kind === "h1"}
      <h2 class="briefing-md-h1">{@html inlineHtml(block.text)}</h2>
    {:else if block.kind === "h2"}
      <h3 class="briefing-md-h2">{@html inlineHtml(block.text)}</h3>
    {:else if block.kind === "h3"}
      <h4 class="briefing-md-h3">{@html inlineHtml(block.text)}</h4>
    {:else if block.kind === "li"}
      <p class="briefing-md-li">• {@html inlineHtml(block.text)}</p>
    {:else}
      <p class="briefing-md-p">{@html inlineHtml(block.text)}</p>
    {/if}
  {/each}
</article>

<style>
  .briefing-md {
    font-size: 0.88rem;
    line-height: 1.55;
    color: var(--text-1);
    max-height: min(52vh, 520px);
    overflow-y: auto;
    padding-right: 0.25rem;
  }
  .briefing-md-h1 {
    margin: 0 0 0.5rem 0;
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-1);
  }
  .briefing-md-h2 {
    margin: 1rem 0 0.35rem 0;
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--accent);
  }
  .briefing-md-h3 {
    margin: 0.75rem 0 0.25rem 0;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-2);
  }
  .briefing-md-p,
  .briefing-md-li {
    margin: 0.35rem 0;
    color: var(--text-2);
  }
  .briefing-md-li {
    padding-left: 0.25rem;
  }
  .briefing-md :global(strong) {
    color: var(--text-1);
    font-weight: 600;
  }
</style>
