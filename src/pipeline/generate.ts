import mongoose from 'mongoose';
import { Track, SourceChunk, Misconception } from '../models/index.js';
import { geminiJson } from '../lib/index.js';
import {
  buildGenerationPrompt,
  generationSchema,
} from '../prompts/index.js';
import { runGate1 } from './gates/gate1-evidence.js';
import { runGate2 } from './gates/gate2-solver.js';
import { runGate3 } from './gates/gate3-form.js';
import { publishSurvivors, type CandidateQuestion } from './publish.js';

interface GeneratedOption {
  text: string;
  correct?: boolean;
  explanation?: string;
  misconception_id?: string;
  thought_process?: string;
  concept_doc?: { title: string; body_md: string };
}

interface GeneratedQuestion {
  stem: string;
  options: GeneratedOption[];
  evidence_quote: string;
  difficulty: number;
  is_boss: boolean;
}

interface GenerationResponse {
  questions: GeneratedQuestion[];
}

export async function generateForTrack(
  track_key: string,
  budget: number,
  run_id: string,
  opts?: { verbose?: boolean },
): Promise<{
  generated: number;
  rejected_gate1: number;
  rejected_gate2: number;
  rejected_gate3: number;
  published: number;
}> {
  const verbose = opts?.verbose ?? false;

  // 1. Load track
  const track = await Track.findById(track_key);
  if (!track) {
    throw new Error(`[generate] Track not found: ${track_key}`);
  }

  // 2. Load existing misconception slugs for this track
  const misconceptions = await Misconception.find({
    topic_path: { $regex: `^${track_key}` },
  }).select('_id');
  const existingMisconceptionSlugs = misconceptions.map((m) => m._id as string);

  // 3. Pick chunks: active source_chunks for this track,
  //    ordered by least-covered (fewest questions referencing them), limit budget*2
  const chunks = await SourceChunk.aggregate([
    { $match: { track_key, status: 'active' } },
    {
      $lookup: {
        from: 'questions',
        localField: '_id',
        foreignField: 'chunk_id',
        as: 'questions',
      },
    },
    { $addFields: { question_count: { $size: '$questions' } } },
    { $sort: { question_count: 1 } },
    { $limit: budget * 2 },
    { $project: { questions: 0 } },
  ]);

  if (verbose) {
    console.log(`[generate] ${track_key}: ${chunks.length} candidate chunks for budget=${budget}`);
  }

  let generated = 0;
  let rejected_gate1 = 0;
  let rejected_gate2 = 0;
  let rejected_gate3 = 0;
  const survivors: CandidateQuestion[] = [];

  // Determine questions per chunk
  const questionsPerChunk = (chunkIndex: number): number => {
    if (chunks.length === 0) return 0;
    return Math.min(3, Math.floor(budget / chunks.length) + 1);
  };

  // 4. Per chunk, generate questions sequentially (free-tier friendly)
  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const n = questionsPerChunk(ci);

    if (verbose) {
      console.log(
        `[generate] ${track_key}: chunk ${ci + 1}/${chunks.length} (${chunk._id}) — requesting ${n} questions`,
      );
    }

    let rawQuestions: GeneratedQuestion[] = [];

    try {
      const prompt = buildGenerationPrompt({
        n,
        track_name: track.name,
        custom_instructions: track.custom_instructions ?? '',
        existing_misconceptions: existingMisconceptionSlugs,
        url: chunk.url as string,
        chunk_text: chunk.text as string,
      });

      const response = await geminiJson<GenerationResponse>(prompt, generationSchema);
      rawQuestions = response.questions ?? [];
    } catch (err) {
      console.error(`[generate] Gemini error on chunk ${chunk._id}:`, err);
      continue; // skip this chunk, continue to next
    }

    generated += rawQuestions.length;

    // 5. Gate each candidate
    for (const candidate of rawQuestions) {
      const chunkText = chunk.text as string;
      const chunkUrl = chunk.url as string;
      const chunkId = (chunk._id as mongoose.Types.ObjectId).toString();

      // Gate 1: evidence check
      const g1 = runGate1({ evidence_quote: candidate.evidence_quote }, chunkText);
      if (!g1.passed) {
        rejected_gate1++;
        if (verbose) console.log(`[generate]   gate1 FAIL: ${candidate.stem.slice(0, 60)}…`);
        continue;
      }

      // Gate 2: solver
      let g2Result;
      try {
        g2Result = await runGate2(candidate, chunkText, chunkUrl);
      } catch (err) {
        console.error('[generate] Gate2 error:', err);
        rejected_gate2++;
        continue;
      }

      if (!g2Result.passed) {
        rejected_gate2++;
        if (verbose) console.log(`[generate]   gate2 FAIL: ${candidate.stem.slice(0, 60)}…`);
        continue;
      }

      // Gate 3: form check
      let g3Result;
      try {
        g3Result = await runGate3(candidate);
      } catch (err) {
        console.error('[generate] Gate3 error:', err);
        rejected_gate3++;
        continue;
      }

      if (!g3Result.passed) {
        rejected_gate3++;
        if (verbose) console.log(`[generate]   gate3 FAIL: ${candidate.stem.slice(0, 60)}…`);
        continue;
      }

      // All gates passed — collect as survivor
      const blueprintDomain = resolveBlueprintDomain(
        track.blueprint,
        candidate.stem,
      );

      survivors.push({
        stem: candidate.stem,
        options: candidate.options,
        evidence_quote: candidate.evidence_quote,
        chunk_id: chunkId,
        source_url: chunkUrl,
        track_key,
        topic_path: chunk.topic_path as string,
        ...(blueprintDomain !== undefined && { blueprint_domain: blueprintDomain }),
        difficulty: candidate.difficulty,
        is_boss: candidate.is_boss,
        gate_results: {
          evidence: true,
          solver: true,
          form: true,
          solver_confidence: g2Result.confidence,
        },
      });

      if (verbose) console.log(`[generate]   PASSED all gates: ${candidate.stem.slice(0, 60)}…`);
    }
  }

  // 6. Batch-upsert survivors
  const published = await publishSurvivors(survivors, run_id);

  if (verbose) {
    console.log(
      `[generate] ${track_key}: generated=${generated} gate1_fail=${rejected_gate1} gate2_fail=${rejected_gate2} gate3_fail=${rejected_gate3} published=${published}`,
    );
  }

  return { generated, rejected_gate1, rejected_gate2, rejected_gate3, published };
}

/**
 * Pick the first blueprint domain whose label appears in the question stem.
 * Falls back to undefined if no match or no blueprint.
 */
function resolveBlueprintDomain(
  blueprint: Array<{ domain: string; weight: number }> | undefined,
  stem: string,
): string | undefined {
  if (!blueprint || blueprint.length === 0) return undefined;
  const lower = stem.toLowerCase();
  for (const entry of blueprint) {
    if (lower.includes(entry.domain.toLowerCase())) {
      return entry.domain;
    }
  }
  return undefined;
}

