import mongoose from 'mongoose';
import { Track, SourceChunk, Question, Misconception, GenerationRun } from '../models/index.js';
import { geminiJson } from '../lib/index.js';
import { buildAdhocPrompt, generationSchema } from '../prompts/index.js';
import { ingestTrack } from './ingest.js';
import { generateForTrack } from './generate.js';
import { reVerifyDisputed } from './freshness.js';
import { finalizeRun, type CandidateQuestion } from './publish.js';
import { runGate1 } from './gates/gate1-evidence.js';
import { runGate2 } from './gates/gate2-solver.js';
import { runGate3 } from './gates/gate3-form.js';

const DEFAULT_BUDGET = 400;

interface GenerationResponse {
  questions: Array<{
    stem: string;
    options: Array<{
      text: string;
      correct?: boolean;
      explanation?: string;
      misconception_id?: string;
      thought_process?: string;
      concept_doc?: { title: string; body_md: string };
    }>;
    evidence_quote: string;
    difficulty: number;
    is_boss: boolean;
  }>;
}

export async function runBootstrap(opts?: {
  budget?: number;
  tracks?: string[];
  verbose?: boolean;
}): Promise<void> {
  const budget = opts?.budget ?? DEFAULT_BUDGET;
  const verbose = opts?.verbose ?? false;

  // 1. Load active tracks
  const query = opts?.tracks && opts.tracks.length > 0
    ? Track.find({ _id: { $in: opts.tracks } })
    : Track.find({});

  const tracks = await query.lean();

  if (tracks.length === 0) {
    console.log('[bootstrap] No tracks found — nothing to do.');
    return;
  }

  if (verbose) {
    console.log(`[bootstrap] Found ${tracks.length} track(s): ${tracks.map((t) => t.key).join(', ')}`);
  }

  // 2. Ingest all sources for each track
  for (const track of tracks) {
    if (verbose) console.log(`[bootstrap] Ingesting sources for track: ${track.key}`);
    try {
      const ingestStats = await ingestTrack(track.key, { verbose });
      if (verbose) {
        console.log(
          `[bootstrap] ${track.key} ingest: upserted=${ingestStats.chunks_upserted} staled=${ingestStats.chunks_staled} disputes=${ingestStats.disputes_created}`,
        );
      }
    } catch (err) {
      console.error(`[bootstrap] Ingest failed for track ${track.key}:`, err);
    }
  }

  // 3. Allocate budget across tracks proportional to intensity (min 1 per track for bootstrap)
  const totalIntensity = tracks.reduce((sum, t) => sum + Math.max(1, t.intensity), 0);
  const trackBudgets = tracks.map((t) => ({
    key: t.key,
    budget: Math.max(1, Math.round((Math.max(1, t.intensity) / totalIntensity) * budget)),
  }));

  if (verbose) {
    console.log('[bootstrap] Budget allocation:');
    for (const tb of trackBudgets) {
      console.log(`  ${tb.key}: ${tb.budget}`);
    }
  }

  // 4. Re-verify disputed questions before generating new ones
  try {
    const freshness = await reVerifyDisputed({ verbose });
    if (verbose) {
      console.log(`[bootstrap] Freshness pass: fixed=${freshness.fixed} retired=${freshness.retired}`);
    }
  } catch (err) {
    console.error('[bootstrap] Freshness check failed:', err);
  }

  // 5. Generate for each track sequentially
  const totals = {
    generated: 0,
    rejected_gate1: 0,
    rejected_gate2: 0,
    rejected_gate3: 0,
    published: 0,
    disputed_rechecked: 0,
  };

  for (const { key, budget: trackBudget } of trackBudgets) {
    // Create a GenerationRun record
    let run_id: string = new mongoose.Types.ObjectId().toHexString();
    try {
      const run = await GenerationRun.create({
        track_key: key,
        chunks_used: 0,
        status: 'running',
      });
      run_id = String(run._id);
    } catch (err) {
      console.error(`[bootstrap] Could not create GenerationRun for ${key}:`, err);
    }

    try {
      const stats = await generateForTrack(key, trackBudget, run_id, { verbose });

      console.log(
        `[bootstrap] [${key}] generated=${stats.generated} passed=${stats.published}`,
      );

      totals.generated += stats.generated;
      totals.rejected_gate1 += stats.rejected_gate1;
      totals.rejected_gate2 += stats.rejected_gate2;
      totals.rejected_gate3 += stats.rejected_gate3;
      totals.published += stats.published;
    } catch (err) {
      console.error(`[bootstrap] generateForTrack failed for ${key}:`, err);
    }

    // Finalize this run's record
    try {
      await finalizeRun(run_id, totals);
    } catch (err) {
      console.error(`[bootstrap] finalizeRun failed for ${key}:`, err);
    }
  }

  // 6. Final summary
  console.log('\n[bootstrap] === Final Summary ===');
  console.log(`  Total published:      ${totals.published}`);
  console.log(`  Rejected (gate1):     ${totals.rejected_gate1}`);
  console.log(`  Rejected (gate2):     ${totals.rejected_gate2}`);
  console.log(`  Rejected (gate3):     ${totals.rejected_gate3}`);
  console.log(`  Total generated:      ${totals.generated}`);
}

/**
 * Generate ad-hoc questions for a given user prompt.
 * Used by the SSE endpoint.
 *
 * 1. Try to find matching verified questions by keyword search.
 * 2. If not enough found, generate fresh questions from the best-matching chunk.
 */
export async function generateAdhoc(
  user_prompt: string,
  count: number,
  track_key: string,
  onProgress: (stage: string, passed: number, total: number) => void,
): Promise<CandidateQuestion[]> {
  onProgress('searching', 0, count);

  // 1. Find matching verified questions by keyword search in stem/topic_path
  const keywords = user_prompt
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const regexParts = keywords.map((kw) => new RegExp(kw, 'i'));

  const existingQuestions = await Question.find({
    track_key,
    status: 'verified',
    $or: [
      { stem: { $in: regexParts } },
      { topic_path: { $in: regexParts } },
    ],
  })
    .limit(count)
    .lean();

  if (existingQuestions.length >= count) {
    onProgress('found_existing', existingQuestions.length, count);

    return existingQuestions.map((q): CandidateQuestion => ({
      stem: q.stem,
      options: q.options,
      evidence_quote: q.evidence_quote,
      chunk_id: String(q.chunk_id),
      source_url: q.source_url,
      track_key: q.track_key,
      topic_path: q.topic_path,
      blueprint_domain: q.blueprint_domain,
      difficulty: q.difficulty,
      is_boss: q.is_boss,
      gate_results: q.gate_results,
    }));
  }

  // 2. Not enough found — generate fresh questions from best-matching chunk
  onProgress('generating', 0, count);

  const track = await Track.findById(track_key).lean();
  if (!track) {
    throw new Error(`[generateAdhoc] Track not found: ${track_key}`);
  }

  // Load misconceptions for this track
  const misconceptions = await Misconception.find({
    topic_path: { $regex: `^${track_key}` },
  })
    .select('_id')
    .lean();
  const existingMisconceptionSlugs = misconceptions.map((m) => m._id as string);

  // Find the best-matching chunk by keyword overlap in text
  const chunks = await SourceChunk.find({ track_key, status: 'active' }).lean();

  let bestChunk: (typeof chunks)[number] | null = null;
  let bestScore = -1;

  const queryLower = user_prompt.toLowerCase();

  for (const chunk of chunks) {
    const textLower = (chunk.text as string).toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (textLower.includes(kw)) score++;
    }
    // Also check partial phrase match
    if (textLower.includes(queryLower)) score += 5;
    if (score > bestScore) {
      bestScore = score;
      bestChunk = chunk;
    }
  }

  if (!bestChunk) {
    onProgress('no_chunks', 0, count);
    return [];
  }

  // Generate candidates using the adhoc prompt
  let rawQuestions: GenerationResponse['questions'] = [];

  try {
    const prompt = buildAdhocPrompt({
      user_prompt,
      count,
      track_name: track.name,
      custom_instructions: track.custom_instructions ?? '',
      existing_misconceptions: existingMisconceptionSlugs,
      url: bestChunk.url as string,
      chunk_text: bestChunk.text as string,
    });

    const response = await geminiJson<GenerationResponse>(prompt, generationSchema);
    rawQuestions = response.questions ?? [];
  } catch (err) {
    console.error('[generateAdhoc] Gemini error:', err);
    onProgress('error', 0, count);
    return [];
  }

  onProgress('gating', 0, rawQuestions.length);

  const survivors: CandidateQuestion[] = [];
  let passed = 0;

  for (const candidate of rawQuestions) {
    const chunkText = bestChunk.text as string;
    const chunkUrl = bestChunk.url as string;
    const chunkId = String(bestChunk._id);

    // Gate 1
    const g1 = runGate1({ evidence_quote: candidate.evidence_quote }, chunkText);
    if (!g1.passed) continue;

    // Gate 2
    let g2Result;
    try {
      g2Result = await runGate2(candidate, chunkText, chunkUrl);
    } catch (err) {
      console.error('[generateAdhoc] Gate2 error:', err);
      continue;
    }
    if (!g2Result.passed) continue;

    // Gate 3
    let g3Result;
    try {
      g3Result = await runGate3(candidate);
    } catch (err) {
      console.error('[generateAdhoc] Gate3 error:', err);
      continue;
    }
    if (!g3Result.passed) continue;

    passed++;
    onProgress('gating', passed, rawQuestions.length);

    survivors.push({
      stem: candidate.stem,
      options: candidate.options,
      evidence_quote: candidate.evidence_quote,
      chunk_id: chunkId,
      source_url: chunkUrl,
      track_key,
      topic_path: bestChunk.topic_path as string,
      difficulty: candidate.difficulty,
      is_boss: candidate.is_boss,
      gate_results: {
        evidence: true,
        solver: true,
        form: true,
        solver_confidence: g2Result.confidence,
      },
    });
  }

  onProgress('done', survivors.length, count);
  return survivors;
}
