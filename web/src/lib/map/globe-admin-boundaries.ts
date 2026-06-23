const COUNTRIES_URL =
  "https://cdn.jsdelivr.net/gh/datasets/geo-countries-master/data/countries.geojson";

export type AdminFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { name?: string; ADMIN?: string; ISO_A3?: string }
>;

let cache: GeoJSON.FeatureCollection | null = null;
let loadPromise: Promise<GeoJSON.FeatureCollection> | null = null;

export function loadAdminBoundaries(): Promise<GeoJSON.FeatureCollection> {
  if (cache) return Promise.resolve(cache);
  if (!loadPromise) {
    loadPromise = fetch(COUNTRIES_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`countries geojson ${r.status}`);
        return r.json() as Promise<GeoJSON.FeatureCollection>;
      })
      .then((fc) => {
        cache = fc;
        return fc;
      })
      .catch(() => {
        cache = { type: "FeatureCollection", features: [] };
        return cache;
      });
  }
  return loadPromise;
}

export function adminLabel(
  props: Record<string, unknown> | null | undefined,
): string {
  if (!props) return "Region";
  const n = props.name ?? props.ADMIN ?? props.ISO_A3;
  return typeof n === "string" && n.length > 0 ? n : "Region";
}
