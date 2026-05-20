<!--
  /map: full-bleed Mercator map (no globe tilt) with the same data layers
  as the home view — pan, zoom, and rotate bearing only.
-->
<script lang="ts">
  import WorldMap from "../components/WorldMap.svelte";
</script>

<div class="map-page">
  <WorldMap embedded={false} projection="mercator" />
</div>

<style>
  .map-page {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-height: 0;
    height: 100%;
  }
</style>
