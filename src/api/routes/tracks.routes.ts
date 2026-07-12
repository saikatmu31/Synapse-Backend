import { Router } from 'express';
import { z } from 'zod';
import { Track, Topic } from '../../models/index.js';
import { getCertReadiness } from '../../services/mastery.service.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

function isValidUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * @openapi
 * /tracks:
 *   get:
 *     summary: List all tracks
 *     description: Returns all tracks with cert_readiness appended. For certification tracks, cert_readiness contains overall and by_domain readiness scores; for skill tracks it is null.
 *     tags: [Tracks]
 *     responses:
 *       200:
 *         description: Array of tracks with cert_readiness
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Track'
 *                   - type: object
 *                     properties:
 *                       cert_readiness:
 *                         nullable: true
 *                         type: object
 *                         properties:
 *                           overall:
 *                             type: number
 *                           by_domain:
 *                             type: array
 *                             items:
 *                               type: object
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /tracks
router.get('/', async (req, res, next) => {
  try {
    const tracks = await Track.find().lean();

    const result = await Promise.all(
      tracks.map(async (track) => {
        if (track.kind === 'certification') {
          const readiness = await getCertReadiness(track.key);
          return { ...track, cert_readiness: readiness };
        }
        return { ...track, cert_readiness: null };
      }),
    );

    res.json(result);
  } catch (err) {
    next(err);
  }
});

const createTrackSchema = z.object({
  key: z.string(),
  name: z.string(),
  kind: z.enum(['certification', 'skill']),
  intensity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  custom_instructions: z.string().default(''),
  sources: z.array(z.string()),
  blueprint: z
    .array(z.object({ domain: z.string(), weight: z.number() }))
    .optional(),
});

/**
 * @openapi
 * /tracks:
 *   post:
 *     summary: Create a new track
 *     description: Creates a new track and seeds a root topic for it.
 *     tags: [Tracks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [key, name, kind, intensity, sources]
 *             properties:
 *               key:
 *                 type: string
 *                 description: Unique identifier key for the track
 *               name:
 *                 type: string
 *                 description: Display name of the track
 *               kind:
 *                 type: string
 *                 enum: [certification, skill]
 *               intensity:
 *                 type: integer
 *                 enum: [0, 1, 2, 3]
 *                 description: Study intensity level (0-3)
 *               custom_instructions:
 *                 type: string
 *                 description: Optional custom generation instructions
 *               sources:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Source URLs for content generation
 *               blueprint:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     domain:
 *                       type: string
 *                     weight:
 *                       type: number
 *                 description: Optional domain weighting blueprint
 *     responses:
 *       201:
 *         description: Created track
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Track'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: Track with this key already exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// POST /tracks
router.post('/', async (req, res, next) => {
  try {
    const parsed = createTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body');
    }

    const data = parsed.data;

    const invalidUrls = data.sources.filter((s) => !isValidUrl(s));
    if (invalidUrls.length > 0) {
      throw new AppError(400, 'VALIDATION_ERROR', `Invalid URL(s): ${invalidUrls.join(', ')}`);
    }

    const existing = await Track.findOne({ key: data.key }).lean();
    if (existing) {
      throw new AppError(409, 'DUPLICATE_KEY', `Track with key '${data.key}' already exists`);
    }

    const track = await Track.create({
      _id: data.key,
      key: data.key,
      name: data.name,
      kind: data.kind,
      intensity: data.intensity,
      custom_instructions: data.custom_instructions,
      sources: data.sources,
      blueprint: data.blueprint ?? [],
    });

    // Seed a root Topic
    await Topic.create({
      track_key: data.key,
      name: data.name,
      path: data.key,
      parent_id: null,
    });

    res.status(201).json(track);
  } catch (err) {
    next(err);
  }
});

const patchTrackSchema = z.object({
  intensity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  custom_instructions: z.string().optional(),
  sources: z.array(z.string()).optional(),
});

/**
 * @openapi
 * /tracks/{key}:
 *   patch:
 *     summary: Update a track
 *     description: Updates intensity, custom_instructions, or sources for an existing track.
 *     tags: [Tracks]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: The track key
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               intensity:
 *                 type: integer
 *                 enum: [0, 1, 2, 3]
 *                 description: Study intensity level (0-3)
 *               custom_instructions:
 *                 type: string
 *                 description: Custom generation instructions
 *               sources:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Source URLs for content generation
 *     responses:
 *       200:
 *         description: Updated track
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Track'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Track not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// PATCH /tracks/:key
router.patch('/:key', async (req, res, next) => {
  try {
    const parsed = patchTrackSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body');
    }

    const updates = parsed.data;

    if (updates.sources) {
      const invalidUrls = updates.sources.filter((s) => !isValidUrl(s));
      if (invalidUrls.length > 0) {
        throw new AppError(400, 'VALIDATION_ERROR', `Invalid URL(s): ${invalidUrls.join(', ')}`);
      }
    }

    const track = await Track.findOneAndUpdate(
      { key: req.params.key },
      { $set: updates },
      { new: true },
    ).lean();

    if (!track) {
      throw new AppError(404, 'NOT_FOUND', `Track '${req.params.key}' not found`);
    }

    res.json(track);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /tracks/{key}/topics:
 *   get:
 *     summary: Get topic tree for a track
 *     description: Returns the full topic tree for the given track key.
 *     tags: [Tracks]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: The track key
 *     responses:
 *       200:
 *         description: Array of topic objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                   name:
 *                     type: string
 *                   path:
 *                     type: string
 *                   parent_id:
 *                     type: string
 *                     nullable: true
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// GET /tracks/:key/topics
router.get('/:key/topics', async (req, res, next) => {
  try {
    const topics = await Topic.find({ track_key: req.params.key }).lean();
    res.json(topics);
  } catch (err) {
    next(err);
  }
});

export default router;
