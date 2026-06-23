

import type { Component } from "svelte";
import type { Icon as IconComponent } from "@lucide/svelte";


export interface MatrixPanel {
  readonly id: string;
  readonly title: string;
  readonly icon?: typeof IconComponent;
  readonly span: 1 | 2 | 3;
  readonly component: Component<Record<string, unknown>>;
  readonly props?: Record<string, unknown>;

  readonly tabId?: string;
}


export interface MatrixAiPanel {
  readonly title: string;
  readonly kicker?: string;
  readonly accent?: "accent" | "violet" | "rose" | "amber";
  readonly component: Component<Record<string, unknown>>;
  readonly props?: Record<string, unknown>;
}


export interface MatrixHeaderAction {
  readonly label: string;
  readonly icon?: typeof IconComponent;
  readonly variant?: "default" | "danger" | "primary";
  readonly command?: string;
}


export interface MatrixTab {
  readonly id: string;
  readonly label: string;
}

export interface MatrixCatalogEntry {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: typeof IconComponent;
  readonly accentDomain: string;
  readonly headerActions?: readonly MatrixHeaderAction[];
  readonly tabs?: readonly MatrixTab[];
  readonly panels: readonly MatrixPanel[];
  readonly aiPanel: MatrixAiPanel;
}
