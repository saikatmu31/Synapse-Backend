import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../src/api/app.js';
import {
  Track,
  Topic,
  SourceChunk,
  Question,
  Misconception,
  ConceptDoc,
  Attempt,
  Mastery,
  Dispute,
  UserState,
} from '../src/models/index.js';
import type { Express } from 'express';

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let mongod: MongoMemoryServer;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: Express;
const TOKEN = 'test-token-abc123';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // Override the placeholder URI set in test/setup.ts with the real in-memory URI.
  process.env.MONGODB_URI = mongod.getUri() + 'synapse';
  await mongoose.connect(mongod.getUri() + 'synapse');
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  // Wipe all collections before every test so tests are isolated.
  await Promise.all([
    Track.deleteMany({}),
    Topic.deleteMany({}),
    SourceChunk.deleteMany({}),
    Question.deleteMany({}),
    Misconception.deleteMany({}),
    ConceptDoc.deleteMany({}),
    Attempt.deleteMany({}),
    Mastery.deleteMany({}),
    Dispute.deleteMany({}),
    UserState.deleteMany({}),
  ]);
});

// ---------------------------------------------------------------------------
// Minimal seed helper
// ---------------------------------------------------------------------------

async function seedMinimal() {
  const track = await Track.create({
    _id: 'dea-c01',
    key: 'dea-c01',
    name: 'AWS DEA',
    kind: 'certification',
    blueprint: [{ domain: 'Data Ingestion', weight: 0.34 }],
    intensity: 3,
    custom_instructions: '',
    sources: [],
    created_at: new Date(),
  });

  const chunk = await SourceChunk.create({
    url: 'https://docs.aws.amazon.com/s3',
    track_key: 'dea-c01',
    topic_path: 'aws/s3',
    title: 'S3 Docs',
    text: 'S3 now delivers strong read-after-write consistency automatically.',
    chunk_index: 0,
    hash: 'abc123',
    fetched_at: new Date(),
    status: 'active',
  });

  const cdoc = await ConceptDoc.create({
    title: 'S3 Consistency',
    body_md: '## S3\nStrong consistency.\nSource → https://aws.amazon.com',
    source_url: 'https://docs.aws.amazon.com/s3',
    chunk_id: chunk._id,
    topic_path: 'aws/s3',
  });

  const misconception = await Misconception.create({
    _id: 's3-eventual-consistency',
    description: 'Believes S3 is eventually consistent',
    topic_path: 'aws/s3',
    concept_doc_id: cdoc._id,
    created_at: new Date(),
  });

  const question = await Question.create({
    stem: 'What consistency model does S3 use?',
    options: [
      {
        text: 'Strong consistency',
        correct: true,
        explanation: 'S3 uses strong consistency since 2020.',
      },
      {
        text: 'Eventual consistency',
        misconception_id: 's3-eventual-consistency',
        thought_process: 'You picked this because of old docs.',
      },
      {
        text: 'Read-your-writes only',
        misconception_id: 's3-eventual-consistency',
        thought_process: 'This is not a separate S3 model.',
      },
      {
        text: 'No consistency guarantee',
        misconception_id: 's3-eventual-consistency',
        thought_process: 'S3 does have strong guarantees.',
      },
    ],
    evidence_quote: 'S3 now delivers strong read-after-write consistency automatically.',
    chunk_id: chunk._id,
    source_url: 'https://docs.aws.amazon.com/s3',
    track_key: 'dea-c01',
    topic_path: 'aws/s3',
    difficulty: 2,
    is_boss: false,
    status: 'verified',
    verified_at: new Date(),
    gate_results: { evidence: true, solver: true, form: true, solver_confidence: 0.95 },
    created_at: new Date(),
  });

  const userState = await UserState.create({
    _id: 'me',
    streak: { current: 3, best: 7, freeze_tokens: 2, last_active_date: '2024-06-01' },
    xp: 450,
    level: 3,
    daily_goal: 10,
    notification_hour: 7,
    timezone: 'Asia/Kolkata',
    insight_cards_unlocked: [],
    settings: {},
  });

  // Seed a Mastery doc for the misconception so drill / misconceptions list work.
  await Mastery.create({
    subject_type: 'misconception',
    subject_id: 's3-eventual-consistency',
    fsrs: { stability: 2, difficulty: 5, last_review: null, due: new Date(Date.now() - 1000) },
    strength: 0.18,
    consecutive_distinct_correct: 0,
    last_question_ids: [],
  });

  // Seed a Topic so the map endpoint returns nodes.
  await Topic.create({
    track_key: 'dea-c01',
    parent_id: null,
    name: 'S3 Storage',
    path: 'aws/s3',
  });

  return { track, chunk, cdoc, misconception, question, userState };
}

// ---------------------------------------------------------------------------
// Auth tests
// ---------------------------------------------------------------------------

describe('Auth', () => {
  it('returns 401 with no token', async () => {
    const res = await request(app).get('/v1/user');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 with wrong token', async () => {
    const res = await request(app)
      .get('/v1/user')
      .set('Authorization', 'Bearer wrong-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('passes with correct token', async () => {
    await seedMinimal();
    const res = await request(app)
      .get('/v1/user')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe('me');
  });
});

// ---------------------------------------------------------------------------
// GET /quiz
// ---------------------------------------------------------------------------

describe('GET /quiz', () => {
  it('returns 400 when mode is missing', async () => {
    const res = await request(app)
      .get('/v1/quiz')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when mode is invalid', async () => {
    const res = await request(app)
      .get('/v1/quiz?mode=bogus')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for topic mode without topic param', async () => {
    const res = await request(app)
      .get('/v1/quiz?mode=topic')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for exam mode without track param', async () => {
    const res = await request(app)
      .get('/v1/quiz?mode=exam')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns quiz payload for daily mode', async () => {
    await seedMinimal();
    const res = await request(app)
      .get('/v1/quiz?mode=daily')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('quiz_id');
    expect(res.body).toHaveProperty('mode', 'daily');
    expect(res.body).toHaveProperty('questions');
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body).toHaveProperty('meta');
  });

  it('returns shortfall flag when pool is empty', async () => {
    // No questions seeded — expect shortfall: true.
    const res = await request(app)
      .get('/v1/quiz?mode=daily')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.shortfall).toBe(true);
  });

  it('never leaks correct flag in options', async () => {
    await seedMinimal();
    const res = await request(app)
      .get('/v1/quiz?mode=daily')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    for (const q of res.body.questions) {
      for (const opt of q.options) {
        expect(opt).not.toHaveProperty('correct');
        expect(opt).not.toHaveProperty('explanation');
        expect(opt).not.toHaveProperty('misconception_id');
        expect(opt).not.toHaveProperty('thought_process');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// POST /attempts
// ---------------------------------------------------------------------------

describe('POST /attempts', () => {
  it('returns 400 for invalid body', async () => {
    const res = await request(app)
      .post('/v1/attempts')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ bad: 'data' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('grades a correct answer', async () => {
    const { question } = await seedMinimal();
    const res = await request(app)
      .post('/v1/attempts')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send([
        {
          idempotency_key: 'test-correct-001',
          question_id: question._id.toString(),
          selected_index: 0, // index 0 is the correct option
          mode: 'daily',
          latency_ms: 1500,
        },
      ]);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].correct).toBe(true);
    expect(res.body[0].correct_index).toBe(0);
    expect(res.body[0]).toHaveProperty('explanation');
    expect(res.body[0]).toHaveProperty('rewards');
  });

  it('grades a wrong answer', async () => {
    const { question } = await seedMinimal();
    const res = await request(app)
      .post('/v1/attempts')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send([
        {
          idempotency_key: 'test-wrong-001',
          question_id: question._id.toString(),
          selected_index: 1, // index 1 is wrong (eventual consistency distractor)
          mode: 'daily',
          latency_ms: 2000,
        },
      ]);
    expect(res.status).toBe(200);
    expect(res.body[0].correct).toBe(false);
    expect(res.body[0].correct_index).toBe(0);
  });

  it('returns misconception info on wrong answer', async () => {
    const { question } = await seedMinimal();
    const res = await request(app)
      .post('/v1/attempts')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send([
        {
          idempotency_key: 'test-misconcept-001',
          question_id: question._id.toString(),
          selected_index: 1,
          mode: 'daily',
          latency_ms: 2000,
        },
      ]);
    expect(res.status).toBe(200);
    const result = res.body[0];
    expect(result.correct).toBe(false);
    expect(result).toHaveProperty('misconception');
    expect(result.misconception.id).toBe('s3-eventual-consistency');
    expect(result.misconception).toHaveProperty('description');
    expect(result.misconception).toHaveProperty('thought_process');
    expect(result.misconception).toHaveProperty('kill_progress');
    expect(result).toHaveProperty('concept_doc_id');
  });

  it('is idempotent — duplicate key returns same result', async () => {
    const { question } = await seedMinimal();
    const payload = [
      {
        idempotency_key: 'test-idempotent-001',
        question_id: question._id.toString(),
        selected_index: 0,
        mode: 'daily',
        latency_ms: 1000,
      },
    ];

    const res1 = await request(app)
      .post('/v1/attempts')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(payload);
    expect(res1.status).toBe(200);

    const res2 = await request(app)
      .post('/v1/attempts')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(payload);
    expect(res2.status).toBe(200);

    // Verify only one Attempt document was stored despite two requests.
    const storedCount = await Attempt.countDocuments({ idempotency_key: 'test-idempotent-001' });
    expect(storedCount).toBe(1);

    // Both responses report the same correctness.
    expect(res1.body[0].correct).toBe(res2.body[0].correct);
  });

  it('returns 404 for unknown question_id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .post('/v1/attempts')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send([
        {
          idempotency_key: 'test-missing-q',
          question_id: fakeId,
          selected_index: 0,
          mode: 'daily',
          latency_ms: 500,
        },
      ]);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /sync/batch
// ---------------------------------------------------------------------------

describe('GET /sync/batch', () => {
  it('returns offline bundle shape', async () => {
    await seedMinimal();
    const res = await request(app)
      .get('/v1/sync/batch')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('daily_quiz');
    expect(res.body).toHaveProperty('drill_reserve');
    expect(res.body).toHaveProperty('user_state');
    expect(res.body).toHaveProperty('map');
    expect(res.body).toHaveProperty('synced_at');
    expect(res.body).toHaveProperty('concept_docs');
    expect(res.body).toHaveProperty('misconceptions');
    // synced_at should be a parseable ISO date string.
    expect(() => new Date(res.body.synced_at)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GET /concepts/:id
// ---------------------------------------------------------------------------

describe('GET /concepts/:id', () => {
  it('returns the concept doc', async () => {
    const { cdoc } = await seedMinimal();
    const res = await request(app)
      .get(`/v1/concepts/${cdoc._id.toString()}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe(cdoc._id.toString());
    expect(res.body.title).toBe('S3 Consistency');
    expect(res.body).toHaveProperty('body_md');
    expect(res.body).toHaveProperty('topic_path', 'aws/s3');
  });

  it('returns 404 for unknown id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .get(`/v1/concepts/${fakeId}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------
// GET /misconceptions
// ---------------------------------------------------------------------------

describe('GET /misconceptions', () => {
  it('returns active misconceptions', async () => {
    await seedMinimal();
    const res = await request(app)
      .get('/v1/misconceptions?status=active')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const item = res.body[0];
    expect(item).toHaveProperty('_id');
    expect(item).toHaveProperty('description');
    expect(item).toHaveProperty('kill_progress');
    // Active = not yet squashed, so kill_progress should be < 3.
    expect(item.kill_progress).toBeLessThan(3);
  });

  it('returns 400 for invalid status param', async () => {
    const res = await request(app)
      .get('/v1/misconceptions?status=invalid')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// POST /disputes
// ---------------------------------------------------------------------------

describe('POST /disputes', () => {
  it('creates a dispute and sets question to disputed', async () => {
    const { question } = await seedMinimal();
    const res = await request(app)
      .post('/v1/disputes')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        question_id: question._id.toString(),
        reason_tag: 'two-defensible',
        note: 'Both options A and B seem correct.',
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('question_id');
    expect(res.body.reason_tag).toBe('two-defensible');
    expect(res.body.resolution).toBe('pending');

    // Verify the question status was updated in the DB.
    const updatedQ = await Question.findById(question._id).lean();
    expect(updatedQ?.status).toBe('disputed');
  });

  it('returns 400 for invalid reason_tag', async () => {
    const { question } = await seedMinimal();
    const res = await request(app)
      .post('/v1/disputes')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        question_id: question._id.toString(),
        reason_tag: 'not-a-real-tag',
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------
// GET /tracks
// ---------------------------------------------------------------------------

describe('GET /tracks', () => {
  it('returns all tracks', async () => {
    await seedMinimal();
    const res = await request(app)
      .get('/v1/tracks')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0]._id).toBe('dea-c01');
    expect(res.body[0]).toHaveProperty('cert_readiness');
  });
});

// ---------------------------------------------------------------------------
// POST /tracks
// ---------------------------------------------------------------------------

describe('POST /tracks', () => {
  it('creates a new track', async () => {
    const res = await request(app)
      .post('/v1/tracks')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        key: 'new-track',
        name: 'New Track',
        kind: 'skill',
        intensity: 2,
        custom_instructions: '',
        sources: ['https://example.com/docs'],
      });
    expect(res.status).toBe(201);
    expect(res.body._id).toBe('new-track');
    expect(res.body.name).toBe('New Track');
    expect(res.body.kind).toBe('skill');

    // Confirm it persists in the DB.
    const stored = await Track.findById('new-track').lean();
    expect(stored).not.toBeNull();
  });

  it('returns 409 for duplicate key', async () => {
    await seedMinimal(); // creates dea-c01

    const res = await request(app)
      .post('/v1/tracks')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({
        key: 'dea-c01',
        name: 'Duplicate Track',
        kind: 'certification',
        intensity: 1,
        custom_instructions: '',
        sources: ['https://example.com'],
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_KEY');
  });
});

// ---------------------------------------------------------------------------
// GET /map
// ---------------------------------------------------------------------------

describe('GET /map', () => {
  it('returns map payload with nodes and edges', async () => {
    await seedMinimal();
    const res = await request(app)
      .get('/v1/map')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('nodes');
    expect(res.body).toHaveProperty('edges');
    expect(Array.isArray(res.body.nodes)).toBe(true);
    expect(Array.isArray(res.body.edges)).toBe(true);
    // The seeded topic should appear as a node.
    expect(res.body.nodes.length).toBeGreaterThan(0);
    const node = res.body.nodes[0];
    expect(node).toHaveProperty('topic_path');
    expect(node).toHaveProperty('name');
    expect(node).toHaveProperty('track');
    expect(node).toHaveProperty('coverage');
    expect(node).toHaveProperty('strength');
    expect(node).toHaveProperty('due_count');
  });
});

// ---------------------------------------------------------------------------
// GET /stats/overview
// ---------------------------------------------------------------------------

describe('GET /stats/overview', () => {
  it('returns stats shape', async () => {
    await seedMinimal();
    const res = await request(app)
      .get('/v1/stats/overview')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total_questions');
    expect(res.body).toHaveProperty('total_attempts');
    expect(res.body).toHaveProperty('active_misconceptions');
    expect(res.body).toHaveProperty('squashed_misconceptions');
    expect(res.body).toHaveProperty('streak');
    expect(res.body).toHaveProperty('xp');
    expect(res.body).toHaveProperty('level');
    expect(res.body).toHaveProperty('tracks');
    expect(Array.isArray(res.body.tracks)).toBe(true);
    // The seeded verified question should be counted.
    expect(res.body.total_questions).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GET /user and PATCH /user
// ---------------------------------------------------------------------------

describe('User', () => {
  it('GET /user returns user state', async () => {
    await seedMinimal();
    const res = await request(app)
      .get('/v1/user')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe('me');
    expect(res.body).toHaveProperty('streak');
    expect(res.body).toHaveProperty('xp');
    expect(res.body).toHaveProperty('level');
    expect(res.body).toHaveProperty('daily_goal');
    expect(res.body).toHaveProperty('timezone');
  });

  it('GET /user creates defaults when no state exists', async () => {
    // Do NOT call seedMinimal() — no UserState in DB.
    const res = await request(app)
      .get('/v1/user')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(200);
    expect(res.body._id).toBe('me');
    expect(res.body.xp).toBe(0);
    expect(res.body.level).toBe(1);
  });

  it('PATCH /user updates daily_goal', async () => {
    await seedMinimal();
    const res = await request(app)
      .patch('/v1/user')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ daily_goal: 20 });
    expect(res.status).toBe(200);
    expect(res.body.daily_goal).toBe(20);

    // Confirm persistence.
    const stored = await UserState.findById('me').lean();
    expect(stored?.daily_goal).toBe(20);
  });

  it('PATCH /user updates timezone', async () => {
    await seedMinimal();
    const res = await request(app)
      .patch('/v1/user')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ timezone: 'America/New_York' });
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('America/New_York');
  });

  it('PATCH /user rejects daily_goal below minimum', async () => {
    await seedMinimal();
    const res = await request(app)
      .patch('/v1/user')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ daily_goal: 0 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
