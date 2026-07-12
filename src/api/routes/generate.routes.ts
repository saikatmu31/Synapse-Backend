import { Router } from 'express';
import { z } from 'zod';
import { assembleQuiz } from '../../services/quiz.service.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

const adhocBodySchema = z.object({
  prompt: z.string(),
  count: z.number().int().min(1).max(10),
});

/**
 * @openapi
 * /generate/adhoc:
 *   post:
 *     summary: Live question generation via SSE
 *     description: >
 *       Streams question generation progress as Server-Sent Events (SSE).
 *       First attempts to fulfil the request from the existing question pool.
 *       If the pool is insufficient, falls back to live generation.
 *       Each SSE event is a JSON object on the `data:` field with shape:
 *       `{ stage: 'generating'|'gate1'|'gate2'|'gate3'|'pool_hit'|'done'|'error', passed?: number, total?: number, questions?: QuizQuestion[], message?: string }`.
 *       The stream ends after the `done` or `error` event.
 *     tags: [Generation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [prompt, count]
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: Topic or instruction describing the desired questions
 *               count:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *                 description: Number of questions to generate (1-10)
 *     responses:
 *       200:
 *         description: SSE stream of generation progress events
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               description: >
 *                 Newline-delimited SSE stream. Each event: `data: <json>\n\n`.
 *                 JSON shape: { stage: string, passed?: number, total?: number, questions?: QuizQuestion[], message?: string }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// POST /generate/adhoc — SSE endpoint
router.post('/adhoc', async (req, res, next) => {
  try {
    const parsed = adhocBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid body');
    }

    const { prompt, count } = parsed.data;

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: unknown): void => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Try pool-first
      const pool = await assembleQuiz({ mode: 'adhoc', topic: prompt, count });
      if (pool.questions.length >= count) {
        send({ stage: 'pool_hit', questions: pool.questions });
        res.end();
        return;
      }

      // Not enough pool results — attempt generation
      send({ stage: 'generating', passed: pool.questions.length, total: count });

      // TODO: import from '../../pipeline/bootstrap.js' when available
      // const { generateAdhoc } = await import('../../pipeline/bootstrap.js');
      // const generated = await generateAdhoc(prompt, count, (progress) => send(progress));
      // send({ stage: 'done', questions: generated });

      // Stub: return whatever the pool gave us
      send({
        stage: 'done',
        questions: pool.questions,
        _note: 'Pipeline bootstrap not yet implemented; returning pool results only',
      });

      res.end();
    } catch (err) {
      send({ stage: 'error', message: err instanceof Error ? err.message : 'Generation failed' });
      res.end();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
