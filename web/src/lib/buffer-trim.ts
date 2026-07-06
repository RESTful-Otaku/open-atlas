

export function sameOrderedIds(
  a: readonly { id: string }[],
  b: readonly { id: string }[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => b[i] !== undefined && item.id === b[i].id);
}

export function sameOrderedEvents(
  a: readonly { id: string; ordinal: number }[],
  b: readonly { id: string; ordinal: number }[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, i) => b[i] !== undefined && item.id === b[i].id && item.ordinal === b[i].ordinal,
  );
}
