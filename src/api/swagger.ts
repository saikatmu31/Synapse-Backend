import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Synapse API',
      version: '1.0.0',
      description:
        'Misconception-driven quiz learning system. Single-user API — all routes require a Bearer token.',
      contact: { name: 'Synapse Backend' },
    },
    servers: [
      { url: 'http://localhost:3000/v1', description: 'Local dev' },
      { url: 'https://synapse-backend.onrender.com/v1', description: 'Render production' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Set APP_TOKEN from your .env file',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            code: { type: 'string', example: 'UNAUTHORIZED' },
            message: { type: 'string', example: 'Invalid or missing token' },
          },
        },
        Track: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: 'dea-c01' },
            key: { type: 'string', example: 'dea-c01' },
            name: { type: 'string', example: 'AWS Data Engineer Associate' },
            kind: { type: 'string', enum: ['certification', 'skill'] },
            intensity: { type: 'integer', minimum: 0, maximum: 3 },
            custom_instructions: { type: 'string' },
            sources: { type: 'array', items: { type: 'string' } },
            blueprint: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  domain: { type: 'string' },
                  weight: { type: 'number' },
                },
              },
            },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        QuizQuestion: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            stem: { type: 'string', example: 'A Kinesis shard receives 1.2 MB/s of data. What happens?' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: { text: { type: 'string' } },
              },
            },
            meta: {
              type: 'object',
              properties: {
                track_key: { type: 'string' },
                topic_path: { type: 'string' },
                is_boss: { type: 'boolean' },
                difficulty: { type: 'integer', minimum: 1, maximum: 5 },
                blueprint_domain: { type: 'string' },
              },
            },
          },
        },
        QuizPayload: {
          type: 'object',
          properties: {
            quiz_id: { type: 'string' },
            mode: { type: 'string', enum: ['daily', 'drill', 'topic', 'exam', 'adhoc'] },
            questions: { type: 'array', items: { $ref: '#/components/schemas/QuizQuestion' } },
            meta: {
              type: 'object',
              properties: { shortfall: { type: 'boolean' } },
            },
          },
        },
        AttemptInput: {
          type: 'object',
          required: ['idempotency_key', 'question_id', 'selected_index', 'mode', 'latency_ms'],
          properties: {
            idempotency_key: { type: 'string', example: 'session-abc123-q1' },
            question_id: { type: 'string' },
            selected_index: { type: 'integer', minimum: 0, maximum: 3 },
            mode: { type: 'string', enum: ['daily', 'drill', 'topic', 'exam', 'adhoc'] },
            latency_ms: { type: 'integer', minimum: 0 },
            client_ts: { type: 'string', format: 'date-time' },
          },
        },
        AttemptResult: {
          type: 'object',
          properties: {
            idempotency_key: { type: 'string' },
            correct: { type: 'boolean' },
            correct_index: { type: 'integer' },
            explanation: { type: 'string' },
            evidence_quote: { type: 'string' },
            source_url: { type: 'string' },
            misconception: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                description: { type: 'string' },
                thought_process: { type: 'string' },
                kill_progress: { type: 'integer', minimum: 0, maximum: 3 },
              },
            },
            concept_doc_id: { type: 'string', nullable: true },
            rewards: { $ref: '#/components/schemas/RewardResult' },
          },
        },
        RewardResult: {
          type: 'object',
          properties: {
            xp_delta: { type: 'integer' },
            new_xp: { type: 'integer' },
            new_level: { type: 'integer' },
            level_up: { type: 'boolean' },
            streak: {
              type: 'object',
              properties: {
                current: { type: 'integer' },
                best: { type: 'integer' },
                freeze_used: { type: 'boolean' },
                freeze_tokens: { type: 'integer' },
              },
            },
            squashed: { type: 'string', nullable: true, description: 'misconception_id if just squashed' },
            insight_card: { type: 'string', nullable: true, description: 'concept_doc id (~15% chance)' },
            momentum_event: {
              type: 'string',
              nullable: true,
              enum: ['combo_3', 'combo_5', 'boss_bonus'],
            },
          },
        },
        Misconception: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: 's3-strong-consistency-unknown' },
            description: { type: 'string' },
            topic_path: { type: 'string' },
            concept_doc_id: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        ConceptDoc: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            title: { type: 'string' },
            body_md: { type: 'string', description: '≤400 word markdown, ends with Source → link' },
            source_url: { type: 'string' },
            topic_path: { type: 'string' },
          },
        },
        Dispute: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            question_id: { type: 'string' },
            reason_tag: {
              type: 'string',
              enum: ['two-defensible', 'contradicts-source', 'unclear', 'other', 'source-changed'],
            },
            note: { type: 'string', nullable: true },
            ts: { type: 'string', format: 'date-time' },
            resolution: { type: 'string', enum: ['pending', 'fixed', 'retired'] },
          },
        },
        UserState: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: 'me' },
            streak: {
              type: 'object',
              properties: {
                current: { type: 'integer' },
                best: { type: 'integer' },
                freeze_tokens: { type: 'integer' },
                last_active_date: { type: 'string' },
              },
            },
            xp: { type: 'integer' },
            level: { type: 'integer' },
            daily_goal: { type: 'integer', default: 10 },
            notification_hour: { type: 'integer', minimum: 0, maximum: 23 },
            timezone: { type: 'string', example: 'Asia/Kolkata' },
            insight_cards_unlocked: { type: 'array', items: { type: 'string' } },
          },
        },
        MapPayload: {
          type: 'object',
          properties: {
            nodes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  topic_path: { type: 'string' },
                  name: { type: 'string' },
                  track: { type: 'string' },
                  coverage: { type: 'integer', description: 'Number of verified questions' },
                  strength: { type: 'number', minimum: 0, maximum: 1 },
                  due_count: { type: 'integer', description: 'Misconceptions due for review' },
                },
              },
            },
            edges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  from: { type: 'string' },
                  to: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ['./src/api/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
