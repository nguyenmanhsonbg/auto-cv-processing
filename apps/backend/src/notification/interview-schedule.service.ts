import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface InterviewSchedule {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  durationMinutes: number;
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

interface LocalDateTimeParts extends LocalDateParts {
  hour: number;
  minute: number;
  second: number;
}

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 30;
const DEFAULT_DURATION_MINUTES = 60;

@Injectable()
export class InterviewScheduleService {
  private readonly logger = new Logger(InterviewScheduleService.name);

  constructor(private readonly configService: ConfigService) {}

  buildSchedule(transitionedAt: Date): InterviewSchedule {
    const timezone = this.configuredTimezone();
    const transitionParts = this.toLocalDateTimeParts(transitionedAt, timezone);
    const nextWorkingDate = this.nextWorkingDate(transitionParts);
    const localStart: LocalDateTimeParts = {
      ...nextWorkingDate,
      hour: this.configuredInteger('INTERVIEW_DEFAULT_HOUR', DEFAULT_HOUR, 0, 23),
      minute: this.configuredInteger('INTERVIEW_DEFAULT_MINUTE', DEFAULT_MINUTE, 0, 59),
      second: 0,
    };
    const startsAt = this.localDateTimeToInstant(localStart, timezone);
    const durationMinutes = this.configuredInteger(
      'INTERVIEW_DURATION_MINUTES',
      DEFAULT_DURATION_MINUTES,
      1,
      24 * 60,
    );

    return {
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000),
      timezone,
      durationMinutes,
    };
  }

  private configuredTimezone() {
    const configured = this.configService.get<string>('INTERVIEW_TIMEZONE')?.trim();
    if (!configured) return DEFAULT_TIMEZONE;

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: configured }).format();
      return configured;
    } catch {
      this.logger.warn(
        `Invalid INTERVIEW_TIMEZONE "${configured}". Falling back to ${DEFAULT_TIMEZONE}.`,
      );
      return DEFAULT_TIMEZONE;
    }
  }

  private configuredInteger(key: string, fallback: number, minimum: number, maximum: number) {
    const value = Number(this.configService.get<string>(key));
    return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
  }

  private nextWorkingDate(value: LocalDateParts): LocalDateParts {
    const candidate = new Date(Date.UTC(value.year, value.month - 1, value.day + 1));
    while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
      candidate.setUTCDate(candidate.getUTCDate() + 1);
    }

    return {
      year: candidate.getUTCFullYear(),
      month: candidate.getUTCMonth() + 1,
      day: candidate.getUTCDate(),
    };
  }

  private localDateTimeToInstant(value: LocalDateTimeParts, timezone: string) {
    const localWallClock = Date.UTC(
      value.year,
      value.month - 1,
      value.day,
      value.hour,
      value.minute,
      value.second,
    );
    let instant = localWallClock;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const zonedParts = this.toLocalDateTimeParts(new Date(instant), timezone);
      const zonedAsUtc = Date.UTC(
        zonedParts.year,
        zonedParts.month - 1,
        zonedParts.day,
        zonedParts.hour,
        zonedParts.minute,
        zonedParts.second,
      );
      const timezoneOffset = zonedAsUtc - instant;
      instant = localWallClock - timezoneOffset;
    }

    return new Date(instant);
  }

  private toLocalDateTimeParts(value: Date, timezone: string): LocalDateTimeParts {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const values = new Map(
      formatter
        .formatToParts(value)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );

    return {
      year: values.get('year') ?? value.getUTCFullYear(),
      month: values.get('month') ?? value.getUTCMonth() + 1,
      day: values.get('day') ?? value.getUTCDate(),
      hour: values.get('hour') ?? value.getUTCHours(),
      minute: values.get('minute') ?? value.getUTCMinutes(),
      second: values.get('second') ?? value.getUTCSeconds(),
    };
  }
}
