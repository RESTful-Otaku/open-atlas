/**
 * User layout overrides: panel order and column span. Persisted in
 * sessionStorage so a tab close clears tweaks (see `persist.ts`).
 */
export interface PanelLayoutState {
  readonly order: string[];
  readonly spans: Readonly<Record<string, number>>;
}
