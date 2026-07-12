import { Router } from 'express';
import { getMapPayload } from '../../services/mastery.service.js';

const router = Router();

/**
 * @openapi
 * /map:
 *   get:
 *     summary: Get Neural Map payload
 *     description: Returns the full Neural Map payload for all topics, including mastery and readiness data per topic node.
 *     tags: [Neural Map]
 *     responses:
 *       200:
 *         description: Neural Map payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MapPayload'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/', async (req, res, next) => {
  try {
    const map = await getMapPayload();
    res.json(map);
  } catch (err) {
    next(err);
  }
});

export default router;
