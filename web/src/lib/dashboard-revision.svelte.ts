/**
 * Monotonic counter bumped once per dashboard flush — heavy viz should
 * depend on `dashboardRevision` instead of deep-reading `dashboard.events`.
 */
export const dashboardData = $state({
  revision: 0,
  /** Domain-state / insights revision (lighter than full events). */
  domainsRevision: 0,
});

export function bumpDashboardRevision(): void {
  dashboardData.revision += 1;
}

export function bumpDomainsRevision(): void {
  dashboardData.domainsRevision += 1;
}
