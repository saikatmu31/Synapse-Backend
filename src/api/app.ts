import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { swaggerSpec } from './swagger.js';
import quizRoutes from './routes/quiz.routes.js';
import attemptsRoutes from './routes/attempts.routes.js';
import syncRoutes from './routes/sync.routes.js';
import { conceptsRouter, misconceptionsRouter, disputesRouter } from './routes/content.routes.js';
import tracksRoutes from './routes/tracks.routes.js';
import mapRoutes from './routes/map.routes.js';
import statsRoutes from './routes/stats.routes.js';
import userRoutes from './routes/user.routes.js';
import generateRoutes from './routes/generate.routes.js';

export function createApp(): express.Application {
  const app = express();

  app.use(compression());
  app.use(cors());
  app.use(express.json());

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Swagger UI — no auth required
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Synapse API Docs',
    customCss: '.swagger-ui .topbar { background-color: #1a1a2e; } .swagger-ui .topbar-wrapper .link span { display: none; }',
    swaggerOptions: { persistAuthorization: true },
  }));
  app.get('/docs.json', (_req, res) => res.json(swaggerSpec));

  // Health check — no auth
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Auth on all /v1/* routes
  app.use('/v1', requireAuth);

  // Routes
  app.use('/v1/quiz', quizRoutes);
  app.use('/v1/attempts', attemptsRoutes);
  app.use('/v1/sync', syncRoutes);
  app.use('/v1/concepts', conceptsRouter);
  app.use('/v1/misconceptions', misconceptionsRouter);
  app.use('/v1/disputes', disputesRouter);
  app.use('/v1/tracks', tracksRoutes);
  app.use('/v1/map', mapRoutes);
  app.use('/v1/stats', statsRoutes);
  app.use('/v1/user', userRoutes);
  app.use('/v1/generate', generateRoutes);

  // 404
  app.use((_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'Route not found' });
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
