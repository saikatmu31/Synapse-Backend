import { createHash } from 'node:crypto';

/**
 * Compute the SHA-256 hex digest of the given string.
 */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Collapse runs of whitespace and newlines into a single space,
 * then trim leading/trailing whitespace.
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
