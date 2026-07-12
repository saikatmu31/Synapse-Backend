// Text chunking for ingested documentation.
// Token approximation: 1 token ≈ 4 characters.

const CHARS_PER_TOKEN = 4;

const TARGET_MIN_TOKENS = 500;
const TARGET_MAX_TOKENS = 1500;
const MIN_CHUNK_TOKENS = 200;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface TextChunk {
  text: string;
  token_estimate: number;
  chunk_index: number;
}

/**
 * Split `text` into chunks of 500–1500 tokens.
 *
 * Strategy (in order of preference):
 *  1. Split on heading boundaries (lines starting with #).
 *  2. Within oversized sections, split on paragraph breaks (\n\n).
 *  3. If still oversized, hard-split at 1500-token boundaries.
 *
 * Chunks smaller than MIN_CHUNK_TOKENS (200) are merged into the previous chunk
 * rather than emitted as orphans.
 *
 * @param text  The raw document text to chunk.
 * @param _url  Source URL — reserved for future use (e.g. metadata tagging).
 */
export function chunkText(text: string, _url: string): TextChunk[] {
  const sections = splitOnHeadings(text);
  const rawChunks: string[] = [];

  for (const section of sections) {
    if (estimateTokens(section) <= TARGET_MAX_TOKENS) {
      rawChunks.push(section);
    } else {
      // Section is too large — try paragraph splits.
      const paragraphChunks = splitOnParagraphs(section);
      for (const para of paragraphChunks) {
        rawChunks.push(para);
      }
    }
  }

  // Merge small chunks into the previous one, then assemble output.
  return buildFinalChunks(rawChunks);
}

// ---------------------------------------------------------------------------
// Step 1 — Split on heading boundaries
// ---------------------------------------------------------------------------

function splitOnHeadings(text: string): string[] {
  const lines = text.split('\n');
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && current.length > 0) {
      sections.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    sections.push(current.join('\n'));
  }

  return sections.filter((s) => s.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Step 2 — Split on paragraph breaks (\n\n) within an oversized section
// ---------------------------------------------------------------------------

function splitOnParagraphs(text: string): string[] {
  const paragraphs = text.split(/\n\n+/);
  const result: string[] = [];
  let accumulated = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const candidate = accumulated ? accumulated + '\n\n' + trimmed : trimmed;

    if (estimateTokens(candidate) > TARGET_MAX_TOKENS) {
      // Flush what we have so far.
      if (accumulated) {
        // Hard-split the accumulated buffer if it's still too large.
        for (const piece of hardSplit(accumulated)) {
          result.push(piece);
        }
        accumulated = '';
      }
      // Now handle the current paragraph itself.
      for (const piece of hardSplit(trimmed)) {
        if (result.length > 0 && estimateTokens(result[result.length - 1] + '\n\n' + piece) <= TARGET_MAX_TOKENS) {
          result[result.length - 1] += '\n\n' + piece;
        } else {
          result.push(piece);
        }
      }
    } else if (estimateTokens(candidate) >= TARGET_MIN_TOKENS) {
      // We've hit the sweet spot — emit and reset.
      result.push(candidate);
      accumulated = '';
    } else {
      // Still accumulating toward the minimum.
      accumulated = candidate;
    }
  }

  if (accumulated) {
    for (const piece of hardSplit(accumulated)) {
      result.push(piece);
    }
  }

  return result.filter((s) => s.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Step 3 — Hard-split at exactly TARGET_MAX_TOKENS characters
// ---------------------------------------------------------------------------

function hardSplit(text: string): string[] {
  const maxChars = TARGET_MAX_TOKENS * CHARS_PER_TOKEN;
  const pieces: string[] = [];

  let start = 0;
  while (start < text.length) {
    pieces.push(text.slice(start, start + maxChars));
    start += maxChars;
  }

  return pieces.filter((p) => p.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Final pass — merge trailing small chunks and assign indices
// ---------------------------------------------------------------------------

function buildFinalChunks(rawChunks: string[]): TextChunk[] {
  // Merge any chunk that's below the minimum into the preceding one.
  const merged: string[] = [];

  for (const chunk of rawChunks) {
    const tokens = estimateTokens(chunk);
    if (tokens < MIN_CHUNK_TOKENS && merged.length > 0) {
      merged[merged.length - 1] += '\n\n' + chunk;
    } else {
      merged.push(chunk);
    }
  }

  return merged.map((text, index) => ({
    text,
    token_estimate: estimateTokens(text),
    chunk_index: index,
  }));
}
