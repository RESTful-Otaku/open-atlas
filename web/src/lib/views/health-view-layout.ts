export interface WidgetDef {
  id: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface HealthViewLayout {
  widgets: WidgetDef[];
}

const STORAGE_KEY = "openatlas-health-view-layout";

const DEFAULT_WIDGETS: Omit<WidgetDef, "order">[] = [
  { id: "service-cards", label: "Service Cards", visible: true },
  { id: "service-history", label: "Service Status Timeline", visible: true },
  { id: "feed-charts", label: "Feed Status & Circuit Breakers", visible: true },
  { id: "pipeline-charts", label: "Ingest Pipeline Charts", visible: true },
  { id: "traffic-charts", label: "Event Rate & Traffic", visible: true },
  { id: "feed-table", label: "Feed Details Table", visible: true },
  { id: "ingest-metrics", label: "Ingest Metrics", visible: true },
  { id: "event-log", label: "Event Log", visible: true },
];

export function defaultLayout(): HealthViewLayout {
  return {
    widgets: DEFAULT_WIDGETS.map((w, i) => ({ ...w, order: i })),
  };
}

export function loadLayout(): HealthViewLayout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultLayout();
    const parsed = JSON.parse(raw) as HealthViewLayout;
    if (!Array.isArray(parsed.widgets)) return defaultLayout();
    const ids = new Set(DEFAULT_WIDGETS.map((w) => w.id));
    const present = parsed.widgets.filter((w) => ids.has(w.id));
    if (!present.length) return defaultLayout();
    const presentIds = new Set(present.map((w) => w.id));
    const missing = DEFAULT_WIDGETS.filter((w) => !presentIds.has(w.id)).map((w, i) => ({
      ...w,
      order: present.length + i,
    }));
    const merged = [...present, ...missing].sort((a, b) => a.order - b.order);
    return { widgets: merged };
  } catch {
    return defaultLayout();
  }
}

export function saveLayout(layout: HealthViewLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* storage full or unavailable */
  }
}
