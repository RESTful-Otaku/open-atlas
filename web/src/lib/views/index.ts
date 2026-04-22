/**
 * View catalog — the plug-in contract for top-level pages.
 *
 * # Adding a view (two edits)
 *
 * 1. Create a `XxxView.svelte` component in this folder.
 * 2. Append an entry to `VIEW_CATALOG` with its route pattern, title,
 *    and icon. Optional: `navDescription` / `navHref` for the left rail.
 *
 * Route patterns must match entries in `ROUTE_TABLE` (see
 * `../router.svelte.ts`).
 */

import type { Component } from "svelte";
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

import { MATRIX_CATALOG } from "../matrices";
import { DOMAIN_CATALOG } from "../colors";
import { domainIcon } from "../domain-icons";

import GlobeHomeView from "./GlobeHomeView.svelte";
import DomainView from "./DomainView.svelte";
import { DOMAIN_NAV_BLURB } from "./domain-nav-blurb";
import HubView from "./HubView.svelte";
import MapView from "./MapView.svelte";
import EntitiesView from "./EntitiesView.svelte";
import SettingsView from "./SettingsView.svelte";
import LegacyView from "./LegacyView.svelte";
import MatrixHostView from "./MatrixHostView.svelte";
import EventDetailView from "./EventDetailView.svelte";
import VizShowcaseView from "./VizShowcaseView.svelte";

const DEFAULT_MATRIX_PATH = `/matrix/${MATRIX_CATALOG[0]!.id}` as const;

export interface ViewCatalogEntry {
  readonly id: string;
  readonly pattern: string;
  readonly title: string;
  /**
   * Shown under the title when the left rail is expanded. Keep to one
   * short line; omit for icon-only + tooltip when collapsed.
   */
  readonly navDescription?: string;
  /**
   * If set, the rail and command palette navigate here instead of
   * `pattern` (needed for a default `/matrix/...` when `pattern` is
   * `/matrix/:id`).
   */
  readonly navHref?: string;
  readonly icon: typeof IconComponent;
  readonly component: Component;
  /** True if this entry should appear in the left-rail nav. */
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
      component: DomainView,
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
    component: GlobeHomeView,
    nav: true,
  },
  {
    id: "map",
    pattern: "/map",
    title: "2D map",
    navDescription: "Flat map, same overlays — pan & zoom",
    icon: MapIcon,
    component: MapView,
    nav: true,
  },
  {
    id: "exec-hub",
    pattern: "/hub",
    title: "Hub",
    navDescription: "Executive tiles and cross-domain snapshot",
    icon: LayoutGrid,
    component: HubView,
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
    component: MatrixHostView,
    nav: true,
  },
  {
    id: "viz",
    pattern: "/viz",
    title: "Visualizations",
    navDescription: "Charts, graphs, and map overlay gallery",
    icon: ChartSpline,
    component: VizShowcaseView,
    nav: true,
  },
  {
    id: "entities",
    pattern: "/entities",
    title: "Entities",
    navDescription: "Entity search and field resolution",
    icon: Boxes,
    component: EntitiesView,
    nav: true,
  },
  {
    id: "legacy",
    pattern: "/legacy",
    title: "Overview",
    navDescription: "KPIs, map, streams, and domain panels at a glance",
    icon: LayoutDashboard,
    component: LegacyView,
    nav: true,
  },
  {
    id: "event-detail",
    pattern: "/events/:id",
    title: "Event Detail",
    icon: FileText,
    component: EventDetailView,
    nav: false,
  },
  {
    id: "settings",
    pattern: "/settings",
    title: "Settings",
    navDescription: "STDB, LLM, and demo mode",
    icon: Settings,
    component: SettingsView,
    nav: true,
  },
];

const BY_PATTERN: ReadonlyMap<string, ViewCatalogEntry> = new Map(
  VIEW_CATALOG.map((entry) => [entry.pattern, entry]),
);

export function viewForPattern(pattern: string): ViewCatalogEntry {
  return BY_PATTERN.get(pattern) ?? VIEW_CATALOG[0]!;
}

/** Where the left rail and palette should send users for a catalog entry. */
export function hrefForNavEntry(entry: ViewCatalogEntry): string {
  return entry.navHref ?? entry.pattern;
}
