<script lang="ts">
  import WorldMap from "../components/WorldMap.svelte";
</script>

<div class="globe-page">
  <WorldMap embedded={false} projection="globe" />
</div>

<style>
  .globe-page {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
  }
</style>
