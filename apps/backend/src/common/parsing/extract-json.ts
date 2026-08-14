function isJsonWhitespace(character: string | undefined) {
  return character === ' ' || character === '\t' || character === '\r' || character === '\n';
}

export function extractJsonFromText(text: string): unknown {
  const fenceStart = text.indexOf('```');
  if (fenceStart < 0) return JSON.parse(text.trim());

  let contentStart = fenceStart + 3;
  const language = text.slice(contentStart, contentStart + 4).toLowerCase();
  if (language === 'json') {
    const nextCharacter = text[contentStart + 4];
    if (nextCharacter !== undefined && !isJsonWhitespace(nextCharacter)) {
      return JSON.parse(text.trim());
    }
    contentStart += 4;
  }

  while (contentStart < text.length && isJsonWhitespace(text[contentStart])) {
    contentStart += 1;
  }

  const fenceEnd = text.indexOf('```', contentStart);
  const raw = fenceEnd >= 0 ? text.slice(contentStart, fenceEnd).trim() : text.trim();
  return JSON.parse(raw);
}
