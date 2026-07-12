import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Attempt, Question, UserState } from '../../models/index.js';
import { applyAttemptToFSRS } from '../../services/fsrs.service.js';
import { processRewards, checkAndAdvanceStreak } from '../../services/rewards.service.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @openapi
 * /attempts:
 *   post:
 *     summary: Submit a batch of attempts
 *     description: |
 *       Grades attempts server-side, applies FSRS updates, computes rewards. Safe to replay —
 *       duplicate `idempotency_key` values are skipped and the cached result returned.
 *     tags: [Quiz]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               $ref: '#/components/schemas/AttemptInput'
 *     responses:
 *       200:
 *         description: Per-attempt results with grading, misconception info, and rewards
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AttemptResult'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
const attemptSchema = z.object({
  idempotency_key: z.string(),
  question_id: z.string(),
  selected_index: z.number().int().min(0).max(3),
  mode: z.enum(['daily', 'drill', 'topic', 'exam', 'adhoc']),
  latency_ms: z.number().int().min(0),
  client_ts: z.string().datetime().optional(),
});

const bodySchema = z.array(attemptSchema);

router.post('/', async (req, res, next) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body');
    }

    const batch = parsed.data;
    let session_streak = 0;
    const results = [];

    for (const item of batch) {
      // 1. Idempotency check
      const existing = await Attempt.findOne({ idempotency_key: item.idempotency_key }).lean();
      if (existing) {
        // Return cached — rebuild minimal cached response
        const cachedQuestion = await Question.findById(item.question_id).lean();
        if (cachedQuestion) {
          const correctIndex = cachedQuestion.options.findIndex((o) => o.correct === true);
          const correctOption = cachedQuestion.options[correctIndex];
          const selectedOption = cachedQuestion.options[existing.selected_index];
          const misconceptionId = selectedOption?.misconception_id;
          const misconceptionDoc = misconceptionId
            ? await (await import('../../models/index.js')).Misconception.findById(misconceptionId).lean()
            : null;

          const cachedUserState = await UserState.findById('me').lean();
          results.push({
            idempotency_key: item.idempotency_key,
            correct: existing.correct,
            correct_index: correctIndex,
            explanation: correctOption?.explanation ?? '',
            evidence_quote: cachedQuestion.evidence_quote,
            source_url: cachedQuestion.source_url,
            ...(misconceptionDoc && !existing.correct
              ? {
                  misconception: {
                    id: misconceptionDoc._id,
                    description: misconceptionDoc.description,
                    thought_process: selectedOption?.thought_process ?? '',
                    kill_progress: 0,
                  },
                  concept_doc_id: String(misconceptionDoc.concept_doc_id),
                }
              : {}),
            rewards: {
              xp_delta: 0,
              new_xp: cachedUserState?.xp ?? 0,
              new_level: cachedUserState?.level ?? 1,
              level_up: false,
              streak: {
                current: cachedUserState?.streak.current ?? 0,
                best: cachedUserState?.streak.best ?? 0,
                freeze_used: false,
                freeze_tokens: cachedUserState?.streak.freeze_tokens ?? 0,
              },
            },
          });
        }
        continue;
      }

      // 2. Load question
      if (!mongoose.Types.ObjectId.isValid(item.question_id)) {
        throw new AppError(404, 'NOT_FOUND', `Question ${item.question_id} not found`);
      }
      const question = await Question.findById(item.question_id).lean();
      if (!question) {
        throw new AppError(404, 'NOT_FOUND', `Question ${item.question_id} not found`);
      }

      // 3. Grade server-side
      const correctIndex = question.options.findIndex((o) => o.correct === true);
      const correct = item.selected_index === correctIndex;

      // 4. Get misconception_id from selected option (if wrong)
      const selectedOption = question.options[item.selected_index];
      const misconceptionId = !correct ? selectedOption?.misconception_id : undefined;

      // 5. FSRS update
      let squashed = false;
      let kill_progress = 0;

      if (misconceptionId) {
        const fsrsResult = await applyAttemptToFSRS({
          misconception_id: misconceptionId,
          question_id: item.question_id,
          correct,
        });
        squashed = fsrsResult.squashed;
        kill_progress = fsrsResult.kill_progress;
      }

      // 6. Process rewards
      if (correct) session_streak++;
      else session_streak = 0;

      const rewards = await processRewards({
        correct,
        difficulty: question.difficulty,
        is_boss: question.is_boss,
        squashed,
        misconception_id: misconceptionId,
        mode: item.mode,
        session_streak,
      });

      // 7. Save Attempt
      await Attempt.create({
        idempotency_key: item.idempotency_key,
        question_id: new mongoose.Types.ObjectId(item.question_id),
        selected_index: item.selected_index,
        correct,
        misconception_id: misconceptionId,
        mode: item.mode,
        latency_ms: item.latency_ms,
        client_ts: item.client_ts ? new Date(item.client_ts) : undefined,
        synced: false,
      });

      // 8. Build response
      const correctOption = question.options[correctIndex];
      let misconceptionPayload: {
        id: string;
        description: string;
        thought_process: string;
        kill_progress: number;
      } | undefined;
      let concept_doc_id: string | undefined;

      if (misconceptionId) {
        const { Misconception } = await import('../../models/index.js');
        const misconDoc = await Misconception.findById(misconceptionId).lean();
        if (misconDoc) {
          misconceptionPayload = {
            id: misconDoc._id,
            description: misconDoc.description,
            thought_process: selectedOption?.thought_process ?? '',
            kill_progress,
          };
          concept_doc_id = String(misconDoc.concept_doc_id);
        }
      }

      results.push({
        idempotency_key: item.idempotency_key,
        correct,
        correct_index: correctIndex,
        explanation: correctOption?.explanation ?? '',
        evidence_quote: question.evidence_quote,
        source_url: question.source_url,
        ...(misconceptionPayload ? { misconception: misconceptionPayload } : {}),
        ...(concept_doc_id ? { concept_doc_id } : {}),
        rewards,
      });
    }

    // After batch: check daily goal completion for 'daily' mode
    const firstMode = batch[0]?.mode;
    if (firstMode === 'daily') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const todayCorrect = await Attempt.countDocuments({
        correct: true,
        ts: { $gte: startOfDay }
      });
      const user = await UserState.findById('me').lean();
      if (todayCorrect >= (user?.daily_goal ?? 10)) {
        await checkAndAdvanceStreak(user?.timezone ?? 'Asia/Kolkata');
      }
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
});

export default router;
