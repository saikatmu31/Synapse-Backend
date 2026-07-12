import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { ConceptDoc, Misconception, Mastery, Question, Dispute } from '../../models/index.js';
import { AppError } from '../middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// /v1/concepts
// ---------------------------------------------------------------------------

export const conceptsRouter = Router();

/**
 * @openapi
 * /concepts/{id}:
 *   get:
 *     summary: Fetch a concept doc by ID
 *     description: Returns a single concept document identified by its ID.
 *     tags: [Content]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The concept document ID
 *     responses:
 *       200:
 *         description: The concept document
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConceptDoc'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Concept doc not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
conceptsRouter.get('/:id', async (req, res, next) => {
  try {
    const doc = await ConceptDoc.findById(req.params.id).lean();
    if (!doc) throw new AppError(404, 'NOT_FOUND', 'ConceptDoc not found');
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// /v1/misconceptions
// ---------------------------------------------------------------------------

export const misconceptionsRouter = Router();

/**
 * @openapi
 * /misconceptions:
 *   get:
 *     summary: List misconceptions
 *     description: Returns a list of misconceptions, optionally filtered by status. Each result includes the misconception fields plus a kill_progress value joined from mastery data.
 *     tags: [Content]
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [active, squashed]
 *         description: Filter by misconception status. "active" means not yet squashed (kill_progress < 3); "squashed" means fully resolved (kill_progress = 3).
 *     responses:
 *       200:
 *         description: Array of misconceptions with kill_progress
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Misconception'
 *                   - type: object
 *                     properties:
 *                       kill_progress:
 *                         type: integer
 *                         description: Number of consecutive distinct correct answers (0-3)
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
misconceptionsRouter.get('/', async (req, res, next) => {
  try {
    const status = req.query['status'] as string | undefined;
    if (status && !['active', 'squashed'].includes(status)) {
      throw new AppError(400, 'VALIDATION_ERROR', "status must be 'active' or 'squashed'");
    }

    let cdcFilter: Record<string, unknown> = {};
    if (status === 'active') {
      cdcFilter = { consecutive_distinct_correct: { $lt: 3 } };
    } else if (status === 'squashed') {
      cdcFilter = { consecutive_distinct_correct: 3 };
    }

    const masteryDocs = await Mastery.find({
      subject_type: 'misconception',
      ...cdcFilter,
    }).lean();

    const misconceptionIds = masteryDocs.map((m) => m.subject_id);
    const misconceptions = await Misconception.find({
      _id: { $in: misconceptionIds },
    }).lean();

    const masteryById = new Map(masteryDocs.map((m) => [m.subject_id, m]));
    const result = misconceptions.map((m) => ({
      ...m,
      kill_progress: masteryById.get(m._id)?.consecutive_distinct_correct ?? 0,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// /v1/disputes
// ---------------------------------------------------------------------------

export const disputesRouter = Router();

const disputeBodySchema = z.object({
  question_id: z.string(),
  reason_tag: z.enum(['two-defensible', 'contradicts-source', 'unclear', 'other', 'source-changed']),
  note: z.string().optional(),
});

/**
 * @openapi
 * /disputes:
 *   post:
 *     summary: Flag a bad question
 *     description: Creates a dispute record for a question and marks the question status as disputed.
 *     tags: [Content]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question_id, reason_tag]
 *             properties:
 *               question_id:
 *                 type: string
 *                 description: The ID of the question being disputed
 *               reason_tag:
 *                 type: string
 *                 enum: [two-defensible, contradicts-source, unclear, other, source-changed]
 *                 description: The reason for disputing the question
 *               note:
 *                 type: string
 *                 description: Optional additional context
 *     responses:
 *       201:
 *         description: Created dispute record
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Question not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
disputesRouter.post('/', async (req, res, next) => {
  try {
    const parsed = disputeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body');
    }

    const { question_id, reason_tag, note } = parsed.data;

    if (!mongoose.Types.ObjectId.isValid(question_id)) {
      throw new AppError(404, 'NOT_FOUND', 'Question not found');
    }

    const question = await Question.findById(question_id);
    if (!question) throw new AppError(404, 'NOT_FOUND', 'Question not found');

    question.status = 'disputed';
    await question.save();

    const dispute = await Dispute.create({
      question_id: new mongoose.Types.ObjectId(question_id),
      reason_tag,
      note,
      resolution: 'pending',
    });

    res.status(201).json(dispute);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /disputes:
 *   get:
 *     summary: List all disputes
 *     description: Returns all dispute records sorted by timestamp descending.
 *     tags: [Content]
 *     responses:
 *       200:
 *         description: Array of dispute records
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Dispute'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
disputesRouter.get('/', async (_req, res, next) => {
  try {
    const disputes = await Dispute.find().sort({ ts: -1 }).lean();
    res.json(disputes);
  } catch (err) {
    next(err);
  }
});
