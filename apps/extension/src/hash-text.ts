const UINT32_MODULUS = 0x1_0000_0000;
const INT32_SIGN_BIT = 0x8000_0000;

export function hashText(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    const wrappedHash = (
      (hash * 31 + value.charCodeAt(index)) % UINT32_MODULUS
      + UINT32_MODULUS
    ) % UINT32_MODULUS;
    const unsignedHash = Math.trunc(wrappedHash);
    hash = unsignedHash >= INT32_SIGN_BIT
      ? unsignedHash - UINT32_MODULUS
      : unsignedHash;
  }
  return Math.abs(hash).toString(36);
}
