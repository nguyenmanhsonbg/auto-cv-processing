export function stripHtmlTags(value: string) {
  let result = '';
  let cursor = 0;

  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor);
    if (tagStart < 0) return result + value.slice(cursor);

    result += value.slice(cursor, tagStart);
    const tagEnd = value.indexOf('>', tagStart + 1);
    if (tagEnd < 0) return result + value.slice(tagStart);
    cursor = tagEnd + 1;
  }

  return result;
}

export function removeHorizontalWhitespaceBeforeNewlines(value: string) {
  let result = '';
  let pendingWhitespace = '';

  for (const character of value) {
    if (character === ' ' || character === '\t') {
      pendingWhitespace += character;
      continue;
    }

    if (character === '\n') {
      result += '\n';
      pendingWhitespace = '';
      continue;
    }

    result += pendingWhitespace + character;
    pendingWhitespace = '';
  }

  return result + pendingWhitespace;
}

export function trimTrailingSlashes(value: string) {
  let normalized = value;
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  return normalized;
}
