

export type DataMode = "live" | "demo";

export function geoMapTitle(mode: DataMode): string {
  return mode === "demo"
    ? "Geographic distribution (synthetic anchors)"
    : "Geographic distribution (live events)";
}

export function geoMapCaption(mode: DataMode, pointCount: number): string {
  const plot = `${pointCount} points · equirectangular plot`;
  return mode === "demo"
    ? `${plot} · demo seed`
    : `${plot} · SpacetimeDB`;
}

export function geoMapAsideCopy(mode: DataMode): string {
  return mode === "demo"
    ? "Dots are event anchors from the demo seed — density follows domain packs (ports, grids, trenches). The main 2D map uses the same filter for full MapLibre context."
    : "Dots are geotagged events streamed from SpacetimeDB for this domain. The main map uses the same filter with live MapLibre layers.";
}

export function deskGeoNote(mode: DataMode): string {
  return mode === "demo"
    ? "Use the mini map below for geo-dense domains; coordinates are synthetic anchors from the demo seed."
    : "Use the mini map below for geo-dense domains; coordinates are live event locations from SpacetimeDB.";
}

export function showSyntheticMarketTape(mode: DataMode, deskProfile: string): boolean {
  return mode === "demo" && deskProfile === "markets";
}
