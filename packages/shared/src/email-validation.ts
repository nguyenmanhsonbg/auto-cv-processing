export function isEmailAddress(value?: string | null) {
  const normalized = value?.trim() ?? '';
  const atIndex = normalized.indexOf('@');
  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf('@')) return false;

  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (character.trim() === '' || codePoint < 0x20 || codePoint === 0x7f) return false;
  }

  const domain = normalized.slice(atIndex + 1);
  const dotIndex = domain.indexOf('.');
  return dotIndex > 0 && dotIndex < domain.length - 1;
}
