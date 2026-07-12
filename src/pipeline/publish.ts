import mongoose from 'mongoose';
import {
  Question,
  Misconception,
  ConceptDoc,
  GenerationRun,
} from '../models/index.js';
import { sendTelegram } from '../lib/index.js';

export interface CandidateQuestion {
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
  chunk_id: string;
  source_url: string;
  track_key: string;
  topic_path: string;
  blueprint_domain?: string;
  difficulty: number;
  is_boss: boolean;
  gate_results: {
    evidence: boolean;
    solver: boolean;
    form: boolean;
    solver_confidence: number;
    rejected_gate?: 'gate1' | 'gate2' | 'gate3';
    form_failures?: string[];
  };
}

export async function publishSurvivors(
  survivors: CandidateQuestion[],
  _run_id: string,
): Promise<number> {
  let published = 0;

  for (const candidate of survivors) {
    try {
      const chunkObjectId = new mongoose.Types.ObjectId(candidate.chunk_id);

      // Process each distractor's misconception
      for (const option of candidate.options) {
        if (!option.misconception_id || option.correct) continue;

        const existing = await Misconception.findById(option.misconception_id);
        if (existing) continue;

        // Misconception doesn't exist — create ConceptDoc + Misconception if we have concept_doc
        if (!option.concept_doc) continue;

        const conceptDoc = await ConceptDoc.create({
          title: option.concept_doc.title,
          body_md: option.concept_doc.body_md,
          source_url: candidate.source_url,
          chunk_id: chunkObjectId,
          topic_path: candidate.topic_path,
        });

        await Misconception.create({
          _id: option.misconception_id,
          description: option.concept_doc.title,
          topic_path: candidate.topic_path,
          concept_doc_id: conceptDoc._id,
        });
      }

      // Build the options array for the Question document
      const questionOptions = candidate.options.map((o) => ({
        text: o.text,
        ...(o.correct !== undefined && { correct: o.correct }),
        ...(o.explanation !== undefined && { explanation: o.explanation }),
        ...(o.misconception_id !== undefined && { misconception_id: o.misconception_id }),
        ...(o.thought_process !== undefined && { thought_process: o.thought_process }),
      }));

      await Question.create({
        stem: candidate.stem,
        options: questionOptions,
        evidence_quote: candidate.evidence_quote,
        chunk_id: chunkObjectId,
        source_url: candidate.source_url,
        track_key: candidate.track_key,
        topic_path: candidate.topic_path,
        ...(candidate.blueprint_domain !== undefined && {
          blueprint_domain: candidate.blueprint_domain,
        }),
        difficulty: Math.min(5, Math.max(1, Math.round(candidate.difficulty))) as
          | 1
          | 2
          | 3
          | 4
          | 5,
        is_boss: candidate.is_boss,
        status: 'verified',
        gate_results: candidate.gate_results,
        verified_at: new Date(),
      });

      published++;
    } catch (err) {
      console.error('[publish] Failed to publish candidate:', err);
    }
  }

  return published;
}

export async function finalizeRun(
  run_id: string,
  stats: {
    generated: number;
    rejected_gate1: number;
    rejected_gate2: number;
    rejected_gate3: number;
    published: number;
    disputed_rechecked: number;
  },
): Promise<void> {
  try {
    await GenerationRun.findByIdAndUpdate(run_id, {
      finished_at: new Date(),
      status: 'done',
      generated: stats.generated,
      rejected_gate1: stats.rejected_gate1,
      rejected_gate2: stats.rejected_gate2,
      rejected_gate3: stats.rejected_gate3,
      published: stats.published,
      disputed_rechecked: stats.disputed_rechecked,
    });
  } catch (err) {
    console.error('[publish] Failed to update GenerationRun:', err);
  }

  const passRate =
    stats.generated > 0
      ? ((stats.published / stats.generated) * 100).toFixed(1)
      : '0.0';

  const message =
    `<b>Synapse Nightly Run Complete</b>\n` +
    `Generated: ${stats.generated}\n` +
    `Published: ${stats.published} (${passRate}% pass rate)\n` +
    `Rejected gate1: ${stats.rejected_gate1}\n` +
    `Rejected gate2: ${stats.rejected_gate2}\n` +
    `Rejected gate3: ${stats.rejected_gate3}\n` +
    `Disputed re-checked: ${stats.disputed_rechecked}`;

  await sendTelegram(message);
}
