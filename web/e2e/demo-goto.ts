import type { Page } from "@playwright/test";

/** Demo mode entry; hash paths match `router.svelte.ts` (e.g. `/settings` → `#/settings`). */
export async function gotoDemo(
  page: Page,
  hashPath: string = "/",
): Promise<void> {
  const fragment = hashPath.startsWith("#")
    ? hashPath
    : hashPath.startsWith("/")
      ? `#${hashPath}`
      : `#/${hashPath}`;
  await page.goto(`/?demo=1${fragment}`, { waitUntil: "domcontentloaded" });
}
