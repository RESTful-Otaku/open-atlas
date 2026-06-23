

import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  ChartColumnIncreasing,
  PieChart,
  Cpu as CpuIcon,
  Flame,
  Gauge,
  HeartPulse,
  LineChart,
  List,
  Radio,
  ShieldAlert,
  Siren,
  Trees,
  Truck,
  Users,
  Waves,
} from "@lucide/svelte";

import type { Component } from "svelte";

import type { MatrixCatalogEntry } from "./types";
import FlashpointsPanel from "./bound/FlashpointsPanel.svelte";
import RiskIndexPanel from "./bound/RiskIndexPanel.svelte";
import SignalsPanel from "./bound/SignalsPanel.svelte";
import DomainKpiPanel from "./bound/DomainKpiPanel.svelte";
import AiSynthesisPanel from "./bound/AiSynthesisPanel.svelte";
import MatrixChartPanel from "./bound/MatrixChartPanel.svelte";
import { matrixChartKindForTab } from "./matrix-charts";

export type { MatrixCatalogEntry } from "./types";

const flashpoints = FlashpointsPanel as unknown as Component<Record<string, unknown>>;
const riskIndex = RiskIndexPanel as unknown as Component<Record<string, unknown>>;
const signals = SignalsPanel as unknown as Component<Record<string, unknown>>;
const domainKpi = DomainKpiPanel as unknown as Component<Record<string, unknown>>;
const aiSynth = AiSynthesisPanel as unknown as Component<Record<string, unknown>>;
const matrixChart = MatrixChartPanel as unknown as Component<Record<string, unknown>>;


const TAB = {
  overview: "overview",
  telemetry: "telemetry",
  incidents: "incidents",
} as const;

function standardPanels(
  matrixId: string,
  primaryDomain: string,
  scope: readonly string[],
): MatrixCatalogEntry["panels"] {
  return [
    {
      id: `${matrixId}-kpi`,
      title: "Domain snapshot",
      icon: Gauge,
      span: 2,
      tabId: TAB.overview,
      component: domainKpi,
      props: { domain: primaryDomain, columns: 4 },
    },
    {
      id: `${matrixId}-risk`,
      title: "Risk by domain",
      icon: ChartColumnIncreasing,
      span: 1,
      tabId: TAB.overview,
      component: riskIndex,
      props: { domains: scope },
    },
    {
      id: `${matrixId}-mchart-overview`,
      title: "Domain & severity composition",
      icon: PieChart,
      span: 3,
      tabId: TAB.overview,
      component: matrixChart,
      props: {
        domains: scope,
        kind: matrixChartKindForTab(matrixId, "overview"),
        accentDomain: primaryDomain,
      },
    },
    {
      id: `${matrixId}-flashpoints`,
      title: "Active flashpoints",
      icon: Flame,
      span: 2,
      tabId: TAB.incidents,
      component: flashpoints,
      props: { domains: scope, limit: 6 },
    },
    {
      id: `${matrixId}-mchart-incidents`,
      title: "Incident analytics",
      icon: BarChart3,
      span: 1,
      tabId: TAB.incidents,
      component: matrixChart,
      props: {
        domains: scope,
        kind: matrixChartKindForTab(matrixId, "incidents"),
        accentDomain: primaryDomain,
      },
    },
    {
      id: `${matrixId}-signals`,
      title: "Live telemetry",
      icon: Radio,
      span: 1,
      tabId: TAB.telemetry,
      component: signals,
      props: { domains: scope, limit: 10 },
    },
    {
      id: `${matrixId}-mchart-telemetry`,
      title: "Temporal & load patterns",
      icon: LineChart,
      span: 2,
      tabId: TAB.telemetry,
      component: matrixChart,
      props: {
        domains: scope,
        kind: matrixChartKindForTab(matrixId, "telemetry"),
        accentDomain: primaryDomain,
      },
    },
  ];
}

function standardTabs(): NonNullable<MatrixCatalogEntry["tabs"]> {
  return [
    { id: TAB.overview, label: "Overview" },
    { id: TAB.telemetry, label: "Telemetry" },
    { id: TAB.incidents, label: "Incidents" },
  ];
}

function aiCard(
  matrixId: string,
  title: string,
  kicker: string,
  accent: "accent" | "violet" | "rose" | "amber",
  scope: readonly string[],
): MatrixCatalogEntry["aiPanel"] {
  return {
    title,
    kicker,
    accent,
    component: aiSynth,
    props: { matrixId, scope, title, kicker, accent },
  };
}

export const MATRIX_CATALOG: readonly MatrixCatalogEntry[] = [
  {
    id: "threat",
    title: "Global Threat Matrix",
    subtitle: "Geopolitics & Conflict",
    icon: ShieldAlert,
    accentDomain: "geopolitics",
    headerActions: [
      {
        label: "Triage Top Threats",
        icon: Siren,
        variant: "danger",
        command: "triage",
      },
    ],
    tabs: standardTabs(),
    panels: standardPanels("threat", "geopolitics", [
      "geopolitics",
      "seismic",
      "climate",
    ]),
    aiPanel: aiCard(
      "threat",
      "AI Strategic Synthesis",
      "Analyst view",
      "rose",
      ["geopolitics", "seismic", "climate"],
    ),
  },
  {
    id: "economic",
    title: "Global Economic Matrix",
    subtitle: "Markets & Liquidity",
    icon: Banknote,
    accentDomain: "finance",
    tabs: standardTabs(),
    panels: standardPanels("economic", "finance", ["finance", "economy"]),
    aiPanel: aiCard(
      "economic",
      "AI Macro Synthesis",
      "Market view",
      "amber",
      ["finance", "economy"],
    ),
  },
  {
    id: "health",
    title: "Global Health Matrix",
    subtitle: "Outbreaks & Stress",
    icon: HeartPulse,
    accentDomain: "health",
    tabs: standardTabs(),
    panels: standardPanels("health", "health", ["health", "demographics"]),
    aiPanel: aiCard(
      "health",
      "Epidemiological Synthesis",
      "Health ops",
      "rose",
      ["health", "demographics"],
    ),
  },
  {
    id: "transport",
    title: "Global Transport Matrix",
    subtitle: "Flows & Corridors",
    icon: Truck,
    accentDomain: "transport",
    tabs: standardTabs(),
    panels: standardPanels("transport", "transport", [
      "transport",
      "infrastructure",
    ]),
    aiPanel: aiCard(
      "transport",
      "Transport Synthesis",
      "Logistics",
      "accent",
      ["transport", "infrastructure"],
    ),
  },
  {
    id: "cyber",
    title: "Global Cyber Matrix",
    subtitle: "Incidents & Exposure",
    icon: AlertTriangle,
    accentDomain: "cyber",
    tabs: standardTabs(),
    panels: standardPanels("cyber", "cyber", ["cyber", "infrastructure"]),
    aiPanel: aiCard(
      "cyber",
      "Cyber Posture Synthesis",
      "SOC view",
      "violet",
      ["cyber", "infrastructure"],
    ),
  },
  {
    id: "resource",
    title: "Global Resource Matrix",
    subtitle: "Commodities & Scarcity",
    icon: Trees,
    accentDomain: "energy",
    tabs: standardTabs(),
    panels: standardPanels("resource", "energy", [
      "energy",
      "climate",
      "geospatial",
    ]),
    aiPanel: aiCard(
      "resource",
      "Resource Synthesis",
      "Strategic reserves",
      "amber",
      ["energy", "climate", "geospatial"],
    ),
  },
  {
    id: "demographics",
    title: "Global Demographics Matrix",
    subtitle: "Migration & Density",
    icon: Users,
    accentDomain: "demographics",
    tabs: standardTabs(),
    panels: standardPanels("demographics", "demographics", [
      "demographics",
      "health",
      "geopolitics",
    ]),
    aiPanel: aiCard(
      "demographics",
      "Population Synthesis",
      "Demographer view",
      "rose",
      ["demographics", "health", "geopolitics"],
    ),
  },
  {
    id: "compute",
    title: "Global Compute Matrix",
    subtitle: "AI Compute & Telemetry",
    icon: CpuIcon,
    accentDomain: "infrastructure",
    tabs: standardTabs(),
    panels: [
      {
        id: "compute-kpi",
        title: "Infrastructure snapshot",
        icon: Gauge,
        span: 2,
        tabId: TAB.overview,
        component: domainKpi,
        props: { domain: "infrastructure", columns: 4 },
      },
      {
        id: "compute-risk",
        title: "Risk by domain",
        icon: ChartColumnIncreasing,
        span: 1,
        tabId: TAB.overview,
        component: riskIndex,
        props: { domains: ["infrastructure", "cyber", "energy"] },
      },
      {
        id: "compute-mchart-overview",
        title: "Domain & severity composition",
        icon: PieChart,
        span: 3,
        tabId: TAB.overview,
        component: matrixChart,
        props: {
          domains: ["infrastructure", "cyber", "energy"],
          kind: matrixChartKindForTab("compute", "overview"),
          accentDomain: "infrastructure",
        },
      },
      {
        id: "compute-signals",
        title: "Live telemetry",
        icon: Radio,
        span: 3,
        tabId: TAB.telemetry,
        component: signals,
        props: { domains: ["infrastructure", "cyber", "energy"], limit: 12 },
      },
      {
        id: "compute-mchart-telemetry",
        title: "Temporal & load patterns",
        icon: LineChart,
        span: 3,
        tabId: TAB.telemetry,
        component: matrixChart,
        props: {
          domains: ["infrastructure", "cyber", "energy"],
          kind: matrixChartKindForTab("compute", "telemetry"),
          accentDomain: "infrastructure",
        },
      },
      {
        id: "compute-events",
        title: "Recent node events",
        icon: Activity,
        span: 3,
        tabId: TAB.incidents,
        component: flashpoints,
        props: { domains: ["infrastructure", "cyber"], limit: 8 },
      },
      {
        id: "compute-mchart-incidents",
        title: "Incident analytics",
        icon: BarChart3,
        span: 3,
        tabId: TAB.incidents,
        component: matrixChart,
        props: {
          domains: ["infrastructure", "cyber", "energy"],
          kind: matrixChartKindForTab("compute", "incidents"),
          accentDomain: "infrastructure",
        },
      },
    ],
    aiPanel: aiCard(
      "compute",
      "Compute Synthesis",
      "Inference ops",
      "accent",
      ["infrastructure", "cyber"],
    ),
  },
];

const BY_ID: ReadonlyMap<string, MatrixCatalogEntry> = new Map(
  MATRIX_CATALOG.map((entry) => [entry.id, entry]),
);

export function matrixById(id: string): MatrixCatalogEntry | undefined {
  return BY_ID.get(id);
}

/** Silence unused-import lint on icons reserved for future matrix entries. */
void List;
void Waves;
