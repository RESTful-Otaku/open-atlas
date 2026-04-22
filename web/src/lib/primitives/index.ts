/**
 * Shared primitives for the OpenAtlas design system.
 *
 * Primitives are small, single-purpose components with closed prop
 * enums. They are the building blocks of every matrix/panel; use them
 * in preference to rolling bespoke markup so the visual language stays
 * consistent.
 *
 * When you find yourself copying a chip, a status dot, or a bar-and-%
 * pattern across panels, promote it here instead.
 */

export { default as SeverityChip } from "./SeverityChip.svelte";
export { default as StatusDot } from "./StatusDot.svelte";
export { default as NumericIndexBadge } from "./NumericIndexBadge.svelte";
export { default as TrendArrow } from "./TrendArrow.svelte";
export { default as BarBadge } from "./BarBadge.svelte";
export { default as LiveFeedPill } from "./LiveFeedPill.svelte";
export { default as PanelHeader } from "./PanelHeader.svelte";
export type { SeverityLevel, StatusLevel } from "./status";
export { bucketSeverity, bucketRisk } from "./status";
