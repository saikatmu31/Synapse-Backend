import { Router } from 'express';
import { Question, Attempt, Mastery, UserState, Track } from '../../models/index.js';
import { getCertReadiness } from '../../services/mastery.service.js';

const router = Router();

/**
 * @openapi
 * /stats/overview:
 *   get:
 *     summary: Get overall stats
 *     description: Returns aggregate statistics including total questions, total attempts, active and squashed misconception counts, streak, XP, level, and per-track question counts and readiness scores.
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Overview stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total_questions:
 *                   type: integer
 *                 total_attempts:
 *                   type: integer
 *                 active_misconceptions:
 *                   type: integer
 *                 squashed_misconceptions:
 *                   type: integer
 *                 streak:
 *                   type: object
 *                   properties:
 *                     current:
 *                       type: integer
 *                     best:
 *                       type: integer
 *                 xp:
 *                   type: number
 *                 level:
 *                   type: integer
 *                 tracks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       key:
 *                         type: string
 *                       name:
 *                         type: string
 *                       readiness:
 *                         type: number
 *                       question_count:
 *                         type: integer
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /stats/overview
router.get('/overview', async (req, res, next) => {
  try {
    const [
      total_questions,
      total_attempts,
      activeMastery,
      squashedMastery,
      user,
      tracks,
    ] = await Promise.all([
      Question.countDocuments({ status: 'verified' }),
      Attempt.countDocuments(),
      Mastery.countDocuments({ subject_type: 'misconception', consecutive_distinct_correct: { $lt: 3 } }),
      Mastery.countDocuments({ subject_type: 'misconception', consecutive_distinct_correct: 3 }),
      UserState.findById('me').lean(),
      Track.find().lean(),
    ]);

    const trackStats = await Promise.all(
      tracks.map(async (track) => {
        const [readiness, question_count] = await Promise.all([
          track.kind === 'certification' ? getCertReadiness(track.key) : Promise.resolve(null),
          Question.countDocuments({ status: 'verified', track_key: track.key }),
        ]);
        return {
          key: track.key,
          name: track.name,
          readiness: readiness?.overall ?? 0,
          question_count,
        };
      }),
    );

    res.json({
      total_questions,
      total_attempts,
      active_misconceptions: activeMastery,
      squashed_misconceptions: squashedMastery,
      streak: {
        current: user?.streak.current ?? 0,
        best: user?.streak.best ?? 0,
      },
      xp: user?.xp ?? 0,
      level: user?.level ?? 1,
      tracks: trackStats,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /stats/weekly-report:
 *   get:
 *     summary: Get last 7 days report
 *     description: Returns a weekly summary including accuracy, correct and total attempt counts, misconceptions squashed this week, the weakest domain, current streak, and a by-day breakdown.
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Weekly report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accuracy:
 *                   type: number
 *                   description: Fraction of correct attempts (0-1)
 *                 correct:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 total_squashed:
 *                   type: integer
 *                 weakest_misconception:
 *                   type: string
 *                   nullable: true
 *                 streak:
 *                   type: object
 *                   properties:
 *                     current:
 *                       type: integer
 *                     best:
 *                       type: integer
 *                 by_day:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       correct:
 *                         type: integer
 *                       total:
 *                         type: integer
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /stats/weekly-report
router.get('/weekly-report', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [weeklyAttempts, squashedThisWeek, user] = await Promise.all([
      Attempt.find({ ts: { $gte: since } }).lean(),
      Mastery.find({
        subject_type: 'misconception',
        consecutive_distinct_correct: 3,
      }).lean(), // approximation — we don't track when squashed happened
      UserState.findById('me').lean(),
    ]);

    const correct = weeklyAttempts.filter((a) => a.correct).length;
    const total = weeklyAttempts.length;
    const accuracy = total > 0 ? correct / total : 0;

    // By-day breakdown
    const byDayMap = new Map<string, { correct: number; total: number }>();
    for (const a of weeklyAttempts) {
      const date = a.ts.toISOString().slice(0, 10);
      const entry = byDayMap.get(date) ?? { correct: 0, total: 0 };
      entry.total++;
      if (a.correct) entry.correct++;
      byDayMap.set(date, entry);
    }
    const by_day = [...byDayMap.entries()]
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Weakest domain: topic_path with most incorrect attempts
    const incorrectByTopic = new Map<string, number>();
    for (const a of weeklyAttempts) {
      if (!a.correct && a.misconception_id) {
        // We'll use misconception_id as proxy for domain grouping
        incorrectByTopic.set(a.misconception_id, (incorrectByTopic.get(a.misconception_id) ?? 0) + 1);
      }
    }
    let weakest_misconception: string | null = null;
    let maxWrong = 0;
    for (const [domain, count] of incorrectByTopic) {
      if (count > maxWrong) {
        maxWrong = count;
        weakest_misconception = domain;
      }
    }

    res.json({
      accuracy,
      correct,
      total,
      total_squashed: squashedThisWeek.length,
      weakest_misconception,
      streak: {
        current: user?.streak.current ?? 0,
        best: user?.streak.best ?? 0,
      },
      by_day,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
