type StableJsonValue =
  | null
  | boolean
  | number
  | string
  | StableJsonValue[]
  | { [key: string]: StableJsonValue };

export function stableStringify(value: unknown): string {
  const stableValue = toStableJsonValue(value, new WeakSet<object>());
  return JSON.stringify(stableValue === undefined ? null : stableValue);
}

function toStableJsonValue(
  value: unknown,
  seen: WeakSet<object>,
): StableJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (typeof value === 'string' || typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    throw new TypeError('BigInt values cannot be stable stringified.');
  }

  if (typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError('Cannot stable stringify circular structure.');
    }

    seen.add(value);
    try {
      return value.map((item) => {
        const stableItem = toStableJsonValue(item, seen);
        return stableItem === undefined ? null : stableItem;
      });
    } finally {
      seen.delete(value);
    }
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      throw new TypeError('Cannot stable stringify circular structure.');
    }

    seen.add(value);
    try {
      const record = value as Record<string, unknown>;
      return Object.keys(record)
        .sort()
        .reduce<{ [key: string]: StableJsonValue }>((accumulator, key) => {
          const stableItem = toStableJsonValue(record[key], seen);
          if (stableItem !== undefined) {
            accumulator[key] = stableItem;
          }
          return accumulator;
        }, {});
    } finally {
      seen.delete(value);
    }
  }

  return null;
}
