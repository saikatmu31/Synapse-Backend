import { Router } from 'express';
import { ConceptDoc, Misconception, UserState, Mastery } from '../../models/index.js';
import { assembleQuiz } from '../../services/quiz.service.js';
import { getMapPayload } from '../../services/mastery.service.js';

const router = Router();

/**
 * @openapi
 * /sync/batch:
 *   get:
 *     summary: Fetch offline sync bundle
 *     description: Returns an offline bundle containing tomorrow's daily quiz, a 20-question drill reserve, all referenced concept docs and misconceptions, a user_state snapshot, the neural map payload, and a synced_at timestamp.
 *     tags: [Sync]
 *     responses:
 *       200:
 *         description: Offline sync bundle
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 daily_quiz:
 *                   $ref: '#/components/schemas/QuizPayload'
 *                 drill_reserve:
 *                   $ref: '#/components/schemas/QuizPayload'
 *                 concept_docs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ConceptDoc'
 *                 misconceptions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Misconception'
 *                 user_state:
 *                   $ref: '#/components/schemas/UserState'
 *                 map:
 *                   $ref: '#/components/schemas/MapPayload'
 *                 synced_at:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/batch', async (req, res, next) => {
  try {
    const [daily_quiz, drill_reserve] = await Promise.all([
      assembleQuiz({ mode: 'daily' }),
      assembleQuiz({ mode: 'drill', count: 20 }),
    ]);

    // Collect unique topic paths from quiz questions
    const allTopicPaths = [
      ...new Set([
        ...daily_quiz.questions.map((q) => q.meta.topic_path),
        ...drill_reserve.questions.map((q) => q.meta.topic_path),
      ]),
    ];

    // Fetch concept docs for those topics
    const concept_docs = await ConceptDoc.find({
      topic_path: { $in: allTopicPaths },
    }).lean();

    // Active misconceptions: consecutive_distinct_correct < 3
    const activeMasteryIds = await Mastery.find({
      subject_type: 'misconception',
      consecutive_distinct_correct: { $lt: 3 },
    })
      .select('subject_id')
      .lean();

    const activeMisconceptionIds = activeMasteryIds.map((m) => m.subject_id);

    const misconceptions = await Misconception.find({
      _id: { $in: activeMisconceptionIds },
    }).lean();

    // User state (atomic upsert singleton)
    const user_state = await UserState.findByIdAndUpdate(
      'me',
      {
        $setOnInsert: {
          _id: 'me',
          streak: { current: 0, best: 0, freeze_tokens: 2, last_active_date: '' },
          xp: 0, level: 1, daily_goal: 10, notification_hour: 7,
          timezone: 'Asia/Kolkata',
          insight_cards_unlocked: [],
          settings: {},
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const map = await getMapPayload();

    res.json({
      daily_quiz,
      drill_reserve,
      concept_docs,
      misconceptions,
      user_state,
      map,
      synced_at: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
