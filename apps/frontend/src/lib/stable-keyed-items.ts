export function stableKeyedItems<T>(
  items: readonly T[],
  keyFor: (item: T) => string | undefined,
  prefix: string,
) {
  const occurrences = new Map<string, number>();

  return items.map((item, position) => {
    const base = `${prefix}-${keyFor(item) || 'item'}`;
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);

    return {
      item,
      key: occurrence === 0 ? base : `${base}-${occurrence}`,
      position,
    };
  });
}
