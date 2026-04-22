<!--
  Default home: full-bleed 3D Earth (Three.js + globe.gl — textured sphere, full
  orbit, zoom). 2D / embedded maps use MapLibre. Live data from SpacetimeDB.
-->
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
    min-height: 0;
    flex: 1;
  }
</style>
