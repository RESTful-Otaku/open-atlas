export interface PanelLayoutState {
  readonly order: string[];
  readonly spans: Readonly<Record<string, number>>;
}
