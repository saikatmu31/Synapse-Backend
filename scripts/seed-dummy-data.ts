import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/lib/db.js';
import {
  Track,
  Topic,
  SourceChunk,
  ConceptDoc,
  Misconception,
  Question,
  Mastery,
  Attempt,
  UserState,
  Dispute,
} from '../src/models/index.js';

async function main(): Promise<void> {
  await connectDB();
  console.log('Connected to DB');

  // -------------------------------------------------------------------------
  // 1. Track
  // -------------------------------------------------------------------------
  await Track.findOneAndReplace(
    { _id: 'dea-c01' },
    {
      _id: 'dea-c01',
      key: 'dea-c01',
      name: 'AWS Data Engineer Associate',
      kind: 'certification',
      blueprint: [
        { domain: 'Data Ingestion and Transformation', weight: 0.34 },
        { domain: 'Store and Manage Data', weight: 0.26 },
        { domain: 'Data Operations and Support', weight: 0.22 },
        { domain: 'Data Security and Governance', weight: 0.18 },
      ],
      intensity: 3,
      custom_instructions: '',
      sources: [],
      created_at: new Date(),
    },
    { upsert: true, new: true },
  );
  console.log('Seeded Track: dea-c01');

  // -------------------------------------------------------------------------
  // 2. Topic
  // -------------------------------------------------------------------------
  await Topic.findOneAndReplace(
    { track_key: 'dea-c01', path: 'aws/s3' },
    {
      track_key: 'dea-c01',
      parent_id: null,
      name: 'S3 Storage',
      path: 'aws/s3',
    },
    { upsert: true, new: true },
  );
  console.log('Seeded Topic: aws/s3');

  // -------------------------------------------------------------------------
  // 3. SourceChunk
  // -------------------------------------------------------------------------
  const chunkText =
    'Amazon S3 now delivers strong read-after-write consistency automatically for all objects, including PUT and DELETE requests. This applies to all existing and new S3 buckets. Strong consistency means that after a successful write, any subsequent read request immediately receives the latest version of the object. There is no additional cost and no performance impact. Multipart uploads also benefit from strong consistency.';

  let chunk = await SourceChunk.findOne({
    url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
    chunk_index: 0,
  });
  if (!chunk) {
    chunk = await SourceChunk.create({
      url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
      track_key: 'dea-c01',
      topic_path: 'aws/s3',
      title: 'Amazon S3 Overview',
      text: chunkText,
      chunk_index: 0,
      hash: 'abc123hash',
      fetched_at: new Date(),
      status: 'active',
    });
  }
  console.log('Seeded SourceChunk:', chunk._id.toString());

  // -------------------------------------------------------------------------
  // 4. ConceptDocs
  // -------------------------------------------------------------------------
  let cdoc1 = await ConceptDoc.findOne({ title: 'S3 Strong Consistency' });
  if (!cdoc1) {
    cdoc1 = await ConceptDoc.create({
      title: 'S3 Strong Consistency',
      body_md:
        '## S3 Strong Consistency\n\nAs of December 2020, Amazon S3 delivers **strong read-after-write consistency** for all objects automatically.\n\nThis means:\n- After a successful PUT, any subsequent GET returns the latest version.\n- After a DELETE, subsequent GETs return a 404.\n- Applies to all regions and all existing buckets — no migration needed.\n\n**Common trap:** Many study materials from before 2020 describe S3 as eventually consistent. This is no longer true.\n\nSource → https://aws.amazon.com/s3/consistency/',
      source_url: 'https://docs.aws.amazon.com/...',
      chunk_id: chunk._id,
      topic_path: 'aws/s3',
    });
  }
  console.log('Seeded ConceptDoc 1:', cdoc1._id.toString());

  let cdoc2 = await ConceptDoc.findOne({ title: 'S3 Multipart Upload' });
  if (!cdoc2) {
    cdoc2 = await ConceptDoc.create({
      title: 'S3 Multipart Upload',
      body_md:
        '## Multipart Upload\n\nMultipart upload lets you upload large objects in parts. Parts can be uploaded independently and in any order. Strong consistency applies to the completed multipart object.\n\nSource → https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html',
      source_url: 'https://docs.aws.amazon.com/...',
      chunk_id: chunk._id,
      topic_path: 'aws/s3',
    });
  }
  console.log('Seeded ConceptDoc 2:', cdoc2._id.toString());

  // -------------------------------------------------------------------------
  // 5. Misconceptions
  // -------------------------------------------------------------------------
  await Misconception.findOneAndReplace(
    { _id: 's3-eventual-consistency' },
    {
      _id: 's3-eventual-consistency',
      description: 'Believes S3 is still eventually consistent for read-after-write',
      topic_path: 'aws/s3',
      concept_doc_id: cdoc1._id,
      created_at: new Date(),
    },
    { upsert: true, new: true },
  );
  console.log('Seeded Misconception: s3-eventual-consistency');

  await Misconception.findOneAndReplace(
    { _id: 's3-multipart-eventually-consistent' },
    {
      _id: 's3-multipart-eventually-consistent',
      description: 'Believes multipart uploads are not covered by strong consistency',
      topic_path: 'aws/s3',
      concept_doc_id: cdoc2._id,
      created_at: new Date(),
    },
    { upsert: true, new: true },
  );
  console.log('Seeded Misconception: s3-multipart-eventually-consistent');

  // -------------------------------------------------------------------------
  // 6. Questions
  // -------------------------------------------------------------------------

  // Question 1
  let q1 = await Question.findOne({
    stem: 'After a successful PUT to an S3 bucket, an application immediately reads the same key. What does S3 return?',
  });
  if (!q1) {
    q1 = await Question.create({
      stem: 'After a successful PUT to an S3 bucket, an application immediately reads the same key. What does S3 return?',
      options: [
        {
          text: 'The latest version of the object',
          correct: true,
          explanation: 'S3 now delivers strong read-after-write consistency for all PUT requests.',
        },
        {
          text: 'The previous version of the object',
          misconception_id: 's3-eventual-consistency',
          thought_process:
            'You picked this because you recall S3 being eventually consistent, which was true before December 2020.',
        },
        {
          text: 'A 404 Not Found error',
          misconception_id: 's3-eventual-consistency',
          thought_process:
            'You picked this because you thought the new object might not yet be visible to read requests.',
        },
        {
          text: 'An eventual-consistency wait token',
          misconception_id: 's3-eventual-consistency',
          thought_process: 'You invented a mechanism that does not exist in S3.',
        },
      ],
      evidence_quote:
        'Amazon S3 now delivers strong read-after-write consistency automatically for all objects, including PUT and DELETE requests.',
      chunk_id: chunk._id,
      source_url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
      track_key: 'dea-c01',
      topic_path: 'aws/s3',
      difficulty: 2,
      is_boss: false,
      status: 'verified',
      verified_at: new Date(),
      gate_results: { evidence: true, solver: true, form: true, solver_confidence: 0.95 },
      created_at: new Date(),
    });
  }
  console.log('Seeded Question 1:', q1._id.toString());

  // Question 2
  let q2 = await Question.findOne({
    stem: 'Which statement about S3 strong consistency is correct?',
  });
  if (!q2) {
    q2 = await Question.create({
      stem: 'Which statement about S3 strong consistency is correct?',
      options: [
        {
          text: 'It applies to all existing and new S3 buckets at no additional cost',
          correct: true,
          explanation:
            'S3 strong consistency applies to all buckets with no additional cost or performance impact.',
        },
        {
          text: 'It requires opting in per bucket through the S3 console',
          misconception_id: 's3-eventual-consistency',
          thought_process:
            'You thought strong consistency was an opt-in feature, but it is on by default for all buckets.',
        },
        {
          text: 'It applies only to new buckets created after December 2020',
          misconception_id: 's3-eventual-consistency',
          thought_process:
            'You thought the feature only applied to newly created buckets, but it applies to all existing buckets too.',
        },
        {
          text: 'It incurs additional GET request charges',
          misconception_id: 's3-eventual-consistency',
          thought_process:
            'You assumed consistency guarantees would add cost, but there is no additional charge.',
        },
      ],
      evidence_quote:
        'This applies to all existing and new S3 buckets. Strong consistency means that after a successful write, any subsequent read request immediately receives the latest version of the object. There is no additional cost and no performance impact.',
      chunk_id: chunk._id,
      source_url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
      track_key: 'dea-c01',
      topic_path: 'aws/s3',
      difficulty: 3,
      is_boss: false,
      status: 'verified',
      verified_at: new Date(),
      gate_results: { evidence: true, solver: true, form: true, solver_confidence: 0.92 },
      created_at: new Date(),
    });
  }
  console.log('Seeded Question 2:', q2._id.toString());

  // Question 3
  let q3 = await Question.findOne({
    stem: 'A pipeline writes 10,000 objects to S3 using multipart upload and then immediately runs a LIST operation on the same prefix. What should the pipeline expect?',
  });
  if (!q3) {
    q3 = await Question.create({
      stem: 'A pipeline writes 10,000 objects to S3 using multipart upload and then immediately runs a LIST operation on the same prefix. What should the pipeline expect?',
      options: [
        {
          text: 'All 10,000 objects appear in the LIST result immediately',
          correct: true,
          explanation:
            'Multipart uploads also benefit from strong consistency. After a successful multipart upload completes, LIST operations immediately reflect the new objects.',
        },
        {
          text: 'LIST may return 0 objects due to eventual consistency lag',
          misconception_id: 's3-multipart-eventually-consistent',
          thought_process:
            'You assumed multipart uploads are not covered by strong consistency guarantees, but they are.',
        },
        {
          text: 'Only the parts are visible, not the completed object',
          misconception_id: 's3-multipart-eventually-consistent',
          thought_process:
            'You thought incomplete multipart parts would appear before the final object, but S3 only shows completed objects in LIST.',
        },
        {
          text: 'LIST must be retried with exponential backoff to ensure all objects appear',
          misconception_id: 's3-eventual-consistency',
          thought_process:
            'You applied the old eventual-consistency retry pattern which is no longer needed for S3.',
        },
      ],
      evidence_quote: 'Multipart uploads also benefit from strong consistency.',
      chunk_id: chunk._id,
      source_url: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
      track_key: 'dea-c01',
      topic_path: 'aws/s3',
      difficulty: 4,
      is_boss: true,
      status: 'verified',
      verified_at: new Date(),
      gate_results: { evidence: true, solver: true, form: true, solver_confidence: 0.91 },
      created_at: new Date(),
    });
  }
  console.log('Seeded Question 3 (boss):', q3._id.toString());

  // -------------------------------------------------------------------------
  // 7. Mastery docs
  // -------------------------------------------------------------------------
  await Mastery.findOneAndReplace(
    { subject_type: 'misconception', subject_id: 's3-eventual-consistency' },
    {
      subject_type: 'misconception',
      subject_id: 's3-eventual-consistency',
      fsrs: { stability: 2, difficulty: 5, last_review: null, due: new Date() },
      strength: 0.18,
      consecutive_distinct_correct: 0,
      last_question_ids: [],
    },
    { upsert: true, new: true },
  );
  console.log('Seeded Mastery: misconception/s3-eventual-consistency');

  await Mastery.findOneAndReplace(
    { subject_type: 'topic', subject_id: 'aws/s3' },
    {
      subject_type: 'topic',
      subject_id: 'aws/s3',
      fsrs: { stability: 2, difficulty: 5, last_review: null, due: new Date() },
      strength: 0.18,
      consecutive_distinct_correct: 0,
      last_question_ids: [],
    },
    { upsert: true, new: true },
  );
  console.log('Seeded Mastery: topic/aws/s3');

  // -------------------------------------------------------------------------
  // 8. Attempt (for Question 1, wrong answer at index 1)
  // -------------------------------------------------------------------------
  try {
    await Attempt.create({
      idempotency_key: 'seed-attempt-001',
      question_id: q1._id,
      selected_index: 1,
      correct: false,
      misconception_id: 's3-eventual-consistency',
      mode: 'daily',
      latency_ms: 3200,
      ts: new Date(),
      synced: true,
    });
    console.log('Seeded Attempt: seed-attempt-001');
  } catch (err: unknown) {
    if ((err as { code?: number }).code === 11000) {
      console.log('Attempt seed-attempt-001 already exists, skipping');
    } else {
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // 9. UserState singleton
  // -------------------------------------------------------------------------
  await UserState.findOneAndReplace(
    { _id: 'me' },
    {
      _id: 'me',
      streak: { current: 3, best: 7, freeze_tokens: 2, last_active_date: '2024-06-01' },
      xp: 450,
      level: 3,
      daily_goal: 10,
      notification_hour: 7,
      timezone: 'Asia/Kolkata',
      insight_cards_unlocked: [],
      settings: {},
    },
    { upsert: true, new: true },
  );
  console.log('Seeded UserState: me');

  // -------------------------------------------------------------------------
  // 10. Dispute (for Question 2)
  // -------------------------------------------------------------------------
  const existingDispute = await Dispute.findOne({ question_id: q2._id, reason_tag: 'two-defensible' });
  if (!existingDispute) {
    await Dispute.create({
      question_id: q2._id,
      reason_tag: 'two-defensible',
      note: 'Options 1 and 2 both seem correct to me',
      ts: new Date(),
      resolution: 'pending',
    });
    console.log('Seeded Dispute for Question 2');
  } else {
    console.log('Dispute for Question 2 already exists, skipping');
  }

  console.log('\nSeed complete.');
  await disconnectDB();
}

main().catch((err: unknown) => {
  console.error('seed-dummy-data failed:', err);
  process.exit(1);
});
