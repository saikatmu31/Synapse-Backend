import { Router } from 'express';
import { z } from 'zod';
import { assembleQuiz } from '../../services/quiz.service.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

const querySchema = z.object({
  mode: z.enum(['daily', 'drill', 'topic', 'exam', 'adhoc']),
  track: z.string().optional(),
  topic: z.string().optional(),
  count: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * @openapi
 * /quiz:
 *   get:
 *     summary: Assemble a quiz
 *     description: |
 *       Returns a quiz payload for the requested mode. Options are never leaked — grading is always server-side.
 *       - **daily**: 40% due reviews + 40% weak topics + 20% new material. ≤2 consecutive from one track.
 *       - **drill**: Only due/weak misconceptions. Always a different question than last seen for that misconception.
 *       - **topic**: Filter by topic path prefix. Difficulty ladders up.
 *       - **exam**: Blueprint-weighted domain sampling.
 *       - **adhoc**: Pool-first keyword match; caller handles live generation if short.
 *     tags: [Quiz]
 *     parameters:
 *       - in: query
 *         name: mode
 *         required: true
 *         schema:
 *           type: string
 *           enum: [daily, drill, topic, exam, adhoc]
 *       - in: query
 *         name: track
 *         schema: { type: string }
 *         description: Track key (e.g. dea-c01). Required for exam mode.
 *       - in: query
 *         name: topic
 *         schema: { type: string }
 *         description: Topic path prefix (e.g. aws/s3). Required for topic mode.
 *       - in: query
 *         name: count
 *         schema: { type: integer, minimum: 1, maximum: 100 }
 *         description: Number of questions. Defaults to daily_goal for daily mode.
 *     responses:
 *       200:
 *         description: Quiz payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QuizPayload'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/', async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid query');
    }

    const { mode, track, topic, count } = parsed.data;

    if (mode === 'topic' && !topic)
      throw new AppError(400, 'VALIDATION_ERROR', 'topic is required for topic mode');
    if (mode === 'exam' && !track)
      throw new AppError(400, 'VALIDATION_ERROR', 'track is required for exam mode');

    const payload = await assembleQuiz({ mode, track_key: track, topic, count });
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

export default router;
