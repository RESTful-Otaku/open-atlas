

const KEY = "openatlas-hub-domain-filter:v1";

export function loadSelectedHubDomain(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw || raw === "null") return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveSelectedHubDomain(domain: string | null): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (domain === null) {
      sessionStorage.removeItem(KEY);
    } else {
      sessionStorage.setItem(KEY, domain);
    }
  } catch {

  }
}
