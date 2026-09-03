const VIETNAM_TIMEZONE_OFFSET_MINUTES = 7 * 60;

const LOCAL_DATE_TIME_PATTERN = /^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;

export function parseApplicationDateTime(value: string | null | undefined): Date | null {
  const normalizedValue = value?.trim();
  if (!normalizedValue) return null;

  const localDateTimeMatch = normalizedValue.match(LOCAL_DATE_TIME_PATTERN);
  if (localDateTimeMatch) {
    const [, first, second, third, hour = '0', minute = '0', seconds = '0', milliseconds = '0'] = localDateTimeMatch;
    const yearFirst = first.length === 4;
    const year = Number(yearFirst ? first : third);
    const month = Number(second);
    const day = Number(yearFirst ? third : first);
    const hourValue = Number(hour);
    const minuteValue = Number(minute);
    const secondValue = Number(seconds);
    const millisecondValue = Number(milliseconds.padEnd(3, '0'));

    return createVietnamLocalDate(
      year,
      month,
      day,
      hourValue,
      minuteValue,
      secondValue,
      millisecondValue,
    );
  }

  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatApplicationDateTime(value: string | null | undefined): string | null {
  const date = parseApplicationDateTime(value);
  if (!date) return null;

  const vietnamDate = new Date(date.getTime() + VIETNAM_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  const pad = (part: number) => String(part).padStart(2, '0');

  return `${pad(vietnamDate.getUTCDate())}/${pad(vietnamDate.getUTCMonth() + 1)}/${vietnamDate.getUTCFullYear()} ${pad(vietnamDate.getUTCHours())}:${pad(vietnamDate.getUTCMinutes())}`;
}

function createVietnamLocalDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
) {
  if (
    year < 1000
    || month < 1
    || month > 12
    || day < 1
    || hour < 0
    || hour > 23
    || minute < 0
    || minute > 59
    || second < 0
    || second > 59
    || millisecond < 0
    || millisecond > 999
  ) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  date.setTime(date.getTime() - VIETNAM_TIMEZONE_OFFSET_MINUTES * 60 * 1000);

  const vietnamDate = new Date(date.getTime() + VIETNAM_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  if (
    vietnamDate.getUTCFullYear() !== year
    || vietnamDate.getUTCMonth() !== month - 1
    || vietnamDate.getUTCDate() !== day
    || vietnamDate.getUTCHours() !== hour
    || vietnamDate.getUTCMinutes() !== minute
    || vietnamDate.getUTCSeconds() !== second
    || vietnamDate.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  return date;
}
