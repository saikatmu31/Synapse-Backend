import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/lib/index.js';
import { Track, Topic, UserState } from '../src/models/index.js';

const tracks = [
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
    custom_instructions:
      'Focus on service quotas, failure modes, and when to choose each AWS data service over alternatives. Include Glue, Kinesis, Redshift, EMR, and Lake Formation scenarios.',
    sources: [
      'https://d1.awsstatic.com/training-and-certification/docs-data-engineer-associate/AWS-Certified-Data-Engineer-Associate_Exam-Guide.pdf',
      'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
      'https://docs.aws.amazon.com/glue/latest/dg/what-is-glue.html',
      'https://docs.aws.amazon.com/streams/latest/dev/introduction.html',
      'https://docs.aws.amazon.com/redshift/latest/dg/welcome.html',
      'https://docs.aws.amazon.com/emr/latest/ManagementGuide/emr-what-is-emr.html',
      'https://aws.amazon.com/about-aws/whats-new/data-analytics/',
    ],
  },
  {
    _id: 'saa-c03',
    key: 'saa-c03',
    name: 'AWS Solutions Architect Associate',
    kind: 'certification',
    blueprint: [
      { domain: 'Design Secure Architectures', weight: 0.30 },
      { domain: 'Design Resilient Architectures', weight: 0.26 },
      { domain: 'Design High-Performing Architectures', weight: 0.24 },
      { domain: 'Design Cost-Optimized Architectures', weight: 0.20 },
    ],
    intensity: 2,
    custom_instructions:
      'Emphasize trade-off reasoning: when to use SQS vs SNS vs EventBridge, S3 vs EFS vs EBS, and multi-AZ vs multi-region patterns.',
    sources: [
      'https://d1.awsstatic.com/training-and-certification/docs-sa-assoc/AWS-Certified-Solutions-Architect-Associate_Exam-Guide.pdf',
      'https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html',
      'https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html',
      'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html',
      'https://docs.aws.amazon.com/lambda/latest/dg/welcome.html',
    ],
  },
  {
    _id: 'spark',
    key: 'spark',
    name: 'Apache Spark',
    kind: 'skill',
    blueprint: [],
    intensity: 2,
    custom_instructions:
      'Assume PySpark. Focus on the difference between transformations and actions, shuffle behavior, partitioning strategies, and Structured Streaming windowing semantics.',
    sources: [
      'https://spark.apache.org/docs/latest/rdd-programming-guide.html',
      'https://spark.apache.org/docs/latest/sql-performance-tuning.html',
      'https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html',
      'https://spark.apache.org/docs/latest/sql-programming-guide.html',
    ],
  },
  {
    _id: 'sql',
    key: 'sql',
    name: 'SQL & Query Engines',
    kind: 'skill',
    blueprint: [],
    intensity: 2,
    custom_instructions:
      'Emphasize join semantics, NULL behavior in aggregates, grain, execution order traps (WHERE vs HAVING, aliases in SELECT not visible in WHERE), and window function frame specs.',
    sources: [
      'https://www.postgresql.org/docs/current/queries.html',
      'https://www.postgresql.org/docs/current/functions-window.html',
      'https://www.postgresql.org/docs/current/queries-table-expressions.html',
      'https://www.postgresql.org/docs/current/queries-with.html',
    ],
  },
  {
    _id: 'airflow',
    key: 'airflow',
    name: 'Apache Airflow',
    kind: 'skill',
    blueprint: [],
    intensity: 2,
    custom_instructions:
      'Assume Astronomer runtime and Airflow 3.x semantics. Focus on task dependencies, XCom limitations, DAG serialization, and the differences between Airflow 2.x and 3.x.',
    sources: [
      'https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/index.html',
      'https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/index.html',
      'https://docs.astronomer.io/learn/airflow-dag-best-practices',
    ],
  },
  {
    _id: 'devops',
    key: 'devops',
    name: 'DevOps & CI/CD',
    kind: 'skill',
    blueprint: [],
    intensity: 1,
    custom_instructions:
      'Focus on pipeline design, caching strategies, artifact management, and container best practices for CI/CD.',
    sources: [
      'https://docs.github.com/en/actions/writing-workflows/quickstart',
      'https://docs.github.com/en/actions/writing-workflows/choosing-what-your-workflow-does/caching-dependencies-to-speed-up-workflows',
      'https://docs.docker.com/get-started/docker-concepts/building-images/writing-a-dockerfile/',
    ],
  },
] as const;

async function main(): Promise<void> {
  await connectDB();

  for (const track of tracks) {
    const existing = await Track.findById(track._id);
    if (existing) {
      console.log(`Track already exists: ${track._id}, skipping`);
    } else {
      await Track.create(track);
      console.log(`Created track: ${track._id}`);
    }

    await Topic.findOneAndUpdate(
      { track_key: track.key, path: track.key },
      {
        track_key: track.key,
        parent_id: null,
        name: track.name,
        path: track.key,
      },
      { upsert: true, new: true },
    );
  }

  await UserState.findByIdAndUpdate(
    'me',
    {
      $setOnInsert: {
        _id: 'me',
        streak: {
          current: 0,
          best: 0,
          freeze_tokens: 2,
          last_active_date: '',
        },
        xp: 0,
        level: 1,
        daily_goal: 10,
        notification_hour: 7,
        timezone: 'Asia/Kolkata',
        insight_cards_unlocked: [],
        settings: {},
      },
    },
    { upsert: true },
  );
  console.log('Seeded UserState');

  await disconnectDB();
}

main().catch((err: unknown) => {
  console.error('seed-tracks failed:', err);
  process.exit(1);
});
