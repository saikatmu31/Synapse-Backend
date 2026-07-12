import { normalizeWhitespace } from '../../lib/hash.js';

export interface Gate1Result {
  passed: boolean;
}

/**
 * Pure code gate — no LLM.
 * Returns true if the normalized evidence_quote is a case-insensitive
 * substring of the normalized chunk_text.
 */
export function checkEvidence(evidence_quote: string, chunk_text: string): boolean {
  const normQuote = normalizeWhitespace(evidence_quote).toLowerCase().trim();
  if (!normQuote) return false; // empty string is always a substring — reject explicitly
  const normChunk = normalizeWhitespace(chunk_text).toLowerCase();
  return normChunk.includes(normQuote);
}

export function runGate1(
  candidate: { evidence_quote: string },
  chunk_text: string,
): Gate1Result {
  return { passed: checkEvidence(candidate.evidence_quote, chunk_text) };
}
