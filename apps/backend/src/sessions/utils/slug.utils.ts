import { nanoid } from 'nanoid';
import slugify from 'slugify';

/**
 * Generates a slug for a session based on candidate name and current date.
 * Format: {candidate-name}-interview-{YYYY-MM-DD}-{short-id}
 * Example: john-doe-interview-2026-04-15-a1b2c3
 * Converts Unicode characters to ASCII equivalents (e.g., "Nguyễn" → "nguyen")
 */
export function generateSessionSlug(candidateName: string): string {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  const shortId = nanoid(6); // 6-char unique suffix

  // Normalize candidate name: convert Unicode to ASCII, lowercase, strict mode
  const normalizedName = slugify(candidateName, {
    lower: true,      // Convert to lowercase
    strict: true,     // Strip special characters
    trim: true,       // Trim leading/trailing replacement chars
  });

  return `${normalizedName}-interview-${dateStr}-${shortId}`;
}

/**
 * Validates if a string is a valid session slug format
 */
export function isValidSessionSlug(slug: string): boolean {
  // Must be kebab-case with 'interview' keyword and date-like pattern
  return /^[a-z0-9]+-interview-\d{4}-\d{2}-\d{2}-[a-z0-9]{6}$/i.test(slug);
}
