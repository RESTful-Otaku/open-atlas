/**
 * View catalog — the plug-in contract for top-level pages.
 *
 * # Adding a view (two edits)
 *
 * 1. Create a `XxxView.svelte` component in this folder.
 * 2. Register it in `view-loaders.ts` and append metadata here.
 *
 * Route patterns must match entries in `ROUTE_TABLE` (see
 * `../router.svelte.ts`).
 */

import type { Icon as IconComponent } from "@lucide/svelte";
import {
  Boxes,
  ChartSpline,
  FileText,
  Globe2,
  LayoutDashboard,
  LayoutGrid,
  Map as MapIcon,
  PanelLeftDashed,
  Settings,
} from "@lucide/svelte";

import { MATRIX_CATALOG } from "../matrices/catalog";
import { DOMAIN_CATALOG } from "../colors";
import { domainIcon } from "../domain-icons";
import { DOMAIN_NAV_BLURB } from "./domain-nav-blurb";

const DEFAULT_MATRIX_PATH = `/matrix/${MATRIX_CATALOG[0]!.id}` as const;

export interface ViewCatalogEntry {
  readonly id: string;
  readonly pattern: string;
  readonly title: string;
  readonly navDescription?: string;
  readonly navHref?: string;
  readonly icon: typeof IconComponent;
  readonly nav: boolean;
}

const DOMAIN_VIEWS: readonly ViewCatalogEntry[] = DOMAIN_CATALOG.map(
  (d) =>
    ({
      id: `domain-${d.id}`,
      pattern: `/domain/${d.id}`,
      title: d.label,
      navDescription:
        DOMAIN_NAV_BLURB[d.id] ?? `Live signals and state — ${d.label}`,
      icon: domainIcon(d.id),
      nav: true,
    }) satisfies ViewCatalogEntry,
);

export const VIEW_CATALOG: readonly ViewCatalogEntry[] = [
  {
    id: "globe",
    pattern: "/",
    title: "3D Globe",
    navDescription: "Global globe, heat, and event POIs",
    icon: Globe2,
    nav: true,
  },
  {
    id: "map",
    pattern: "/map",
    title: "2D map",
    navDescription: "Flat map, same overlays — pan & zoom",
    icon: MapIcon,
    nav: true,
  },
  {
    id: "exec-hub",
    pattern: "/hub",
    title: "Hub",
    navDescription: "Executive tiles and cross-domain snapshot",
    icon: LayoutGrid,
    nav: true,
  },
  ...DOMAIN_VIEWS,
  {
    id: "matrix",
    pattern: "/matrix/:id",
    title: "Matrices",
    navDescription: "KPIs, triage, and domain command boards",
    navHref: DEFAULT_MATRIX_PATH,
    icon: PanelLeftDashed,
    nav: true,
  },
  {
    id: "viz",
    pattern: "/viz",
    title: "Visualizations",
    navDescription: "Charts, graphs, and map overlay gallery",
    icon: ChartSpline,
    nav: true,
  },
  {
    id: "entities",
    pattern: "/entities",
    title: "Entities",
    navDescription: "Entity search and field resolution",
    icon: Boxes,
    nav: true,
  },
  {
    id: "legacy",
    pattern: "/legacy",
    title: "Overview",
    navDescription: "KPIs, map, streams, and domain panels at a glance",
    icon: LayoutDashboard,
    nav: true,
  },
  {
    id: "event-detail",
    pattern: "/events/:id",
    title: "Event Detail",
    icon: FileText,
    nav: false,
  },
  {
    id: "settings",
    pattern: "/settings",
    title: "Settings",
    navDescription: "STDB, LLM, and demo mode",
    icon: Settings,
    nav: true,
  },
];

const BY_PATTERN: ReadonlyMap<string, ViewCatalogEntry> = new Map(
  VIEW_CATALOG.map((entry) => [entry.pattern, entry]),
);

export function viewForPattern(pattern: string): ViewCatalogEntry {
  return BY_PATTERN.get(pattern) ?? VIEW_CATALOG[0]!;
}

export function hrefForNavEntry(entry: ViewCatalogEntry): string {
  return entry.navHref ?? entry.pattern;
}
