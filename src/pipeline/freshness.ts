import { Question, Dispute, SourceChunk } from '../models/index.js';
import { geminiJson } from '../lib/index.js';
import { buildDisputeSolverPrompt, solverSchema } from '../prompts/index.js';
import { runGate3 } from './gates/gate3-form.js';

interface SolverResponse {
  answer_index: number;
  multiple_defensible: boolean;
  confidence: number;
  reasoning: string;
}

/**
 * Re-verify disputed questions as part of the nightly run.
 * - If both gate2 and gate3 pass → restore to 'verified', mark dispute 'fixed'
 * - If either fails, or this is the second dispute for the question → 'retired'
 */
export async function reVerifyDisputed(opts?: { verbose?: boolean }): Promise<{
  fixed: number;
  retired: number;
}> {
  const verbose = opts?.verbose ?? false;

  // 1. Find all disputed questions with at least one pending dispute
  const pendingDisputes = await Dispute.find({ resolution: 'pending' }).lean();
  const disputedQuestionIds = [...new Set(pendingDisputes.map((d) => String(d.question_id)))];

  const questions = await Question.find({
    _id: { $in: disputedQuestionIds },
    status: 'disputed',
  }).lean();

  if (verbose) {
    console.log(`[freshness] Re-verifying ${questions.length} disputed questions`);
  }

  let fixed = 0;
  let retired = 0;

  for (const question of questions) {
    const qid = String(question._id);

    // Load the pending dispute(s) for this question
    const disputes = pendingDisputes.filter((d) => String(d.question_id) === qid);
    const primaryDispute = disputes[0];
    if (!primaryDispute) continue;

    // Check if this is a second (or more) dispute
    const totalDisputeCount = await Dispute.countDocuments({ question_id: question._id });
    const isSecondDispute = totalDisputeCount >= 2;

    // Load the source chunk for re-verification
    const chunk = await SourceChunk.findById(question.chunk_id).lean();
    if (!chunk) {
      // Chunk gone — retire
      await retireQuestion(qid, disputes.map((d) => String(d._id)));
      retired++;
      continue;
    }

    const disputeReason = primaryDispute.note ?? primaryDispute.reason_tag;

    // Gate 2 re-verify with dispute-aware prompt
    let solverPassed = false;
    let solverConfidence = 0;
    try {
      const optionTexts = question.options.map((o) => o.text);
      const prompt = buildDisputeSolverPrompt({
        stem: question.stem,
        options: optionTexts,
        chunk_text: chunk.text,
        url: question.source_url,
        dispute_reason: disputeReason,
      });

      const response = await geminiJson<SolverResponse>(prompt, solverSchema, {
        temperature: 0,
      });

      const correctIndex = question.options.findIndex((o) => o.correct === true);
      solverConfidence = response.confidence;
      solverPassed =
        response.answer_index === correctIndex &&
        !response.multiple_defensible &&
        response.confidence >= 0.8;
    } catch (err) {
      console.error(`[freshness] Gate2 error for question ${qid}:`, err);
      // On error, treat as failed
    }

    // Gate 3 re-verify
    let gate3Passed = false;
    try {
      const g3 = await runGate3({
        stem: question.stem,
        options: question.options.map((o) => ({ text: o.text })),
      });
      gate3Passed = g3.passed;
    } catch (err) {
      console.error(`[freshness] Gate3 error for question ${qid}:`, err);
    }

    const bothPassed = solverPassed && gate3Passed && !isSecondDispute;

    if (bothPassed) {
      // Restore to verified
      await Question.findByIdAndUpdate(question._id, {
        status: 'verified',
        verified_at: new Date(),
        'gate_results.solver_confidence': solverConfidence,
      });

      // Mark all pending disputes for this question as fixed
      await Dispute.updateMany(
        { question_id: question._id, resolution: 'pending' },
        { resolution: 'fixed' },
      );

      fixed++;
      if (verbose) console.log(`[freshness] Fixed question ${qid}`);
    } else {
      await retireQuestion(qid, disputes.map((d) => String(d._id)));
      retired++;
      if (verbose) console.log(`[freshness] Retired question ${qid}`);
    }
  }

  return { fixed, retired };
}

async function retireQuestion(questionId: string, _disputeIds: string[]): Promise<void> {
  await Question.findByIdAndUpdate(questionId, { status: 'retired' });
  await Dispute.updateMany(
    { question_id: questionId, resolution: 'pending' },
    { resolution: 'retired' },
  );
}
