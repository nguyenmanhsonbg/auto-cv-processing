const UINT32_RANGE = 0x1_0000_0000;

interface SecureCryptoApi {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
  randomUUID?: () => string;
}

function getCrypto(): SecureCryptoApi {
  const cryptoApi = (globalThis as typeof globalThis & { crypto?: SecureCryptoApi }).crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Web Crypto API is required for secure random values.');
  }
  return cryptoApi;
}

export function secureRandomFraction(): number {
  const values = new Uint32Array(1);
  getCrypto().getRandomValues(values);
  return values[0] / UINT32_RANGE;
}

export function secureRandomUUID(): string {
  const cryptoApi = getCrypto();
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
