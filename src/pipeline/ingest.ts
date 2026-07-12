import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import pdfParse from 'pdf-parse';
import { Track, SourceChunk, Question, Dispute } from '../models/index.js';
import { sha256, chunkText } from '../lib/index.js';

const USER_AGENT = 'Synapse-Bot/1.0';
const POLITENESS_MS = 1_000; // 1 request per second

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine whether the response is a PDF based on Content-Type header
 * or the URL ending in .pdf.
 */
function isPdf(url: string, contentType: string): boolean {
  if (contentType.includes('application/pdf')) return true;
  const path = new URL(url).pathname.toLowerCase();
  return path.endsWith('.pdf');
}

/**
 * Extract text from an HTML response using @mozilla/readability + jsdom.
 */
function extractHtmlText(html: string, url: string): string {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  return article?.textContent ?? dom.window.document.body?.textContent ?? '';
}

/**
 * Fetch a URL and return its text content.
 * Returns null if the fetch fails with a 4xx status (logs a warning).
 * Throws on network errors so the caller can decide how to handle them.
 */
async function fetchText(url: string): Promise<string | null> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (response.status >= 400 && response.status < 500) {
    console.warn(`[ingest] Skipping ${url} — received ${response.status} ${response.statusText}`);
    return null;
  }

  if (!response.ok) {
    throw new Error(`[ingest] HTTP ${response.status} ${response.statusText} for ${url}`);
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (isPdf(url, contentType)) {
    const buffer = await response.arrayBuffer();
    const data = await pdfParse(Buffer.from(buffer));
    return data.text;
  }

  const html = await response.text();
  return extractHtmlText(html, url);
}

export async function ingestTrack(
  track_key: string,
  opts?: { verbose?: boolean },
): Promise<{ chunks_upserted: number; chunks_staled: number; disputes_created: number }> {
  const verbose = opts?.verbose ?? false;

  const track = await Track.findById(track_key);
  if (!track) {
    throw new Error(`[ingest] Track not found: ${track_key}`);
  }

  let chunks_upserted = 0;
  let chunks_staled = 0;
  let disputes_created = 0;

  const sources = track.sources ?? [];

  for (let i = 0; i < sources.length; i++) {
    const url = sources[i];

    // Politeness delay between requests (skip before the very first request)
    if (i > 0) {
      await sleep(POLITENESS_MS);
    }

    if (verbose) console.log(`[ingest] Fetching ${url}`);

    let rawText: string | null;
    try {
      rawText = await fetchText(url);
    } catch (err) {
      console.error(`[ingest] Failed to fetch ${url}:`, err);
      continue;
    }

    if (rawText === null) {
      // 4xx — skip as logged inside fetchText
      continue;
    }

    const chunks = chunkText(rawText, url);

    if (verbose) {
      console.log(`[ingest] ${url} → ${chunks.length} chunks`);
    }

    for (const chunk of chunks) {
      const hash = sha256(chunk.text);

      const existing = await SourceChunk.findOne({
        url,
        chunk_index: chunk.chunk_index,
      });

      if (existing) {
        if (existing.hash === hash) {
          // Already fresh — nothing to do
          if (verbose) {
            console.log(`[ingest]   chunk ${chunk.chunk_index} unchanged, skipping`);
          }
          continue;
        }

        // Hash changed — mark old chunk stale
        await SourceChunk.findByIdAndUpdate(existing._id, { status: 'stale' });
        chunks_staled++;

        if (verbose) {
          console.log(`[ingest]   chunk ${chunk.chunk_index} changed — marking stale`);
        }

        // Find all questions referencing this chunk and dispute them
        const affectedQuestions = await Question.find({
          chunk_id: existing._id,
          status: { $in: ['verified', 'staged'] },
        }).select('_id');

        for (const question of affectedQuestions) {
          await Question.findByIdAndUpdate(question._id, { status: 'disputed' });

          await Dispute.create({
            question_id: question._id,
            reason_tag: 'source-changed',
            note: `Source URL changed at chunk index ${chunk.chunk_index}: ${url}`,
          });

          disputes_created++;
        }
      }

      // Upsert the new/updated chunk
      await SourceChunk.findOneAndUpdate(
        { url, chunk_index: chunk.chunk_index },
        {
          url,
          track_key,
          topic_path: track_key, // use track_key as topic_path baseline
          title: `${track_key} — chunk ${chunk.chunk_index}`,
          text: chunk.text,
          chunk_index: chunk.chunk_index,
          hash,
          fetched_at: new Date(),
          status: 'active',
        },
        { upsert: true, new: true },
      );

      chunks_upserted++;
    }
  }

  return { chunks_upserted, chunks_staled, disputes_created };
}
