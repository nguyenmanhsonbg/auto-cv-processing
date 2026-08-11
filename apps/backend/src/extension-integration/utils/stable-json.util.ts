type StableJsonValue =
  | null
  | boolean
  | number
  | string
  | StableJsonValue[]
  | { [key: string]: StableJsonValue };

type PrimitiveConversion =
  | { handled: true; value: StableJsonValue | undefined }
  | { handled: false };

export function stableStringify(value: unknown): string {
  const stableValue = toStableJsonValue(value, new WeakSet<object>());
  return JSON.stringify(stableValue === undefined ? null : stableValue);
}

function toStableJsonValue(
  value: unknown,
  seen: WeakSet<object>,
): StableJsonValue | undefined {
  const primitive = convertPrimitive(value);
  if (primitive.handled) return primitive.value;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (Array.isArray(value)) {
    return toStableArray(value, seen);
  }

  if (value !== null && typeof value === 'object') {
    return toStableObject(value, seen);
  }

  return null;
}

function convertPrimitive(value: unknown): PrimitiveConversion {
  if (value === undefined || value === null) return { handled: true, value };
  if (typeof value === 'string' || typeof value === 'boolean') return { handled: true, value };
  if (typeof value === 'number') {
    return { handled: true, value: Number.isFinite(value) ? value : null };
  }
  if (typeof value === 'bigint') {
    throw new TypeError('BigInt values cannot be stable stringified.');
  }
  if (typeof value === 'function' || typeof value === 'symbol') return { handled: true, value: undefined };
  return { handled: false };
}

function toStableArray(value: unknown[], seen: WeakSet<object>): StableJsonValue[] {
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

function toStableObject(value: object, seen: WeakSet<object>): { [key: string]: StableJsonValue } {
  if (seen.has(value)) {
    throw new TypeError('Cannot stable stringify circular structure.');
  }

  seen.add(value);
  try {
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .reduce<{ [key: string]: StableJsonValue }>((accumulator, key) => {
        const stableItem = toStableJsonValue(record[key], seen);
        if (stableItem !== undefined) accumulator[key] = stableItem;
        return accumulator;
      }, {});
  } finally {
    seen.delete(value);
  }
}
