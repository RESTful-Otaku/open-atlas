/**
 * Shared types for the matrix framework.
 *
 * A matrix page is declared as data: one entry in {@link
 * MatrixCatalogEntry} with a list of panels, an AI card, and optional
 * header actions and tabs. The generic `MatrixView.svelte` component
 * renders any matrix that conforms to this shape, so adding a new
 * matrix is a matter of: (1) registering its entry, (2) optionally
 * writing new panel components if none of the shared ones fit.
 *
 * This file is intentionally type-only — keeping the contract in one
 * module makes the registry's shape obvious and lets panel components
 * import without dragging in the whole catalog.
 */

import type { Component } from "svelte";
import type { Icon as IconComponent } from "@lucide/svelte";

/**
 * A single panel on a matrix page. `component` is the Svelte component
 * that renders the content; `props` is an arbitrary object passed
 * through verbatim. The framework does not interpret props — panels own
 * their own data projection.
 */
export interface MatrixPanel {
  readonly id: string;
  readonly title: string;
  readonly icon?: typeof IconComponent;
  readonly span: 1 | 2 | 3;
  readonly component: Component<Record<string, unknown>>;
  readonly props?: Record<string, unknown>;
  /**
   * When the matrix defines {@link MatrixCatalogEntry.tabs}, only panels
   * whose `tabId` matches the active tab are shown. Panels with no `tabId`
   * are shown on every tab (rare — prefer explicit ids).
   */
  readonly tabId?: string;
}

/**
 * The AI synthesis card that appears in the right rail of every matrix.
 * Shape mirrors a standard `MatrixPanel` but is treated specially by
 * the layout (always pinned, never in the main grid).
 */
export interface MatrixAiPanel {
  readonly title: string;
  readonly kicker?: string;
  readonly accent?: "accent" | "violet" | "rose" | "amber";
  readonly component: Component<Record<string, unknown>>;
  readonly props?: Record<string, unknown>;
}

/**
 * Header action on the matrix page. `command` is handled in
 * `MatrixView.svelte` (e.g. `triage` → Incidents tab, or a `/path` for
 * `navigate`).
 */
export interface MatrixHeaderAction {
  readonly label: string;
  readonly icon?: typeof IconComponent;
  readonly variant?: "default" | "danger" | "primary";
  readonly command?: string;
}

/**
 * Tab definition. Tabs filter the set of events the panels render; the
 * filter predicate is evaluated by each panel via a shared context (see
 * `MatrixView.svelte`).
 */
export interface MatrixTab {
  readonly id: string;
  readonly label: string;
}

export interface MatrixCatalogEntry {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: typeof IconComponent;
  /**
   * Primary domain colour accent. Usually the entry's dominant
   * {@link DOMAIN_CATALOG} id; some matrices (e.g. threat) span several
   * domains and pick the most representative one.
   */
  readonly accentDomain: string;
  readonly headerActions?: readonly MatrixHeaderAction[];
  readonly tabs?: readonly MatrixTab[];
  readonly panels: readonly MatrixPanel[];
  readonly aiPanel: MatrixAiPanel;
}
