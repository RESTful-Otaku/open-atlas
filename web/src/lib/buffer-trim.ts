/**
 * Helpers to avoid replacing reactive arrays when sort/trim yields identical data.
 */

export function sameOrderedIds(
  a: readonly { id: string }[],
  b: readonly { id: string }[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id) return false;
  }
  return true;
}

export function sameOrderedEvents(
  a: readonly { id: string; ordinal: number }[],
  b: readonly { id: string; ordinal: number }[],
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.id !== b[i]!.id || a[i]!.ordinal !== b[i]!.ordinal) return false;
  }
  return true;
}
