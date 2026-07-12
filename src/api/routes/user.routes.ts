import { Router } from 'express';
import { z } from 'zod';
import { UserState } from '../../models/index.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

/**
 * @openapi
 * /user:
 *   get:
 *     summary: Get user state
 *     description: Returns the user state singleton. Creates it with defaults if it does not yet exist.
 *     tags: [User]
 *     responses:
 *       200:
 *         description: User state
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserState'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /user
router.get('/', async (req, res, next) => {
  try {
    let user = await UserState.findById('me').lean();
    if (!user) {
      await UserState.create({
        _id: 'me',
        streak: { current: 0, best: 0, freeze_tokens: 3, last_active_date: '' },
        xp: 0,
        level: 1,
        daily_goal: 10,
        notification_hour: 9,
        timezone: 'UTC',
        insight_cards_unlocked: [],
        settings: {},
      });
      user = await UserState.findById('me').lean();
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

const patchUserSchema = z.object({
  daily_goal: z.number().int().min(1).optional(),
  notification_hour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().optional(),
  settings: z.record(z.unknown()).optional(),
});

/**
 * @openapi
 * /user:
 *   patch:
 *     summary: Update user state
 *     description: Updates one or more user preferences — daily_goal, notification_hour, timezone, or settings. All fields are optional.
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               daily_goal:
 *                 type: integer
 *                 minimum: 1
 *                 description: Number of questions to answer per day
 *               notification_hour:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 23
 *                 description: Hour of day for notifications (0-23)
 *               timezone:
 *                 type: string
 *                 description: IANA timezone string (e.g. "America/New_York")
 *               settings:
 *                 type: object
 *                 additionalProperties: true
 *                 description: Arbitrary key/value settings map
 *     responses:
 *       200:
 *         description: Updated user state
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserState'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// PATCH /user
router.patch('/', async (req, res, next) => {
  try {
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body');
    }

    const updates = parsed.data;
    const setFields: Record<string, unknown> = {};
    if (updates.daily_goal !== undefined) setFields['daily_goal'] = updates.daily_goal;
    if (updates.notification_hour !== undefined) setFields['notification_hour'] = updates.notification_hour;
    if (updates.timezone !== undefined) setFields['timezone'] = updates.timezone;
    if (updates.settings !== undefined) setFields['settings'] = updates.settings;

    const user = await UserState.findByIdAndUpdate('me', { $set: setFields }, { new: true, upsert: true }).lean();
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
