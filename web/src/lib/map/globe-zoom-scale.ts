/**
 * Map camera altitude (globe.gl `pointOfView().altitude`) to layer scale factors.
 * Lower altitude = closer zoom = larger on-screen features.
 */

const REF_ALTITUDE = 2.28;

/** Multiplier for point radii, heat bandwidth, arc stroke, etc. */
export function zoomScaleFromAltitude(altitude: number): number {
  if (!Number.isFinite(altitude) || altitude <= 0) return 1;
  const raw = REF_ALTITUDE / Math.max(0.22, altitude);
  return Math.max(0.45, Math.min(2.75, raw));
}

/** Heatmap kernel bandwidth — tighter when zoomed in. */
export function heatmapBandwidthForZoom(altitude: number, base = 5.4): number {
  const z = zoomScaleFromAltitude(altitude);
  return base / z;
}

export function scaledPointRadius(baseR: number, altitude: number): number {
  return baseR * zoomScaleFromAltitude(altitude);
}

export function scaledArcStroke(baseW: number, altitude: number): number {
  return baseW * Math.sqrt(zoomScaleFromAltitude(altitude));
}
