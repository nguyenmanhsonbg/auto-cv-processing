import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { validate as isUuid } from 'uuid';
import { isValidSessionSlug } from '../utils/slug.utils';

/**
 * Pipe that validates session identifier (either UUID or slug format)
 * Allows routes to accept both session IDs and slugs
 */
@Injectable()
export class SessionIdentifierPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!value) {
      throw new BadRequestException('Session identifier is required');
    }

    // Accept either UUID or valid slug format
    if (isUuid(value) || isValidSessionSlug(value)) {
      return value;
    }

    // Also accept any slug-like string (for backward compatibility with existing slugs)
    // This is more permissive than isValidSessionSlug for slugs created before the pattern was enforced
    if (/^[a-zA-Z0-9-_]+$/.test(value)) {
      return value;
    }

    throw new BadRequestException('Invalid session identifier format');
  }
}
