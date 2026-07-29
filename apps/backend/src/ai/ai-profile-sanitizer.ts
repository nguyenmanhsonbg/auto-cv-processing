const CANDIDATE_IDENTITY_KEYS = new Set([
  'name',
  'fullName',
  'email',
  'phone',
  'birthYear',
  'dateOfBirth',
  'dob',
  'gender',
  'sex',
  'photo',
  'image',
  'avatar',
  'address',
]);

const RAW_CV_KEYS = new Set(['rawText', 'normalizedText', 'cleanCvText']);

function sanitizeObject(
  value: Record<string, unknown>,
  stripIdentityKeys = true,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => (!stripIdentityKeys || !CANDIDATE_IDENTITY_KEYS.has(key)) && !RAW_CV_KEYS.has(key))
      .map(([key, entry]) => [
        key,
        key === 'parsedProfile' && entry && typeof entry === 'object'
          ? sanitizeObject(entry as Record<string, unknown>, true)
          : sanitizeValue(entry),
      ]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === 'object') return sanitizeObject(value as Record<string, unknown>, false);
  return value;
}

export function sanitizeProfileForAi(profile: Record<string, unknown>): Record<string, unknown> {
  return sanitizeObject(profile);
}
