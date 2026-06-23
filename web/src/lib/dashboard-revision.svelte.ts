export const dashboardData = $state({
  revision: 0,

  domainsRevision: 0,
});

export function bumpDashboardRevision(): void {
  dashboardData.revision += 1;
}

export function bumpDomainsRevision(): void {
  dashboardData.domainsRevision += 1;
}
