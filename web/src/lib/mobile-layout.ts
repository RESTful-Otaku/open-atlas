export const MOBILE_LAYOUT_MQ = "(max-width: 768px)";
export const TABLET_LAYOUT_MQ = "(min-width: 769px) and (max-width: 1024px)";
export const COMPACT_LAYOUT_MQ = "(max-width: 1024px)";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
};

let mobileLayoutFlag = false;
let tabletLayoutFlag = false;
let compactLayoutFlag = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function capacitorGlobal(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNativeApp(): boolean {
  return capacitorGlobal()?.isNativePlatform?.() === true;
}


export function isMobileLayout(): boolean {
  return mobileLayoutFlag;
}


export function isTabletLayout(): boolean {
  return tabletLayoutFlag;
}


export function isCompactLayout(): boolean {
  return compactLayoutFlag;
}


export function subscribeMobileLayout(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setDataset(html: HTMLElement, key: string, active: boolean): void {
  if (active) {
    html.dataset[key] = "true";
  } else {
    delete html.dataset[key];
  }
}

function computeLayoutFlags(): {
  mobile: boolean;
  tablet: boolean;
  compact: boolean;
} {
  if (typeof window === "undefined") {
    return { mobile: false, tablet: false, compact: false };
  }
  const native = isNativeApp();
  const mobile = window.matchMedia(MOBILE_LAYOUT_MQ).matches || native;
  const tablet =
    !native && window.matchMedia(TABLET_LAYOUT_MQ).matches;
  const compact =
    window.matchMedia(COMPACT_LAYOUT_MQ).matches || native;
  return { mobile, tablet, compact };
}

function applyLayout(): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const { mobile, tablet, compact } = computeLayoutFlags();
  mobileLayoutFlag = mobile;
  tabletLayoutFlag = tablet;
  compactLayoutFlag = compact;
  setDataset(html, "mobileLayout", mobile);
  setDataset(html, "tabletLayout", tablet);
  setDataset(html, "compactLayout", compact);
  notify();
}

export async function initMobileShell(): Promise<() => void> {
  if (typeof document === "undefined") return () => {};

  const html = document.documentElement;

  if (isNativeApp()) {
    html.dataset.native = "true";
    try {
      const { StatusBar, Style } = await import("@capacitor/status-bar");
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: "#09090b" });
    } catch {
      /* optional */
    }
  }

  applyLayout();
  const mqs = [
    window.matchMedia(MOBILE_LAYOUT_MQ),
    window.matchMedia(TABLET_LAYOUT_MQ),
    window.matchMedia(COMPACT_LAYOUT_MQ),
  ];
  for (const mq of mqs) {
    mq.addEventListener("change", applyLayout);
  }
  return () => {
    for (const mq of mqs) {
      mq.removeEventListener("change", applyLayout);
    }
  };
}


export function bootstrapMobileLayout(): void {
  applyLayout();
}
