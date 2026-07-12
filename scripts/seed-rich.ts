/**
 * seed-rich.ts — comprehensive dummy dataset for frontend development.
 *
 * Seeds: topics (tree), source chunks, misconceptions + concept docs,
 * ~44 questions across all 6 tracks, mastery in every lifecycle stage,
 * 3 weeks of attempt history, disputes, and a lived-in user state.
 *
 * Idempotent: wipes and re-inserts only the collections it owns
 * (never tracks — run seed-tracks first).
 *
 * Usage: npx tsx scripts/seed-rich.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
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

// ---------------------------------------------------------------------------
// Topics (children under each track root)
// ---------------------------------------------------------------------------

// Cert-track topics nest under a slugified blueprint-domain segment so that
// getCertReadiness (which matches `<track>/<domain-slug>/` prefixes) rolls up.
const CERT_PARENT: Record<string, { slug: string; name: string }> = {
  'dea-c01/s3': { slug: 'store-and-manage-data', name: 'Store and Manage Data' },
  'dea-c01/kinesis': { slug: 'data-ingestion-and-transformation', name: 'Data Ingestion and Transformation' },
  'dea-c01/glue': { slug: 'data-ingestion-and-transformation', name: 'Data Ingestion and Transformation' },
  'dea-c01/redshift': { slug: 'store-and-manage-data', name: 'Store and Manage Data' },
  'saa-c03/vpc': { slug: 'design-secure-architectures', name: 'Design Secure Architectures' },
  'saa-c03/iam': { slug: 'design-secure-architectures', name: 'Design Secure Architectures' },
  'saa-c03/messaging': { slug: 'design-high-performing-architectures', name: 'Design High-Performing Architectures' },
};

function realPath(p: string): string {
  const cp = CERT_PARENT[p];
  if (!cp) return p;
  const slash = p.indexOf('/');
  return `${p.slice(0, slash)}/${cp.slug}/${p.slice(slash + 1)}`;
}

const TOPICS: Array<{ track: string; path: string; name: string }> = [
  { track: 'dea-c01', path: 'dea-c01/s3', name: 'S3 & Object Storage' },
  { track: 'dea-c01', path: 'dea-c01/kinesis', name: 'Kinesis Data Streams' },
  { track: 'dea-c01', path: 'dea-c01/glue', name: 'AWS Glue' },
  { track: 'dea-c01', path: 'dea-c01/redshift', name: 'Amazon Redshift' },
  { track: 'saa-c03', path: 'saa-c03/vpc', name: 'VPC & Networking' },
  { track: 'saa-c03', path: 'saa-c03/iam', name: 'IAM & Policy Evaluation' },
  { track: 'saa-c03', path: 'saa-c03/messaging', name: 'SQS · SNS · EventBridge' },
  { track: 'spark', path: 'spark/shuffles', name: 'Shuffles & Partitioning' },
  { track: 'spark', path: 'spark/memory', name: 'Memory Management' },
  { track: 'spark', path: 'spark/streaming', name: 'Structured Streaming' },
  { track: 'sql', path: 'sql/window-functions', name: 'Window Functions' },
  { track: 'sql', path: 'sql/joins', name: 'Joins & Null Semantics' },
  { track: 'sql', path: 'sql/transactions', name: 'Transactions & Isolation' },
  { track: 'airflow', path: 'airflow/scheduling', name: 'Scheduling & Logical Dates' },
  { track: 'airflow', path: 'airflow/xcom', name: 'XCom & Task Communication' },
  { track: 'devops', path: 'devops/ci-cd', name: 'CI/CD & Image Builds' },
  { track: 'devops', path: 'devops/containers', name: 'Kubernetes & Containers' },
];

const SOURCES: Record<string, string> = {
  'dea-c01/s3': 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html',
  'dea-c01/kinesis': 'https://docs.aws.amazon.com/streams/latest/dev/service-sizes-and-limits.html',
  'dea-c01/glue': 'https://docs.aws.amazon.com/glue/latest/dg/what-is-glue.html',
  'dea-c01/redshift': 'https://docs.aws.amazon.com/redshift/latest/dg/t_Sorting_data.html',
  'saa-c03/vpc': 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html',
  'saa-c03/iam': 'https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html',
  'saa-c03/messaging': 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html',
  'spark/shuffles': 'https://spark.apache.org/docs/latest/rdd-programming-guide.html#shuffle-operations',
  'spark/memory': 'https://spark.apache.org/docs/latest/tuning.html#memory-management-overview',
  'spark/streaming': 'https://spark.apache.org/docs/latest/streaming/index.html',
  'sql/window-functions': 'https://www.postgresql.org/docs/current/tutorial-window.html',
  'sql/joins': 'https://www.postgresql.org/docs/current/queries-table-expressions.html',
  'sql/transactions': 'https://www.postgresql.org/docs/current/transaction-iso.html',
  'airflow/scheduling': 'https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/timetable.html',
  'airflow/xcom': 'https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/xcoms.html',
  'devops/ci-cd': 'https://docs.docker.com/build/cache/',
  'devops/containers': 'https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/',
};

// ---------------------------------------------------------------------------
// Misconceptions + concept docs
// ---------------------------------------------------------------------------

interface MSeed {
  id: string;
  topic: string;
  desc: string;
  title: string;
  body: string;
}

const MISCONCEPTIONS: MSeed[] = [
  {
    id: 's3-eventual-consistency-outdated',
    topic: 'dea-c01/s3',
    desc: 'Believes S3 is still eventually consistent for read-after-write',
    title: 'S3 is strongly consistent now',
    body: 'Before December 2020, S3 was eventually consistent for overwrite PUTs and DELETEs — reads could return stale data. **That model is gone.**\n\nS3 now delivers strong read-after-write consistency automatically for all objects: PUTs (new and overwrite), DELETEs, and LIST operations. After a successful write, the next read — from any client, any region endpoint — returns the latest version. LIST immediately reflects the change.\n\nThis applies to all buckets, at no extra cost, with no performance penalty and nothing to enable. If you find yourself designing retry loops or "wait for propagation" sleeps around S3 reads, you are solving a 2019 problem.\n\nWhat is *not* covered: bucket configuration changes (policies, CORS) can still take time to propagate, and cross-region replication is asynchronous by design.',
  },
  {
    id: 's3-standard-ia-retrieval-fee-confusion',
    topic: 'dea-c01/s3',
    desc: 'Thinks S3 Standard-IA has no per-GB retrieval charge',
    title: 'Standard-IA charges you to read',
    body: 'S3 Standard-IA has a lower storage price than Standard (~45% cheaper), but every GET pays a **per-GB retrieval fee** on top of normal request pricing.\n\nThe break-even is access frequency: data read roughly more than once a month usually costs *more* in Standard-IA than in Standard, because retrieval fees swamp the storage savings.\n\nRules of thumb:\n- Accessed weekly or more → Standard.\n- Accessed less than monthly, needed instantly → Standard-IA.\n- Unknown or shifting patterns → Intelligent-Tiering (it monitors and moves objects, no retrieval fee in the frequent/infrequent tiers).\n\nAlso remember the Standard-IA minimums: 30-day minimum storage duration and 128 KB minimum billable object size.',
  },
  {
    id: 'kinesis-shard-write-limit-confusion',
    topic: 'dea-c01/kinesis',
    desc: 'Believes a Kinesis shard accepts 2 MB/s of writes (that is the read limit)',
    title: 'Shard limits: 1 MB/s in, 2 MB/s out',
    body: 'A Kinesis Data Streams shard is asymmetric:\n\n- **Writes: 1 MB/s or 1,000 records/s** per shard, whichever hits first.\n- **Reads: 2 MB/s** per shard, shared across all consumers — unless a consumer uses enhanced fan-out, which gives it a dedicated 2 MB/s pipe.\n\nThe 2 MB/s number people remember is the *read* side. Producers exceeding the write limit get `ProvisionedThroughputExceededException` and must split shards (or switch the stream to on-demand mode) — retrying harder does not create capacity.\n\nSizing sanity check: 1.5 MB/s of incoming data needs **2 shards minimum**, regardless of how many consumers exist.',
  },
  {
    id: 'kinesis-resharding-instant',
    topic: 'dea-c01/kinesis',
    desc: 'Assumes resharding takes effect instantly with no parent-shard draining',
    title: 'Resharding: parents drain before children',
    body: 'Splitting or merging shards is not an instant swap. The parent shard closes to new writes, but the records already in it remain readable until the stream retention period expires.\n\nWell-behaved consumers (KCL does this for you) must **finish reading the parent shard before starting the children** — otherwise records are processed out of order for any given partition key.\n\nPractical consequences:\n- Ordering guarantees survive resharding *only* if parents are drained first.\n- Throughput increases apply to *new* data; the backlog in the parent still reads at the old parallelism.\n- Aggressive resharding during an incident does not clear a backlog faster.',
  },
  {
    id: 'glue-crawler-schema-overwrite',
    topic: 'dea-c01/glue',
    desc: 'Expects Glue crawlers to never modify an existing table schema',
    title: 'Crawlers update schemas by default',
    body: 'A Glue crawler\'s default behavior on schema change is **"Update the table definition in the Data Catalog"** — new columns are added and changed types are overwritten on the next run.\n\nIf downstream jobs or Athena views depend on a stable schema, that default can silently break them.\n\nYou control this per crawler via the schema change policy:\n- *Update the table definition* (default) — mutate in place.\n- *Add new columns only* — append, never alter existing columns.\n- *Ignore the change and don\'t update* — log it, touch nothing.\n\nDeletion behavior is configured separately (delete, mark deprecated, or ignore). For production catalogs feeding SLAs, "add new columns only" plus schema-change alerts is the usual safe posture.',
  },
  {
    id: 'glue-dpu-billing-confusion',
    topic: 'dea-c01/glue',
    desc: 'Thinks Glue bills per job run rather than per DPU-hour',
    title: 'Glue bills DPU-hours, per second',
    body: 'Glue ETL pricing is **capacity × time**: you pay per DPU-hour, billed per second, with a 1-minute minimum per job run (10-minute minimum on Glue version 0.9/1.0).\n\nA DPU is 4 vCPU + 16 GB. A job running 10 workers of type G.1X (1 DPU each) for 30 minutes costs 10 × 0.5 = 5 DPU-hours — identical to 5 workers for an hour.\n\nImplications:\n- An over-provisioned job that finishes no faster burns money linearly.\n- Auto-scaling (Glue 3.0+) exists precisely to shed idle workers mid-run.\n- "Runs" are free; *capacity-seconds* are what you pay for. Two small jobs can cost less than one padded one.',
  },
  {
    id: 'redshift-sort-key-index-conflation',
    topic: 'dea-c01/redshift',
    desc: 'Treats Redshift sort keys like B-tree indexes',
    title: 'Sort keys are not indexes',
    body: 'Redshift has no B-tree indexes to maintain or hit. A **sort key** physically orders the rows in each 1 MB block on disk, and Redshift keeps *zone maps* — the min/max value per block.\n\nA filter like `WHERE event_date >= \'2026-07-01\'` lets the engine skip every block whose max date is older — that is block pruning, not an index seek.\n\nConsequences that surprise index-thinkers:\n- Sort keys cost nothing at query time to "maintain"; they cost at load/VACUUM time (keeping data sorted).\n- Selectivity on a *non*-sort-key column scans everything; there is no secondary index to save you.\n- High-cardinality point lookups are not Redshift\'s game; range filters on sort keys are.\n- Compound sort key order matters: leading-column filters prune best.',
  },
  {
    id: 'redshift-vacuum-auto-everything',
    topic: 'dea-c01/redshift',
    desc: 'Believes automatic vacuum makes manual VACUUM always unnecessary',
    title: 'When manual VACUUM still matters',
    body: 'Redshift runs auto-vacuum in the background: it reclaims space from deletes (`VACUUM DELETE ONLY`) and does incremental sorting during low load. For steady, modest churn you rarely think about it.\n\nManual `VACUUM` still earns its keep when:\n- You just loaded a **large batch out of sort-key order** (auto sort is incremental and lags; a `VACUUM SORT ONLY` or full vacuum restores block pruning now).\n- You deleted a **large fraction of a table** and need the space and scan speed back before the next heavy query window.\n- You changed the table\'s sort key strategy and need a full re-sort (`VACUUM REINDEX` for interleaved keys).\n\nCheck `svv_table_info.unsorted` — a high unsorted percentage on a hot table is the signal auto-vacuum has not caught up.',
  },
  {
    id: 'nat-gateway-sg-attachment',
    topic: 'saa-c03/vpc',
    desc: 'Believes security groups can be attached to NAT gateways',
    title: 'NAT gateways take no security groups',
    body: 'You **cannot associate a security group with a NAT gateway**. Security groups attach to elastic network interfaces of resources like EC2 instances; the NAT gateway is a managed translation service that does not accept them.\n\nTo control traffic in a NAT setup you work at two other layers:\n- **Security groups on the instances** in private subnets (control what they may send out).\n- **Network ACLs on the subnets** — including the public subnet hosting the NAT gateway — for stateless allow/deny rules.\n\nExam-trap phrasing to watch: "attach a security group to the NAT gateway to restrict egress" is always wrong. The equivalent for *NAT instances* (the legacy EC2-based pattern) is valid — those are real instances and do take security groups, which is exactly why the distinction gets tested.',
  },
  {
    id: 'nacl-stateful-confusion',
    topic: 'saa-c03/vpc',
    desc: 'Assumes network ACLs are stateful like security groups',
    title: 'NACLs are stateless — open the return path',
    body: 'Security groups are **stateful**: allow the inbound request and the response flows out automatically. Network ACLs are **stateless**: inbound and outbound are evaluated independently, in rule-number order, on every packet.\n\nThe classic failure: you allow inbound TCP 443 on a subnet\'s NACL, but responses die because outbound has no rule for **ephemeral ports** (1024–65535, the client\'s source port range).\n\nWorking NACL checklist:\n- Inbound rule for the service port (e.g. 443).\n- Outbound rule for ephemeral ports back to the client range.\n- Remember the implicit `*` DENY at the end of every NACL.\n- Rules evaluate lowest number first; the first match wins.\n\nIf connectivity works with the default NACL but breaks with a custom one, missing ephemeral-port rules are the first suspect.',
  },
  {
    id: 'iam-explicit-deny-override',
    topic: 'saa-c03/iam',
    desc: 'Thinks an Allow in any policy can override an explicit Deny',
    title: 'Explicit deny always wins',
    body: 'IAM policy evaluation has a fixed precedence: **explicit Deny → explicit Allow → implicit deny (default)**.\n\nAn explicit `"Effect": "Deny"` in *any* applicable policy — identity policy, resource policy, SCP, permissions boundary, or session policy — terminates evaluation. No Allow anywhere can resurrect the request.\n\nThe full decision flow for a request within one account:\n1. Gather every policy that applies.\n2. Any explicit Deny? → **DENIED**, stop.\n3. Any explicit Allow (and not cut off by an SCP or boundary)? → allowed.\n4. Otherwise → implicitly denied.\n\nThis is why `Deny` with a `Condition` (e.g. deny unless `aws:SecureTransport`) is such a powerful guardrail — and why a stray broad Deny in an SCP can mysteriously break workloads that have perfectly good Allows.',
  },
  {
    id: 'sqs-fifo-throughput-unlimited',
    topic: 'saa-c03/messaging',
    desc: 'Believes FIFO queues match standard-queue throughput',
    title: 'FIFO ordering costs throughput',
    body: 'SQS standard queues offer nearly unlimited throughput. FIFO queues pay for their guarantees:\n\n- **300 messages/second** per queue without batching.\n- **3,000 messages/second** with max batching (10 per batch).\n- High-throughput FIFO mode raises the ceiling substantially, but partitions by `MessageGroupId` — ordering holds only *within* a group, and hot groups still bottleneck.\n\nDesign consequences:\n- Use FIFO only where ordering or exactly-once processing is a real requirement, not "nice to have."\n- Spread traffic across many message group IDs; a single group ID serializes everything.\n- If you need massive scale *and* loose ordering, standard queue + idempotent consumers is usually the better trade.',
  },
  {
    id: 'sns-message-persistence',
    topic: 'saa-c03/messaging',
    desc: 'Assumes SNS stores messages for later retrieval like SQS',
    title: 'SNS pushes; it does not store',
    body: 'SNS is a **push** service: a published message is delivered to the subscribers that exist at that moment, with retries per protocol, then it is gone. There is no "poll SNS later" — no retention window, no replay.\n\nSQS is the **pull** side: messages persist (up to 14 days) until a consumer deletes them.\n\nThe canonical pattern is therefore **SNS → SQS fan-out**: SNS gives one-to-many distribution; each SQS subscription gives its consumer durability, buffering, and independent pace. Add a dead-letter queue per subscription for delivery failures.\n\nIf a requirement says "consumers may be offline and must not miss messages," raw SNS alone is the wrong answer — every time.',
  },
  {
    id: 'spark-shuffle-narrow-wide-confusion',
    topic: 'spark/shuffles',
    desc: 'Misidentifies which transformations trigger a shuffle',
    title: 'Narrow vs wide: what actually shuffles',
    body: 'A **shuffle** happens when computing a partition requires data from *other* partitions — Spark must redistribute rows across the cluster, hitting disk and network, and a new stage begins.\n\n**Narrow (no shuffle):** `map`, `filter`, `flatMap`, `union`, `mapPartitions` — each output partition depends on one input partition.\n\n**Wide (shuffle):** `groupByKey`, `reduceByKey`, `join` (non-broadcast), `distinct`, `repartition`, `orderBy` — rows must regroup by key.\n\nNuances worth knowing:\n- `reduceByKey` still shuffles, but combines map-side first, so it moves far less data than `groupByKey`.\n- A join where one side is small enough to **broadcast** avoids shuffling the large side entirely.\n- Stage boundaries in the Spark UI are exactly the shuffle points — count them to audit a query plan.',
  },
  {
    id: 'spark-coalesce-shuffle-assumption',
    topic: 'spark/shuffles',
    desc: 'Believes coalesce() can increase partitions or always avoids data movement',
    title: 'coalesce() only shrinks (without shuffle)',
    body: '`coalesce(n)` avoids a shuffle by **merging existing partitions in place** — which means it can only *reduce* the partition count. Ask it for more partitions than exist and it silently keeps the current count.\n\n`repartition(n)` always performs a full shuffle and can scale the count in either direction, producing evenly sized partitions.\n\nTrade-offs:\n- Writing output: `coalesce(1)` funnels everything through few tasks — cheap plan, but those tasks can become giant and slow. Sometimes `repartition(1)` (shuffle first) is actually faster end-to-end.\n- Skew: coalesce merges neighbors without rebalancing, so it *preserves* skew; repartition fixes it at shuffle cost.\n- `coalesce(n, shuffle = true)` exists and is equivalent to repartition.',
  },
  {
    id: 'spark-oom-driver-executor-confusion',
    topic: 'spark/memory',
    desc: 'Blames executor memory for collect()-driven driver OOMs',
    title: 'collect() kills the driver, not executors',
    body: '`collect()` pulls **every row of the result to the driver JVM**. If the result is bigger than driver memory, the *driver* dies with OOM — no amount of `spark.executor.memory` helps, because executors were never the bottleneck.\n\nDiagnosis: OOM stack traces on the driver (or "spark driver exited") right after an action that materializes results — `collect`, `toPandas`, `take` with huge n, `show` on exploded data.\n\nFixes in preference order:\n1. Don\'t materialize: write with `df.write...` — data flows executor → storage, never through the driver.\n2. Aggregate/limit first so what returns is genuinely small.\n3. `toLocalIterator()` streams one partition at a time (still bounded by the largest partition).\n4. Only then consider raising `spark.driver.memory` / `spark.driver.maxResultSize` — a bigger bucket, same leak.',
  },
  {
    id: 'spark-streaming-exactly-once-free',
    topic: 'spark/streaming',
    desc: 'Assumes exactly-once semantics without checkpointing and idempotent sinks',
    title: 'Exactly-once is earned, not default',
    body: 'Structured Streaming\'s exactly-once guarantee is **conditional**. It holds only when all three legs stand:\n\n1. **Replayable source** — Kafka, files: the engine can re-read a range by offset.\n2. **Checkpointing enabled** — offsets and state are journaled to a checkpoint location; without it, a restart forgets progress and state.\n3. **Idempotent or transactional sink** — re-writing batch N after a failure must not duplicate output (file sink commits atomically; `foreachBatch` into an upsert; Kafka sink is at-least-once unless you dedupe downstream).\n\nBreak any leg and you degrade to at-least-once (duplicates) or worse. The most common production miss: a `foreachBatch` doing plain INSERTs — every recovery replays the last batch and doubles rows.',
  },
  {
    id: 'window-function-where-filter',
    topic: 'sql/window-functions',
    desc: 'Tries to filter on window function results in the WHERE clause',
    title: 'Why WHERE cannot see your window',
    body: 'Logical evaluation order in SQL: `FROM → WHERE → GROUP BY → HAVING → SELECT (window functions here) → ORDER BY`.\n\nWindow functions are computed in the **SELECT** phase — *after* WHERE has already filtered rows. So `WHERE ROW_NUMBER() OVER (...) = 1` is not just wrong, it is unparseable: the value does not exist yet when WHERE runs.\n\nThe standard patterns:\n```sql\nSELECT * FROM (\n  SELECT o.*, ROW_NUMBER() OVER (\n    PARTITION BY customer_id ORDER BY created_at DESC\n  ) AS rn\n  FROM orders o\n) t\nWHERE rn = 1;\n```\nor, on engines that support it (Snowflake, BigQuery, DuckDB, Databricks):\n```sql\nQUALIFY ROW_NUMBER() OVER (...) = 1\n```\n`QUALIFY` is to window functions what HAVING is to aggregates.',
  },
  {
    id: 'left-join-where-null-trap',
    topic: 'sql/joins',
    desc: 'Filters the right table in WHERE after a LEFT JOIN, silently making it an INNER JOIN',
    title: 'The LEFT JOIN that quietly became INNER',
    body: 'After a LEFT JOIN, unmatched left rows carry **NULL in every right-table column**. A WHERE condition on a right-table column (`WHERE r.status = \'active\'`) evaluates to NULL for those rows — and WHERE discards non-true rows. Your unmatched rows vanish; the query now behaves as an INNER JOIN.\n\nIntent decides the fix:\n- Keep all left rows, filter what you *join*: move the condition into ON.\n```sql\nLEFT JOIN payments p\n  ON p.order_id = o.id AND p.status = \'captured\'\n```\n- Actually want only matched rows: write INNER JOIN and say so.\n- Anti-join (left rows with **no** match) is the one legitimate right-column WHERE: `WHERE p.id IS NULL`.\n\nReview heuristic: every LEFT JOIN whose right alias appears in WHERE (other than IS NULL) deserves a second look.',
  },
  {
    id: 'read-committed-repeatable-confusion',
    topic: 'sql/transactions',
    desc: 'Expects READ COMMITTED to prevent non-repeatable reads',
    title: 'READ COMMITTED re-reads can differ',
    body: 'READ COMMITTED promises exactly one thing: you never see *uncommitted* data. Each statement sees a fresh snapshot — so two identical SELECTs inside one transaction can return **different rows** if another transaction commits in between. That is the definition of a non-repeatable read, and READ COMMITTED explicitly allows it (so are phantoms).\n\nWhat prevents what:\n- **READ COMMITTED** — blocks dirty reads only.\n- **REPEATABLE READ** — adds stable re-reads of seen rows (Postgres: full snapshot, phantoms gone too; MySQL/InnoDB: phantoms mostly gone via gap locks).\n- **SERIALIZABLE** — transactions behave as if run one at a time.\n\nPractical tell: "sum computed at the top of the transaction disagrees with detail rows read later" under READ COMMITTED is not a bug in the database — it is the isolation level working as documented.',
  },
  {
    id: 'airflow-execution-date-confusion',
    topic: 'airflow/scheduling',
    desc: 'Believes a DAG run\'s logical date is when it actually runs',
    title: 'The logical date is the interval, not the clock',
    body: 'An Airflow DAG run is stamped with a **logical date** (formerly `execution_date`) = the **start of the data interval it covers** — not the moment it executes.\n\nA `@daily` DAG covering 2026-07-03 has `logical_date = 2026-07-03 00:00`, `data_interval_start = 2026-07-03`, `data_interval_end = 2026-07-04` — and it actually **runs after the interval closes**, i.e. shortly after midnight on July 4.\n\nWhy: a daily job processes *yesterday\'s complete data*; the run is named for the data, not the trigger time.\n\nCorollaries:\n- "Why is my DAG one day behind?" — it is not; the label describes the interval.\n- Use `data_interval_start/end` in templates; avoid mental math on `logical_date`.\n- `catchup=True` creates a run per missed interval since `start_date` — a fresh DAG with an old start_date will backfill aggressively unless you disable catchup.',
  },
  {
    id: 'xcom-large-data-antipattern',
    topic: 'airflow/xcom',
    desc: 'Uses XCom to pass large datasets between tasks',
    title: 'XCom is a note, not a pipe',
    body: 'XCom values are serialized into the **Airflow metadata database**. It is designed for *small control metadata* — a row count, a file path, a model version — not payload data.\n\nHard limits depend on the backend (e.g. ~64 kB per value on MySQL BLOB defaults, ~1 GB theoretical on Postgres), but the practical ceiling is far lower: every large XCom bloats the metadata DB, slows the scheduler\'s queries, and gets re-deserialized by every downstream task.\n\nThe pattern for real data:\n1. Task A writes the dataset to object storage (S3/GCS) or a table.\n2. Task A pushes only the **reference** (URI, partition key) via XCom.\n3. Task B reads the data from storage using that reference.\n\nCustom XCom backends that transparently offload to S3 exist, but they are a convenience for the same pattern — the metadata DB is never the data plane.',
  },
  {
    id: 'docker-layer-cache-order',
    topic: 'devops/ci-cd',
    desc: 'Copies source code before installing dependencies, busting the Docker layer cache',
    title: 'Order your Dockerfile for the cache',
    body: 'Docker builds cache **per layer**, and a layer\'s cache is invalidated when its inputs change — including the checksums of files brought in by COPY. Crucially, once one layer misses, **every later layer rebuilds**.\n\nSo this ordering:\n```dockerfile\nCOPY . .\nRUN npm ci\n```\nreinstalls all dependencies on *every source edit*, because `COPY . .` changes on any file change.\n\nThe cache-friendly shape:\n```dockerfile\nCOPY package.json package-lock.json ./\nRUN npm ci          # cached until the lockfile changes\nCOPY . .            # source changes only bust from here\n```\nGeneral rule: **order layers from least to most frequently changing** — base image, system packages, dependency manifests + install, then application code last. The same principle applies to pip/poetry, Go modules, Maven, and multi-stage builds.',
  },
  {
    id: 'k8s-requests-limits-confusion',
    topic: 'devops/containers',
    desc: 'Conflates Kubernetes resource requests with limits',
    title: 'Requests schedule; limits enforce',
    body: 'Kubernetes resource **requests** and **limits** answer two different questions:\n\n- **Request** — "how much should the scheduler reserve?" Used *only* at scheduling time to pick a node with capacity, and to rank pods for eviction (QoS class). Not enforced at runtime.\n- **Limit** — "how much may it ever use?" Enforced at runtime by the kernel: exceed a **memory** limit → the container is **OOMKilled** (even if the node has free memory); hit a **CPU** limit → the container is **throttled**, never killed.\n\nCommon confusions this untangles:\n- A pod OOMKilled on a half-empty node hit *its own limit*, not node pressure.\n- CPU starvation with healthy-looking nodes is often aggressive CPU limits (check `container_cpu_cfs_throttled_seconds_total`).\n- Requests ≪ actual usage → overcommitted nodes and surprise evictions; requests ≫ usage → wasted cluster capacity.',
  },
];

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

interface QSeed {
  track: string;
  topic: string;
  domain?: string;
  d: 1 | 2 | 3 | 4 | 5;
  boss?: boolean;
  status?: 'verified' | 'staged' | 'disputed' | 'retired';
  stem: string;
  correct: { text: string; explanation: string };
  distractors: Array<{ text: string; m?: string; why?: string }>;
  evidence: string;
}

const QUESTIONS: QSeed[] = [
  // ── dea-c01 / s3 ─────────────────────────────────────────────────────────
  {
    track: 'dea-c01', topic: 'dea-c01/s3', domain: 'Store and Manage Data', d: 2,
    stem: 'A producer service PUTs a brand-new object to an S3 bucket and receives a 200 response. Milliseconds later, a different consumer service GETs the same key. What does the consumer receive?',
    correct: {
      text: 'The object just written — S3 provides strong read-after-write consistency for all objects.',
      explanation: 'Since December 2020, S3 delivers strong read-after-write consistency automatically for all PUT and DELETE operations, for all buckets, at no extra cost.',
    },
    distractors: [
      { text: 'Possibly a 404 until the object propagates to all availability zones.', m: 's3-eventual-consistency-outdated', why: 'You picked this because you remember the pre-2020 S3 model, where new-object reads could briefly miss. S3 dropped eventual consistency in December 2020.' },
      { text: 'The object, but only if the GET is routed to the same regional endpoint as the PUT.', m: 's3-eventual-consistency-outdated', why: 'You assumed consistency depends on endpoint affinity. S3\'s strong consistency is unconditional within a region — no routing caveats.' },
      { text: 'A 200 with an empty body until the first replication cycle completes.', m: 's3-eventual-consistency-outdated', why: 'You reasoned S3 acknowledges before data is readable. A successful PUT means the object is durably stored and immediately readable.' },
    ],
    evidence: 'Amazon S3 delivers strong read-after-write consistency automatically for all applications, for all existing and new objects, with no changes to performance or availability and at no additional cost.',
  },
  {
    track: 'dea-c01', topic: 'dea-c01/s3', domain: 'Store and Manage Data', d: 3,
    stem: 'A 40 GB reference dataset in S3 is read in full once per week by an analytics job and must be available within milliseconds. Which storage class minimizes total monthly cost?',
    correct: {
      text: 'S3 Standard',
      explanation: 'Standard-IA\'s per-GB retrieval fee applied weekly (~160 GB/month retrieved) outweighs its storage discount at this access frequency. Standard has no retrieval fee.',
    },
    distractors: [
      { text: 'S3 Standard-IA', m: 's3-standard-ia-retrieval-fee-confusion', why: 'You compared storage prices only. Standard-IA charges per GB retrieved — read the data ~4× a month and retrieval fees exceed the storage savings.' },
      { text: 'S3 Glacier Flexible Retrieval', why: 'Glacier Flexible Retrieval takes minutes to hours to restore — it cannot serve millisecond reads.' },
      { text: 'S3 One Zone-IA', m: 's3-standard-ia-retrieval-fee-confusion', why: 'One Zone-IA has the same retrieval-fee structure as Standard-IA (plus reduced resilience) — the weekly read pattern still makes fees dominate.' },
    ],
    evidence: 'S3 Standard-IA is for data that is accessed less frequently, but requires rapid access when needed. S3 Standard-IA offers a low per GB storage price and per GB retrieval charge.',
  },
  {
    track: 'dea-c01', topic: 'dea-c01/s3', domain: 'Store and Manage Data', d: 3,
    stem: 'Immediately after a successful DELETE of an S3 object, a LIST request is issued against the bucket. What does the LIST reflect?',
    correct: {
      text: 'The deleted object is absent — LIST operations are strongly consistent with writes and deletes.',
      explanation: 'S3\'s strong consistency covers LIST as well: after a successful delete, subsequent list operations immediately reflect the removal.',
    },
    distractors: [
      { text: 'The object may still appear for up to a few seconds until the index converges.', m: 's3-eventual-consistency-outdated', why: 'You applied the old eventual-consistency model to LIST. Since 2020, list operations reflect all changes immediately.' },
      { text: 'The object appears with a zero-byte size until the tombstone is compacted.', m: 's3-eventual-consistency-outdated', why: 'You imported LSM-tree tombstone mechanics from databases like Cassandra. S3 exposes no such intermediate state.' },
      { text: 'Whether it appears depends on whether the bucket has versioning enabled.', why: 'Versioning changes what DELETE means (adds a delete marker) but not the consistency of LIST — the marker is immediately visible either way.' },
    ],
    evidence: 'After a successful write of a new object or an overwrite of an existing object, any subsequent read request immediately receives the latest version of the object. S3 also provides strong consistency for list operations.',
  },
  {
    track: 'dea-c01', topic: 'dea-c01/s3', domain: 'Store and Manage Data', d: 2, status: 'staged',
    stem: 'Which S3 storage class automatically moves objects between access tiers based on observed access patterns, with no retrieval fees in its frequent and infrequent tiers?',
    correct: {
      text: 'S3 Intelligent-Tiering',
      explanation: 'Intelligent-Tiering monitors access and shifts objects between tiers automatically, charging a small monitoring fee instead of retrieval fees.',
    },
    distractors: [
      { text: 'S3 Standard-IA', m: 's3-standard-ia-retrieval-fee-confusion', why: 'Standard-IA is a fixed tier with retrieval fees — it never moves objects on its own.' },
      { text: 'S3 Glacier Instant Retrieval', why: 'Glacier Instant Retrieval is a fixed archive tier with retrieval fees; it does not adapt to access patterns.' },
      { text: 'S3 Standard with lifecycle rules', why: 'Lifecycle rules transition on age, not on observed access patterns — they cannot move an object back when it turns hot again.' },
    ],
    evidence: 'S3 Intelligent-Tiering is the ideal storage class for data with unknown, changing, or unpredictable access patterns. It automatically moves objects between access tiers with no retrieval fees.',
  },

  // ── dea-c01 / kinesis ────────────────────────────────────────────────────
  {
    track: 'dea-c01', topic: 'dea-c01/kinesis', domain: 'Data Ingestion and Transformation', d: 2,
    stem: 'What is the maximum write throughput of a single Kinesis Data Streams shard in provisioned mode?',
    correct: {
      text: '1 MB/s or 1,000 records per second, whichever limit is reached first.',
      explanation: 'Each shard ingests up to 1 MB/s or 1,000 records/s. The 2 MB/s figure is the read side.',
    },
    distractors: [
      { text: '2 MB/s or 2,000 records per second.', m: 'kinesis-shard-write-limit-confusion', why: 'You picked the read limit. A shard supports 2 MB/s of egress but only 1 MB/s of ingress — the asymmetry is the trap.' },
      { text: '1 MB/s with no record-count limit.', m: 'kinesis-shard-write-limit-confusion', why: 'You remembered the byte limit but not the parallel 1,000 records/s cap — many small records hit the count limit long before the byte limit.' },
      { text: '10 MB/s when enhanced fan-out is enabled on the stream.', m: 'kinesis-shard-write-limit-confusion', why: 'Enhanced fan-out affects consumers (dedicated read pipes), not producers. Write capacity per shard is fixed.' },
    ],
    evidence: 'A shard supports 1 MB/second and 1,000 records per second for writes, and 2 MB/second for reads.',
  },
  {
    track: 'dea-c01', topic: 'dea-c01/kinesis', domain: 'Data Ingestion and Transformation', d: 4, boss: true,
    stem: 'A producer writes 1.5 MB/s of telemetry into a provisioned Kinesis stream with one shard and receives ProvisionedThroughputExceededException on roughly a third of records. Retries with exponential backoff have not eliminated the errors. What resolves the problem?',
    correct: {
      text: 'Split the shard (or switch the stream to on-demand mode) so write capacity exceeds 1.5 MB/s.',
      explanation: 'Writes exceed the 1 MB/s per-shard ingress cap; capacity must grow. Two shards provide 2 MB/s of ingress; on-demand mode scales automatically.',
    },
    distractors: [
      { text: 'Enable enhanced fan-out to give the producer a dedicated 2 MB/s pipe.', m: 'kinesis-shard-write-limit-confusion', why: 'You reached for the 2 MB/s number, but enhanced fan-out provisions read throughput for consumers — it does nothing for producers.' },
      { text: 'Increase the retry backoff ceiling — burst credits will absorb the excess over time.', why: 'Backoff smooths bursts around a sustainable average. At a sustained 1.5 MB/s against a 1 MB/s cap there is no spare capacity for retries to find.' },
      { text: 'Batch records with PutRecords so the per-record count limit no longer applies.', m: 'kinesis-shard-write-limit-confusion', why: 'You assumed the record-count limit is the binding constraint. At 1.5 MB/s the byte limit is exceeded — batching does not raise it.' },
    ],
    evidence: 'When a write exceeds the capacity of a shard, the request is rejected with a ProvisionedThroughputExceededException. To increase stream capacity, split shards to increase the number of shards in the stream.',
  },
  {
    track: 'dea-c01', topic: 'dea-c01/kinesis', domain: 'Data Ingestion and Transformation', d: 3,
    stem: 'A stream\'s single shard is split into two child shards during a traffic spike. Per-key ordering must be preserved. What must consumers do?',
    correct: {
      text: 'Finish reading the parent shard to its end before consuming the child shards.',
      explanation: 'Records for a partition key exist in the parent until the split point and in a child afterward. Draining the parent first is what preserves per-key order — the KCL enforces this automatically.',
    },
    distractors: [
      { text: 'Nothing — the split atomically moves buffered records into the children in order.', m: 'kinesis-resharding-instant', why: 'You assumed resharding migrates data. Existing records stay in the closed parent until retention expires; only new writes go to the children.' },
      { text: 'Restart consumption from LATEST on both children to skip the transition window.', m: 'kinesis-resharding-instant', why: 'You treated the split as a clean cutover. Jumping to LATEST skips the parent\'s tail records and every pre-split record still unread — data loss, not ordering.' },
      { text: 'Read both children first, then the parent, since children hold the newest data.', m: 'kinesis-resharding-instant', why: 'You inverted the drain order. Reading newest-first delivers post-split records before their pre-split predecessors for the same key.' },
    ],
    evidence: 'After the reshard has occurred and the stream is again in an ACTIVE state, you could immediately begin to read data from the child shards. However, the parent shards that remain after the reshard could still contain data that you have not yet read.',
  },

  // ── dea-c01 / glue ───────────────────────────────────────────────────────
  {
    track: 'dea-c01', topic: 'dea-c01/glue', domain: 'Data Ingestion and Transformation', d: 2,
    stem: 'A nightly Glue crawler with default settings runs against an S3 prefix where a new column was added to the Parquet files. What happens to the existing Data Catalog table?',
    correct: {
      text: 'The table definition is updated in place — the new column is added to the schema.',
      explanation: 'The default schema change policy is "Update the table definition in the Data Catalog," which mutates the schema on change.',
    },
    distractors: [
      { text: 'Nothing — crawlers only create tables; schema changes are always ignored.', m: 'glue-crawler-schema-overwrite', why: 'You assumed catalog schemas are immutable once created. Ignoring changes is an available policy, but it is not the default.' },
      { text: 'A new versioned table is created alongside the old one.', m: 'glue-crawler-schema-overwrite', why: 'You expected copy-on-write semantics. The catalog keeps version history of a table, but the crawler updates the live definition, not a parallel table.' },
      { text: 'The crawler fails with a schema mismatch error requiring manual resolution.', m: 'glue-crawler-schema-overwrite', why: 'You assumed schema drift is an error condition. To a default crawler it is routine — it silently updates, which is exactly why downstream jobs break.' },
    ],
    evidence: 'When the crawler detects schema changes in the data store, the default behavior is to update the table definition in the Data Catalog.',
  },
  {
    track: 'dea-c01', topic: 'dea-c01/glue', domain: 'Data Operations and Support', d: 3,
    stem: 'A Glue 4.0 Spark job runs with 10 G.1X workers (1 DPU each) and completes in 30 minutes. What does the run cost, in billing terms?',
    correct: {
      text: '5 DPU-hours, billed per second.',
      explanation: '10 DPUs × 0.5 hours = 5 DPU-hours. Glue bills capacity × time per second with a 1-minute minimum — not per job run.',
    },
    distractors: [
      { text: 'One flat job-run charge regardless of duration.', m: 'glue-dpu-billing-confusion', why: 'You modeled Glue like a per-invocation service. Runs are free; capacity-seconds are what you pay for.' },
      { text: '10 DPU-hours — one full hour minimum per worker.', m: 'glue-dpu-billing-confusion', why: 'You assumed hourly rounding per worker. Billing is per second (1-minute minimum per run), so 30 minutes bills as 30 minutes.' },
      { text: '2.5 DPU-hours, since G.1X workers count as half a DPU.', why: 'G.1X maps to exactly 1 DPU (4 vCPU, 16 GB). G.025X, used for streaming, is the fractional one.' },
    ],
    evidence: 'With AWS Glue, you pay an hourly rate, billed by the second, for crawlers and ETL jobs, with a 1-minute minimum billing duration for jobs that use AWS Glue version 2.0 and later.',
  },

  // ── dea-c01 / redshift ───────────────────────────────────────────────────
  {
    track: 'dea-c01', topic: 'dea-c01/redshift', domain: 'Store and Manage Data', d: 3,
    stem: 'A Redshift table has a compound sort key on (event_date, customer_id). How does the query engine use it to accelerate `WHERE event_date >= \'2026-07-01\'`?',
    correct: {
      text: 'Zone maps store each block\'s min/max event_date, letting the engine skip blocks entirely outside the range.',
      explanation: 'Sort keys physically order rows so zone maps become selective — filtering works by block pruning, not index traversal.',
    },
    distractors: [
      { text: 'It performs a B-tree seek on the sort key to locate the first qualifying row.', m: 'redshift-sort-key-index-conflation', why: 'You mapped sort keys onto index mechanics. Redshift has no B-trees — it scans, but skips blocks using min/max zone maps.' },
      { text: 'It uses a hash index on event_date built automatically during COPY.', m: 'redshift-sort-key-index-conflation', why: 'You assumed an index structure gets built at load. Nothing is built — the data is simply stored sorted, which is the whole mechanism.' },
      { text: 'It broadcasts the filter to all slices, each doing a binary search within its blocks.', m: 'redshift-sort-key-index-conflation', why: 'You reached for search-tree intuition. Slices scan their block lists and prune with zone maps; there is no per-block binary search structure.' },
    ],
    evidence: 'Amazon Redshift stores columnar data in 1 MB disk blocks. The min and max values for each block are stored as part of the metadata. The query processor is able to use these min and max values to rapidly skip over large numbers of blocks during table scans.',
  },
  {
    track: 'dea-c01', topic: 'dea-c01/redshift', domain: 'Data Operations and Support', d: 4,
    stem: 'A 2 TB Redshift table receives a one-off bulk load of 400 GB arriving completely out of sort-key order. Queries filtering on the sort key have slowed noticeably, and svv_table_info shows unsorted = 19%. Automatic vacuum is enabled. What is the right operational move?',
    correct: {
      text: 'Run VACUUM SORT ONLY (or a full VACUUM) on the table now instead of waiting for auto-vacuum.',
      explanation: 'Auto-vacuum sorts incrementally during low load and lags badly after large unsorted loads. A manual sort restores zone-map pruning immediately.',
    },
    distractors: [
      { text: 'Do nothing — automatic vacuum makes manual VACUUM obsolete in all cases.', m: 'redshift-vacuum-auto-everything', why: 'You over-trusted auto-vacuum. It handles steady churn; a 20% unsorted region on a hot table is exactly the case it is slow to repair.' },
      { text: 'Run ANALYZE — stale statistics, not sort order, cause the slowdown.', why: 'ANALYZE refreshes planner statistics but does not re-sort blocks; zone-map pruning stays broken until the region is sorted.' },
      { text: 'Rebuild the table with DISTSTYLE ALL to eliminate the sorting requirement.', why: 'Distribution style controls data placement across nodes, not sort order within slices — and ALL on a 2 TB table would multiply storage.' },
    ],
    evidence: 'Amazon Redshift automatically sorts data in the background. If you load large amounts of data out of sort key order, you might want to run a VACUUM SORT ONLY to re-sort the data more quickly than the automatic vacuum.',
  },

  // ── saa-c03 / vpc ────────────────────────────────────────────────────────
  {
    track: 'saa-c03', topic: 'saa-c03/vpc', domain: 'Design Secure Architectures', d: 2,
    stem: 'A security review requires restricting which destinations private-subnet instances can reach through a NAT gateway. An engineer proposes attaching a security group to the NAT gateway. Why does this fail?',
    correct: {
      text: 'Security groups cannot be associated with NAT gateways; control egress with security groups on the instances or NACLs on the subnets.',
      explanation: 'NAT gateways are managed devices that accept no security groups. Egress control lives on the source instances\' security groups or subnet NACLs.',
    },
    distractors: [
      { text: 'It works, but the security group must be attached in the NAT gateway\'s subnet, not the private subnet.', m: 'nat-gateway-sg-attachment', why: 'You assumed the attachment is valid and only placement matters. No placement makes it valid — the resource type simply does not take security groups.' },
      { text: 'It fails only because NAT gateways require the default security group; custom groups are rejected.', m: 'nat-gateway-sg-attachment', why: 'You reasoned there is a special-case security group. There is none — NAT gateways have no security-group attachment point at all.' },
      { text: 'It fails because NAT gateways only support outbound rules, and the review requires inbound rules.', m: 'nat-gateway-sg-attachment', why: 'You granted NAT gateways partial security-group support. They have zero — direction is irrelevant.' },
    ],
    evidence: 'You cannot associate a security group with a NAT gateway. You can associate security groups with your instances to control inbound and outbound traffic.',
  },
  {
    track: 'saa-c03', topic: 'saa-c03/vpc', domain: 'Design Secure Architectures', d: 3,
    stem: 'A custom network ACL allows inbound TCP 443 from 0.0.0.0/0 on a public subnet. HTTPS clients connect but receive no responses. The instances\' security groups are correct. What is missing?',
    correct: {
      text: 'An outbound NACL rule allowing ephemeral ports (1024–65535) — NACLs are stateless, so return traffic needs its own rule.',
      explanation: 'Unlike security groups, NACLs evaluate every packet in each direction independently. Response packets to clients\' ephemeral source ports must be explicitly allowed outbound.',
    },
    distractors: [
      { text: 'Nothing at the NACL layer — allowing the inbound connection automatically permits its return traffic.', m: 'nacl-stateful-confusion', why: 'You applied security-group statefulness to NACLs. NACLs track no connections; the response direction needs an explicit rule.' },
      { text: 'An inbound rule for ephemeral ports, since responses re-enter the subnet on high ports.', m: 'nacl-stateful-confusion', why: 'You put the missing rule on the wrong side. Responses *leave* the subnet toward clients — the gap is outbound.' },
      { text: 'A higher rule number on the 443 allow, since NACLs evaluate highest number first.', why: 'NACLs evaluate rules in ascending order and the inbound 443 rule already matches — ordering is not the failure here.' },
    ],
    evidence: 'Network ACLs are stateless, which means that responses to allowed inbound traffic are subject to the rules for outbound traffic (and vice versa).',
  },

  // ── saa-c03 / iam ────────────────────────────────────────────────────────
  {
    track: 'saa-c03', topic: 'saa-c03/iam', domain: 'Design Secure Architectures', d: 3,
    stem: 'A developer\'s identity policy allows s3:GetObject on arn:aws:s3:::finance-data/*. An SCP on the account contains an explicit Deny for s3:GetObject on that same ARN. The developer also has a resource-based bucket policy Allow. What is the result of a GetObject request?',
    correct: {
      text: 'Denied — an explicit Deny in any applicable policy overrides every Allow.',
      explanation: 'Policy evaluation short-circuits on explicit Deny: identity policies, resource policies, and SCPs are all checked, and a Deny anywhere is final.',
    },
    distractors: [
      { text: 'Allowed — identity policies take precedence over SCPs for IAM users in the account.', m: 'iam-explicit-deny-override', why: 'You ranked policy types by precedence. There is no such ranking — Deny wins regardless of which policy type carries it.' },
      { text: 'Allowed — the combination of identity Allow and resource-policy Allow satisfies both required layers.', m: 'iam-explicit-deny-override', why: 'You treated evaluation as collecting enough Allows. Allows only matter after the Deny check passes; here it does not.' },
      { text: 'Denied, but only because SCPs always override resource-based policies specifically.', m: 'iam-explicit-deny-override', why: 'You reached the right verdict with wrong mechanics — it is the explicit-Deny rule, not an SCP-vs-resource-policy hierarchy. That distinction will bite on other questions.' },
    ],
    evidence: 'An explicit deny in any policy overrides any allows. If a policy that applies to the request includes a Deny statement that matches, the request is denied.',
  },
  {
    track: 'saa-c03', topic: 'saa-c03/iam', domain: 'Design Secure Architectures', d: 5, boss: true,
    stem: 'Account A\'s IAM role has an identity policy allowing sts:AssumeRole into account B. Account B\'s role trust policy allows account A as principal, and the role\'s permissions policy allows dynamodb:Query. A permissions boundary on account B\'s role omits DynamoDB entirely. What happens when the assumed role issues a Query?',
    correct: {
      text: 'The Query is implicitly denied — the effective permissions are the intersection of the permissions policy and the boundary.',
      explanation: 'A permissions boundary caps a principal\'s maximum permissions. Actions absent from the boundary are implicitly denied even when the permissions policy allows them.',
    },
    distractors: [
      { text: 'The Query succeeds — permissions boundaries apply only to IAM users, not roles.', why: 'Boundaries apply to both users and roles; roles assumed cross-account are still bound by them.' },
      { text: 'The Query succeeds — the trust policy\'s Allow satisfies the boundary requirement.', m: 'iam-explicit-deny-override', why: 'You blended the trust policy (who may assume) into authorization (what the session may do). They are evaluated separately; the boundary caps the latter.' },
      { text: 'The AssumeRole call itself fails, because the boundary blocks cross-account trust.', why: 'The boundary never blocks assumption — trust and identity policies govern that. It constrains what the resulting session can do afterward.' },
    ],
    evidence: 'A permissions boundary is an advanced feature for using a managed policy to set the maximum permissions that an identity-based policy can grant to an IAM entity. An entity\'s permissions boundary allows it to perform only the actions that are allowed by both its identity-based policies and its permissions boundaries.',
  },

  // ── saa-c03 / messaging ──────────────────────────────────────────────────
  {
    track: 'saa-c03', topic: 'saa-c03/messaging', domain: 'Design High-Performing Architectures', d: 2,
    stem: 'An order-processing pipeline requires strict per-customer ordering and must handle 250 messages/second overall. Which SQS configuration meets this with the least complexity?',
    correct: {
      text: 'A FIFO queue with the customer ID as MessageGroupId.',
      explanation: 'FIFO guarantees order within a message group; 250 msg/s sits under the 300 msg/s unbatched FIFO limit, so no high-throughput mode is needed.',
    },
    distractors: [
      { text: 'A standard queue — its higher throughput is required, and ordering is best-effort anyway.', m: 'sqs-fifo-throughput-unlimited', why: 'You assumed FIFO could not carry the load. FIFO handles 300 msg/s without batching — the requirement fits comfortably.' },
      { text: 'A FIFO queue with a single shared MessageGroupId for global ordering.', why: 'One group ID serializes the entire queue and creates a single hot partition; the requirement is per-customer order, not global.' },
      { text: 'Two standard queues with a sequencing field consumers use to reorder.', why: 'Client-side reordering re-implements FIFO poorly — buffering, gaps, and duplicate handling — when the managed guarantee exists.' },
    ],
    evidence: 'FIFO queues support up to 300 messages per second, per API action without batching. When you batch 10 messages per operation, FIFO queues can support up to 3,000 messages per second.',
  },
  {
    track: 'saa-c03', topic: 'saa-c03/messaging', domain: 'Design Resilient Architectures', d: 2,
    stem: 'Multiple downstream services must each receive every event a publisher emits. Some services undergo maintenance windows of several hours and must not miss events. What is the correct architecture?',
    correct: {
      text: 'SNS topic fanned out to one SQS queue per service; each service polls its own queue.',
      explanation: 'SNS provides one-to-many push; the per-service SQS queues provide durable buffering (up to 14 days), so offline consumers catch up on return.',
    },
    distractors: [
      { text: 'SNS topic with each service subscribed via HTTPS — SNS retains undelivered messages until subscribers return.', m: 'sns-message-persistence', why: 'You credited SNS with a retention store. SNS retries delivery briefly, then drops the message — hours-long outages mean permanent loss.' },
      { text: 'A single shared SQS queue all services poll from.', why: 'A queue delivers each message to one consumer — competing consumers split the stream instead of each receiving every event.' },
      { text: 'SNS with a Lambda subscriber per service that replays from the topic\'s archive after maintenance.', m: 'sns-message-persistence', why: 'You assumed a replayable topic archive exists. Standard SNS topics have no replay; that capability belongs to Kinesis or EventBridge archives.' },
    ],
    evidence: 'Amazon SNS is a publish-subscribe service. Messages that are not delivered are not stored for later retrieval. To persist messages for consumers that are offline, subscribe Amazon SQS queues to the SNS topic.',
  },

  // ── spark / shuffles ─────────────────────────────────────────────────────
  {
    track: 'spark', topic: 'spark/shuffles', d: 2,
    stem: 'Which of these Spark transformations does NOT trigger a shuffle?',
    correct: {
      text: 'filter(col("status") == "active")',
      explanation: 'filter is a narrow transformation — each output partition depends only on its own input partition, so no data moves between executors.',
    },
    distractors: [
      { text: 'reduceByKey(_ + _)', m: 'spark-shuffle-narrow-wide-confusion', why: 'You may have reasoned that map-side combining avoids the shuffle. It shrinks the shuffle, but rows must still regroup by key across partitions.' },
      { text: 'distinct()', m: 'spark-shuffle-narrow-wide-confusion', why: 'distinct feels local, but deduplication requires comparing rows across all partitions — it is implemented as a shuffle by key.' },
      { text: 'repartition(100)', m: 'spark-shuffle-narrow-wide-confusion', why: 'repartition is a full shuffle by definition — that is precisely how it produces evenly sized partitions.' },
    ],
    evidence: 'In Spark, data is generally not distributed across partitions to be in the necessary place for a specific operation. Certain operations within Spark trigger an event known as the shuffle. The shuffle is Spark\'s mechanism for re-distributing data so that it\'s grouped differently across partitions.',
  },
  {
    track: 'spark', topic: 'spark/shuffles', d: 3,
    stem: 'For a word-count over a heavily skewed 2 TB dataset, why does reduceByKey dramatically outperform groupByKey followed by a map-side sum?',
    correct: {
      text: 'reduceByKey combines values within each partition before shuffling, so far less data crosses the network.',
      explanation: 'The map-side combine collapses each partition\'s counts per key to a single value pre-shuffle; groupByKey ships every raw occurrence.',
    },
    distractors: [
      { text: 'reduceByKey avoids the shuffle entirely by computing locally.', m: 'spark-shuffle-narrow-wide-confusion', why: 'You promoted "less shuffle data" to "no shuffle." Final per-key aggregation still requires regrouping — the shuffle happens, it is just smaller.' },
      { text: 'groupByKey sorts all values per key, which dominates the runtime.', why: 'groupByKey groups without sorting values. Its cost is shipping and materializing every raw value, not ordering them.' },
      { text: 'reduceByKey runs on the driver, avoiding executor coordination overhead.', m: 'spark-oom-driver-executor-confusion', why: 'You routed aggregation through the driver. Both operations execute distributed on executors — the driver only coordinates.' },
    ],
    evidence: 'The shuffle is an expensive operation since it involves disk I/O, data serialization, and network I/O. Operations which can cause a shuffle include repartition operations, ByKey operations (except for counting), and join operations.',
  },
  {
    track: 'spark', topic: 'spark/shuffles', d: 3,
    stem: 'A DataFrame has 8 partitions after heavy filtering. A developer calls `df.coalesce(64)` to increase write parallelism before saving. What actually happens?',
    correct: {
      text: 'The DataFrame keeps 8 partitions — coalesce without shuffle can only reduce partition count.',
      explanation: 'coalesce merges existing partitions locally; it cannot split them. Requests above the current count are silently ignored — repartition(64) is what forces the shuffle that creates more partitions.',
    },
    distractors: [
      { text: 'Spark splits the 8 partitions into 64 without a shuffle by re-chunking files.', m: 'spark-coalesce-shuffle-assumption', why: 'You assumed coalesce is a free bidirectional resize. Splitting requires redistributing rows — that is a shuffle, which coalesce exists to avoid.' },
      { text: 'It works, but the 64 partitions inherit the skew of the original 8.', m: 'spark-coalesce-shuffle-assumption', why: 'You granted the increase and worried about balance. The increase never happens — the request is a no-op.' },
      { text: 'An AnalysisException is thrown since the target exceeds the current count.', why: 'Spark does not error here — the silent no-op is exactly what makes this bug hard to notice in production.' },
    ],
    evidence: 'coalesce(numPartitions): Decrease the number of partitions in the RDD to numPartitions. Useful for running operations more efficiently after filtering down a large dataset. However, if you\'re doing a drastic coalesce, this may result in your computation taking place on fewer nodes.',
  },
  {
    track: 'spark', topic: 'spark/shuffles', d: 5, boss: true,
    stem: 'Consider this PySpark job:\n\n```python\nresult = (events\n    .filter(col("type") == "purchase")\n    .join(broadcast(currencies), "currency_code")\n    .groupBy("country")\n    .agg(sum("amount_usd").alias("revenue"))\n    .orderBy(desc("revenue")))\n```\n\nHow many shuffle boundaries does this plan contain?',
    correct: {
      text: 'Two — one for the groupBy aggregation, one for the global orderBy.',
      explanation: 'filter is narrow; the broadcast join avoids shuffling events; groupBy shuffles by country; orderBy performs a range-partitioned shuffle for a global sort.',
    },
    distractors: [
      { text: 'Three — the join, the groupBy, and the orderBy each shuffle.', m: 'spark-shuffle-narrow-wide-confusion', why: 'You counted the join as a shuffle. A broadcast join ships the small table to every executor — the large side never moves.' },
      { text: 'One — Spark fuses groupBy and orderBy into a single sort-based aggregation exchange.', m: 'spark-shuffle-narrow-wide-confusion', why: 'You gave the optimizer a fusion it cannot do: grouping partitions by country hash, global sort partitions by revenue range — incompatible distributions, two exchanges.' },
      { text: 'Zero — all operations here are narrow when the join side is broadcast.', m: 'spark-shuffle-narrow-wide-confusion', why: 'You extended the broadcast\'s shuffle-avoidance to the whole plan. Aggregation by key and global ordering both inherently regroup data.' },
    ],
    evidence: 'Operations which can cause a shuffle include repartition operations, ByKey operations (except for counting), and join operations. When one of the datasets is small enough to fit in memory, a broadcast join avoids shuffling the larger dataset.',
  },

  // ── spark / memory ───────────────────────────────────────────────────────
  {
    track: 'spark', topic: 'spark/memory', d: 3,
    stem: 'This PySpark snippet crashes with an OutOfMemoryError:\n\n```python\ndf = spark.read.parquet("s3://lake/events/")  # ~80 GB\nrows = df.collect()\nfor r in rows:\n    process(r)\n```\n\nExecutors have 32 GB each and show healthy memory. Where is the failure and what fixes it?',
    correct: {
      text: 'The driver — collect() pulls all 80 GB into the driver JVM. Process the data distributed (foreach/foreachPartition or write) instead.',
      explanation: 'collect materializes the full dataset on the driver regardless of executor sizing. The fix is keeping the work distributed, not resizing anything.',
    },
    distractors: [
      { text: 'The executors — increase spark.executor.memory to hold the collected result.', m: 'spark-oom-driver-executor-confusion', why: 'You sized the wrong JVM. Executors stream their partitions out and stay healthy; the driver is the single process receiving all of it.' },
      { text: 'The shuffle — collect() triggers a full shuffle to one partition; raise shuffle memory.', m: 'spark-oom-driver-executor-confusion', why: 'You modeled collect as a repartition-to-1. It is a result transfer to the driver process, outside shuffle machinery entirely.' },
      { text: 'S3 read buffering — 80 GB of input must fit in cluster memory before actions can run.', why: 'Spark streams input partitions lazily; nothing requires the dataset to be cluster-resident. The failure is at result collection.' },
    ],
    evidence: 'Sometimes, you will get an OutOfMemoryError not because your RDDs don\'t fit in memory, but because the working set of one of your tasks was too large, or because the collect() operation attempted to bring too much data back to the driver program.',
  },
  {
    track: 'spark', topic: 'spark/memory', d: 4,
    stem: 'A join stage fails intermittently with executor OOMs. The Spark UI shows 200 shuffle partitions with several partitions over 4 GB while most are under 50 MB. What is the most effective fix?',
    correct: {
      text: 'Address the key skew — enable AQE skew-join handling (or salt the hot keys) so oversized partitions are split.',
      explanation: 'The partition-size distribution shows skew, not global under-provisioning. AQE\'s skewedJoin splits pathological partitions automatically on Spark 3.x.',
    },
    distractors: [
      { text: 'Raise spark.driver.memory — join hash tables are built on the driver.', m: 'spark-oom-driver-executor-confusion', why: 'You placed join execution on the driver. Hash tables build inside executor tasks; the driver only plans the join.' },
      { text: 'Double spark.executor.memory across the board.', why: 'Sizing every executor for the worst partition wastes the cluster and still races the next skew increase — the skew itself is the defect.' },
      { text: 'Reduce spark.sql.shuffle.partitions so each partition gets more memory headroom.', m: 'spark-shuffle-narrow-wide-confusion', why: 'You inverted the lever — fewer partitions make each one *larger*, deepening the hot-partition OOM.' },
    ],
    evidence: 'Data skew can severely downgrade the performance of join queries. Adaptive Query Execution converts a sort-merge join to a broadcast hash join and optimizes skew joins by splitting skewed partitions into smaller subpartitions.',
  },

  // ── spark / streaming ────────────────────────────────────────────────────
  {
    track: 'spark', topic: 'spark/streaming', d: 3,
    stem: 'A Structured Streaming job reads Kafka and writes to Postgres via foreachBatch with plain INSERT statements. Checkpointing is enabled. After an executor failure and restart, row counts in Postgres exceed Kafka message counts. Why?',
    correct: {
      text: 'The sink is not idempotent — the recovered batch was replayed and plain INSERTs duplicated it. Use upserts or transactional writes keyed by batchId.',
      explanation: 'Checkpointing gives replay, which yields exactly-once only when the sink tolerates re-writing a batch. Non-idempotent INSERTs turn replay into duplication.',
    },
    distractors: [
      { text: 'Checkpointing plus Kafka\'s replayability already guarantees exactly-once — the duplicates must come from the producer.', m: 'spark-streaming-exactly-once-free', why: 'You counted two of the three legs. Source replay + checkpoint + idempotent sink are all required; the sink leg is missing here.' },
      { text: 'Kafka delivered duplicates because auto-commit was left enabled on the consumer.', why: 'Structured Streaming manages Kafka offsets in its own checkpoint, ignoring consumer-group auto-commit — that setting is inert here.' },
      { text: 'foreachBatch runs on the driver, which double-executes batches after failures.', m: 'spark-oom-driver-executor-confusion', why: 'The foreachBatch function body does run on the driver, but replay-after-failure is checkpoint semantics, not a driver bug — and the fix is sink idempotency.' },
    ],
    evidence: 'Structured Streaming can ensure end-to-end exactly-once semantics under any failure condition provided the sources are replayable and the sinks are idempotent, using checkpointing and write-ahead logs to record the offset range of data being processed.',
  },
  {
    track: 'spark', topic: 'spark/streaming', d: 3,
    stem: 'A streaming aggregation job is redeployed with a new checkpoint directory after code changes. What happens on the first run?',
    correct: {
      text: 'It starts fresh: source offsets restart per startingOffsets and all windowed state is lost.',
      explanation: 'The checkpoint directory holds both progress (offsets) and state store data. A new directory means a new query identity — nothing carries over.',
    },
    distractors: [
      { text: 'Offsets reset but windowed aggregation state migrates automatically from the old checkpoint.', m: 'spark-streaming-exactly-once-free', why: 'You assumed state lives somewhere durable beyond the checkpoint. The checkpoint *is* the state\'s home; abandoning it abandons the state.' },
      { text: 'Spark detects the code change and transparently upgrades the old checkpoint in place.', m: 'spark-streaming-exactly-once-free', why: 'You credited checkpoints with schema evolution they do not have — incompatible changes are exactly why teams are forced to new directories.' },
      { text: 'The job fails immediately because a checkpoint directory must already exist.', why: 'An empty checkpoint location is the normal cold-start path; Spark creates it and begins from startingOffsets.' },
    ],
    evidence: 'In case of a failure or intentional shutdown, you can recover the previous progress and state of a previous query, and continue where it left off. This is done using checkpointing and write-ahead logs. The query will save all the progress information and the running aggregates to the checkpoint location.',
  },

  // ── sql / window-functions ───────────────────────────────────────────────
  {
    track: 'sql', topic: 'sql/window-functions', d: 2,
    stem: 'This query fails on every major database:\n\n```sql\nSELECT customer_id, amount,\n       ROW_NUMBER() OVER (\n         PARTITION BY customer_id\n         ORDER BY created_at DESC) AS rn\nFROM orders\nWHERE rn = 1;\n```\n\nWhy?',
    correct: {
      text: 'WHERE is evaluated before the SELECT phase computes window functions, so rn does not exist yet — wrap it in a subquery or use QUALIFY.',
      explanation: 'Logical evaluation order runs FROM → WHERE → GROUP BY → SELECT (windows) → ORDER BY. Window outputs are only filterable in an outer query or QUALIFY.',
    },
    distractors: [
      { text: 'The alias rn just needs to be repeated as the full window expression inside WHERE.', m: 'window-function-where-filter', why: 'You treated it as an aliasing problem. Inlining the OVER clause into WHERE is equally illegal — the phase ordering, not the alias, is the obstacle.' },
      { text: 'ROW_NUMBER requires a frame clause (ROWS BETWEEN ...) before it can be filtered.', why: 'Ranking functions take no frame clause at all — frames apply to aggregate and value windows.' },
      { text: 'PARTITION BY conflicts with WHERE in the same query block; one of them must go.', m: 'window-function-where-filter', why: 'You invented a conflict rule. WHERE happily coexists with window functions — it just runs earlier and cannot see their results.' },
    ],
    evidence: 'Window functions are permitted only in the SELECT list and the ORDER BY clause of the query. They are forbidden elsewhere, such as in GROUP BY, HAVING and WHERE clauses. This is because they logically execute after the processing of those clauses.',
  },
  {
    track: 'sql', topic: 'sql/window-functions', d: 3,
    stem: 'You need the top 2 orders by amount per customer from a 500M-row table on a warehouse that supports QUALIFY. Which query expresses this most directly?',
    correct: {
      text: 'SELECT * FROM orders QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) <= 2',
      explanation: 'QUALIFY filters on window results in the same query block — it is to window functions what HAVING is to aggregates.',
    },
    distractors: [
      { text: 'SELECT * FROM orders WHERE ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY amount DESC) <= 2', m: 'window-function-where-filter', why: 'You filtered a window function in WHERE — it is computed after WHERE runs, so this fails to parse on every engine.' },
      { text: 'SELECT customer_id, MAX(amount) AS a1, MAX(amount) FILTER (WHERE TRUE) AS a2 FROM orders GROUP BY customer_id', why: 'Two MAX expressions over the same group return the same row\'s value twice — GROUP BY collapses rows and cannot return the two source rows.' },
      { text: 'SELECT * FROM orders GROUP BY customer_id HAVING ROW_NUMBER() OVER (ORDER BY amount DESC) <= 2', m: 'window-function-where-filter', why: 'You moved the filter to HAVING, but HAVING also precedes window computation — and grouping by customer collapses the rows you wanted to keep.' },
    ],
    evidence: 'QUALIFY does with window functions what HAVING does with aggregate functions and GROUP BY clauses. In the execution order of a query, QUALIFY is evaluated after window functions are computed.',
  },
  {
    track: 'sql', topic: 'sql/window-functions', d: 4, boss: true,
    stem: 'Two running-total queries differ only in the frame clause:\n\n```sql\nSUM(amount) OVER (ORDER BY order_date\n  ROWS  BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)\n-- vs\nSUM(amount) OVER (ORDER BY order_date\n  RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)\n```\n\nWhen order_date contains duplicates, how do the results differ?',
    correct: {
      text: 'ROWS gives each duplicate its own incremental total; RANGE assigns all rows sharing an order_date the same total, including all their amounts.',
      explanation: 'RANGE frames extend to all peers of the current row under the ordering; ROWS counts physical rows. With ties, RANGE includes every peer\'s amount at once.',
    },
    distractors: [
      { text: 'They are always identical — the frame keyword only matters with explicit offsets like 3 PRECEDING.', m: 'window-function-where-filter', why: 'You assumed defaults make the keywords interchangeable. Peers under ORDER BY ties are exactly where ROWS and RANGE diverge, offsets or not.' },
      { text: 'RANGE fails because it requires a numeric ORDER BY column for range arithmetic.', why: 'RANGE with UNBOUNDED/CURRENT ROW bounds needs no arithmetic — only offset-based RANGE frames demand numeric or interval types.' },
      { text: 'ROWS produces nondeterministic totals for duplicates, so RANGE is required for correctness.', why: 'Half-true and inverted: ROWS order among peers is indeed nondeterministic, but which semantics is "correct" depends on intent — RANGE is not universally required.' },
    ],
    evidence: 'In RANGE mode, a frame that ends with CURRENT ROW also includes all peers of the current row (rows that the window\'s ORDER BY clause considers equivalent to the current row), whereas in ROWS mode the current row is simply the last row of the frame.',
  },

  // ── sql / joins ──────────────────────────────────────────────────────────
  {
    track: 'sql', topic: 'sql/joins', d: 2,
    stem: 'This query is intended to list ALL customers with their captured payments, if any:\n\n```sql\nSELECT c.name, p.amount\nFROM customers c\nLEFT JOIN payments p ON p.customer_id = c.id\nWHERE p.status = \'captured\';\n```\n\nCustomers with no payments are missing from the output. Why?',
    correct: {
      text: 'WHERE p.status = \'captured\' evaluates to NULL for unmatched customers and drops them — move the condition into the ON clause.',
      explanation: 'Unmatched left rows carry NULLs in right columns; a WHERE predicate on those columns filters them out, silently converting the LEFT JOIN to an INNER JOIN.',
    },
    distractors: [
      { text: 'The join direction is backwards — it should be RIGHT JOIN to preserve customers.', m: 'left-join-where-null-trap', why: 'You reached for the join keyword, but LEFT JOIN already preserves customers. It is the WHERE clause afterward that discards the unmatched rows.' },
      { text: 'LEFT JOIN only preserves left rows when the ON clause references both tables\' keys.', m: 'left-join-where-null-trap', why: 'You invented an ON-clause precondition. The ON clause is fine — preservation is undone later, in WHERE.' },
      { text: 'NULL-safe comparison (IS NOT DISTINCT FROM) is needed in the ON clause for unmatched rows.', m: 'left-join-where-null-trap', why: 'You aimed the NULL-handling at the join keys, but the NULLs causing loss are in the WHERE filter on the right table\'s column.' },
    ],
    evidence: 'The LEFT OUTER JOIN returns all rows in the qualified Cartesian product plus one copy of each row in the left-hand table for which there was no right-hand row that passed the join condition, extended with null values in the right-hand columns. Restrictions placed in the WHERE clause are applied after the join.',
  },
  {
    track: 'sql', topic: 'sql/joins', d: 3,
    stem: 'Which query correctly returns customers who have NEVER had a payment?',
    correct: {
      text: 'SELECT c.* FROM customers c LEFT JOIN payments p ON p.customer_id = c.id WHERE p.id IS NULL',
      explanation: 'The anti-join pattern: unmatched customers have NULL right-table columns, and filtering on IS NULL selects exactly those.',
    },
    distractors: [
      { text: 'SELECT c.* FROM customers c LEFT JOIN payments p ON p.customer_id = c.id WHERE p.id <> c.id', m: 'left-join-where-null-trap', why: 'NULL <> anything is NULL, not true — unmatched rows fail this predicate too, so the result is empty of exactly the customers you want.' },
      { text: 'SELECT c.* FROM customers c INNER JOIN payments p ON p.customer_id = c.id WHERE p.amount = 0', why: 'INNER JOIN can only return customers who *have* payment rows; "never paid" customers produce no join match at all.' },
      { text: 'SELECT c.* FROM customers c LEFT JOIN payments p ON p.customer_id = c.id AND p.id IS NULL', m: 'left-join-where-null-trap', why: 'You moved the IS NULL test into ON, where it filters *payment rows before matching* (none have NULL ids) — every customer joins to nothing and all of them return.' },
    ],
    evidence: 'Restrictions placed in the WHERE clause are applied after the join, while conditions placed in the ON clause are applied before the join. The anti-join pattern filters for null values of the right-hand table in the WHERE clause.',
  },

  // ── sql / transactions ───────────────────────────────────────────────────
  {
    track: 'sql', topic: 'sql/transactions', d: 3,
    stem: 'Under READ COMMITTED, a transaction runs `SELECT SUM(balance) FROM accounts` twice. Between the two statements, another session commits a transfer between two accounts plus a $500 deposit. What can the second SELECT return?',
    correct: {
      text: 'A different total than the first — each statement sees a fresh snapshot including the committed deposit.',
      explanation: 'READ COMMITTED prevents only dirty reads. Every statement snapshots anew, so committed changes between statements are visible — the non-repeatable read anomaly.',
    },
    distractors: [
      { text: 'The identical total — a transaction\'s reads are stable until it commits.', m: 'read-committed-repeatable-confusion', why: 'You described REPEATABLE READ. READ COMMITTED gives per-statement snapshots, not per-transaction ones.' },
      { text: 'The identical total, though newly inserted accounts (phantoms) could appear.', m: 'read-committed-repeatable-confusion', why: 'You allowed phantoms but froze existing rows — READ COMMITTED protects neither; updated balances are visible too.' },
      { text: 'An error — the concurrent commit invalidates the running transaction\'s snapshot.', why: 'Serialization failures of that kind belong to SERIALIZABLE (and REPEATABLE READ writes). Plain reads under READ COMMITTED never abort for this.' },
    ],
    evidence: 'Read Committed is the default isolation level in PostgreSQL. A SELECT query sees only data committed before the query began. Note that two successive SELECT commands can see different data, even though they are within a single transaction, if other transactions commit changes after the first SELECT starts and before the second SELECT starts.',
  },
  {
    track: 'sql', topic: 'sql/transactions', d: 4, status: 'disputed',
    stem: 'In PostgreSQL, which anomaly can still occur under REPEATABLE READ?',
    correct: {
      text: 'Serialization anomalies — e.g., write skew between two concurrent transactions.',
      explanation: 'PostgreSQL\'s REPEATABLE READ takes a transaction-wide snapshot (blocking phantoms too), but only SERIALIZABLE detects write-skew patterns.',
    },
    distractors: [
      { text: 'Phantom reads — new rows matching earlier predicates can appear on re-query.', m: 'read-committed-repeatable-confusion', why: 'True for the SQL-standard minimum, but PostgreSQL implements REPEATABLE READ with a full snapshot — phantoms cannot occur.' },
      { text: 'Non-repeatable reads of rows updated by concurrent committed transactions.', m: 'read-committed-repeatable-confusion', why: 'That is the anomaly REPEATABLE READ is named for eliminating — you assigned READ COMMITTED behavior a level up.' },
      { text: 'Dirty reads, during brief windows when the snapshot advances.', why: 'No PostgreSQL isolation level permits dirty reads, and snapshots never advance mid-transaction at this level.' },
    ],
    evidence: 'The Repeatable Read isolation level in PostgreSQL only sees data committed before the transaction began. Applications using this level must be prepared to retry transactions due to serialization failures. Note that only updating transactions might need to be retried; the Serializable level provides the strictest transaction isolation.',
  },

  // ── airflow / scheduling ─────────────────────────────────────────────────
  {
    track: 'airflow', topic: 'airflow/scheduling', d: 2,
    stem: 'A @daily Airflow DAG shows its latest run stamped with logical date 2026-07-03. When did that run actually execute?',
    correct: {
      text: 'Shortly after 2026-07-04 00:00 — a run executes after its data interval closes.',
      explanation: 'The logical date labels the start of the interval the run covers (July 3). The interval ends at midnight July 4, and only then does the run fire.',
    },
    distractors: [
      { text: 'At 2026-07-03 00:00 — the logical date is the trigger timestamp.', m: 'airflow-execution-date-confusion', why: 'You read the logical date as a clock time. It names the data interval being processed, which completes a full day later.' },
      { text: 'Continuously during July 3, streaming the day\'s data as it arrives.', m: 'airflow-execution-date-confusion', why: 'You modeled Airflow as a streaming system. Batch runs fire once per interval, after it closes.' },
      { text: 'At the scheduler\'s next heartbeat after 2026-07-03 12:00, the interval midpoint.', m: 'airflow-execution-date-confusion', why: 'You split the difference — there is no midpoint semantics; the trigger is the interval\'s end, exactly.' },
    ],
    evidence: 'Airflow was developed as a solution for ETL needs. In this world, an interval of data is processed after the interval has completed. A DAG run is usually scheduled after its associated data interval has ended, to ensure the run is able to collect all the data within the time period.',
  },
  {
    track: 'airflow', topic: 'airflow/scheduling', d: 3,
    stem: 'A new DAG with start_date=datetime(2026, 1, 1), schedule="@daily", and catchup=True is deployed on 2026-07-04. What does the scheduler do?',
    correct: {
      text: 'Creates ~184 runs, one per missed daily interval from January 1 to yesterday, and works through them.',
      explanation: 'catchup=True backfills every uncovered interval between start_date and now — a well-known deployment surprise for DAGs with historical start dates.',
    },
    distractors: [
      { text: 'Schedules only the next run (July 4) — past intervals are skipped by default.', m: 'airflow-execution-date-confusion', why: 'You described catchup=False behavior. With catchup on, the scheduler owes a run for every complete interval since start_date.' },
      { text: 'Runs one combined backfill covering January–July as a single data interval.', m: 'airflow-execution-date-confusion', why: 'You merged the intervals. Each daily interval gets its own run with its own logical date — 184 of them, not one wide one.' },
      { text: 'Raises a configuration error because start_date is more than 30 days in the past.', why: 'No such guard exists — Airflow happily accepts old start dates, which is precisely why accidental mass backfills happen.' },
    ],
    evidence: 'An Airflow DAG defined with a start_date and a schedule defines a series of intervals which the scheduler turns into individual DAG runs. If catchup is enabled, the scheduler kicks off a DAG Run for any data interval that has not been run since the last data interval.',
  },
  {
    track: 'airflow', topic: 'airflow/scheduling', d: 3,
    stem: 'Inside a daily task, which template variable pair correctly bounds the data to process for the current run?',
    correct: {
      text: 'data_interval_start and data_interval_end',
      explanation: 'These explicitly delimit the run\'s covered interval and are the recommended replacements for arithmetic on the legacy execution_date.',
    },
    distractors: [
      { text: 'execution_date and execution_date + timedelta(days=1), computed in the task.', m: 'airflow-execution-date-confusion', why: 'The math happens to work for simple daily schedules, but it hard-codes interval logic that breaks on custom timetables — the explicit variables exist to end this pattern.' },
      { text: 'ds and ts — the run\'s calendar date and its actual start timestamp.', m: 'airflow-execution-date-confusion', why: 'You mixed the interval label (ds) with wall-clock start (ts). The processing window is neither — it is the data interval pair.' },
      { text: 'start_date and end_date from the DAG definition.', why: 'Those are DAG lifetime bounds (when scheduling begins/ceases), not any single run\'s data window.' },
    ],
    evidence: 'A DAG run\'s logical date is the start of its data interval. The data_interval_start and data_interval_end template variables describe the exact delimits of the data interval associated with the DAG run.',
  },

  // ── airflow / xcom ───────────────────────────────────────────────────────
  {
    track: 'airflow', topic: 'airflow/xcom', d: 2,
    stem: 'Task A produces a 2 GB DataFrame that Task B must consume. What is the correct Airflow pattern?',
    correct: {
      text: 'Task A writes the DataFrame to object storage and pushes only the file URI via XCom; Task B reads from that URI.',
      explanation: 'XCom serializes into the metadata database and is meant for small references, not payloads. Storage carries the data; XCom carries the pointer.',
    },
    distractors: [
      { text: 'Return the DataFrame from Task A — TaskFlow XCom handles arbitrary sizes transparently.', m: 'xcom-large-data-antipattern', why: 'You trusted the ergonomic API with the data plane. The return value lands in the metadata DB, which chokes on gigabytes.' },
      { text: 'Push the DataFrame via XCom but enable pickling to compress it under the size limits.', m: 'xcom-large-data-antipattern', why: 'You reached for serialization tuning, but pickling neither compresses meaningfully nor changes the destination — still the metadata DB.' },
      { text: 'Merge A and B into one task, since Airflow cannot pass data between tasks at all.', why: 'Over-correction: reference-passing via XCom is the designed mechanism — losing task-level retries and observability is unnecessary.' },
    ],
    evidence: 'XComs are designed for small amounts of data; do not use them to pass around large values, like dataframes. If you want to pass data of larger size, it is recommended to use an external storage system and pass the reference to it via XCom.',
  },
  {
    track: 'airflow', topic: 'airflow/xcom', d: 3,
    stem: 'A team\'s Airflow metadata database has grown by 300 GB in a month and scheduler queries have slowed dramatically. The xcom table dominates the size. What is the root cause pattern?',
    correct: {
      text: 'Tasks are returning large payloads (serialized datasets) that TaskFlow auto-pushes into XCom on every run.',
      explanation: 'Every TaskFlow return value becomes an XCom row in the metadata DB. Large returns × frequent runs compound into exactly this bloat-and-slowdown signature.',
    },
    distractors: [
      { text: 'XCom rows are immutable by design, so normal small values accumulate forever.', m: 'xcom-large-data-antipattern', why: 'Accumulation happens, but small control values reach 300 GB in a month only in fantasy — the row *size*, not count, is the smoking gun.' },
      { text: 'The scheduler checkpoints DAG state into the xcom table on every heartbeat.', why: 'Scheduler state lives in dag_run, task_instance, and job tables — the xcom table only holds task-pushed values.' },
      { text: 'Task logs default into the metadata database until remote logging is configured.', why: 'Logs go to the filesystem or remote storage, never the metadata DB — log volume cannot inflate the xcom table.' },
    ],
    evidence: 'XComs are stored in the Airflow metadata database. Storing large objects in XCom can degrade the performance of the metadata database and the scheduler. A custom XCom backend can be used to store XCom data in external storage such as S3 or GCS.',
  },

  // ── devops / ci-cd ───────────────────────────────────────────────────────
  {
    track: 'devops', topic: 'devops/ci-cd', d: 2,
    stem: 'Every CI build of this Dockerfile reinstalls all npm dependencies, even for README-only commits:\n\n```dockerfile\nFROM node:20-slim\nWORKDIR /app\nCOPY . .\nRUN npm ci\nCMD ["node", "server.js"]\n```\n\nWhat fixes the caching?',
    correct: {
      text: 'COPY package.json and package-lock.json first, RUN npm ci, then COPY the rest of the source.',
      explanation: 'Any file change invalidates the `COPY . .` layer and everything after it. Copying only the manifests first lets the npm ci layer stay cached until the lockfile itself changes.',
    },
    distractors: [
      { text: 'Add a .dockerignore for README.md — docs changes will then reuse the cache.', m: 'docker-layer-cache-order', why: 'You patched one file instead of the ordering. The next source-code edit (the common case) still busts the install layer.' },
      { text: 'Switch RUN npm ci to RUN npm install, which reuses node_modules from the previous image.', m: 'docker-layer-cache-order', why: 'You assumed layers share state across builds. Each RUN starts from its parent layer; a busted COPY above it means an empty node_modules either way.' },
      { text: 'Use docker build --no-cache in CI so layer staleness cannot occur.', why: 'That guarantees the slow path on every build — it disables the mechanism you are trying to exploit.' },
    ],
    evidence: 'Each instruction in a Dockerfile roughly translates to an image layer. When a layer changes, all downstream layers need to be rebuilt as well. Order your layers from less frequently changed to more frequently changed to make better use of the build cache.',
  },
  {
    track: 'devops', topic: 'devops/ci-cd', d: 3,
    stem: 'In a multi-stage Dockerfile, the dependency-install layer shows a cache miss on every CI run even though the lockfile is unchanged. Builds run on ephemeral CI runners. What is the standard fix?',
    correct: {
      text: 'Use a remote cache backend (e.g. --cache-from / registry cache or BuildKit cache exports) so layers persist across runners.',
      explanation: 'Layer cache is local to the Docker daemon; fresh runners start empty. Registry-backed cache import/export restores hits on ephemeral infrastructure.',
    },
    distractors: [
      { text: 'Reorder the Dockerfile — cache misses always indicate layer-ordering mistakes.', m: 'docker-layer-cache-order', why: 'Ordering is the usual suspect, but an unchanged lockfile missing on *every* run points at absent cache storage, not invalidation.' },
      { text: 'Pin the base image by digest; floating tags invalidate all downstream layers each run.', why: 'A moving base tag can bust caches, but it would also change the base layer pull — and it would not explain misses when the tag has not moved. The ephemeral daemon is the systemic cause.' },
      { text: 'Run npm ci in the final stage instead, where the cache is more stable.', m: 'docker-layer-cache-order', why: 'Stage placement does not create persistence — every stage\'s layers live in the same empty local cache on a fresh runner.' },
    ],
    evidence: 'The default cache storage backend is internal to the BuildKit daemon. For CI/CD pipelines where the build environment is ephemeral, an external cache backend such as the registry cache lets you reuse the build cache across builds.',
  },

  // ── devops / containers ──────────────────────────────────────────────────
  {
    track: 'devops', topic: 'devops/containers', d: 3,
    stem: 'A pod is repeatedly OOMKilled although its node reports 40% free memory. Its container spec:\n\n```yaml\nresources:\n  requests:\n    memory: "256Mi"\n  limits:\n    memory: "512Mi"\n```\n\nWhat is happening?',
    correct: {
      text: 'The container exceeded its own 512Mi limit — memory limits are enforced per container by the kernel regardless of node headroom.',
      explanation: 'OOMKilled with free node memory is the signature of a container-level limit breach; the node\'s capacity never enters that decision.',
    },
    distractors: [
      { text: 'The node is overcommitted on requests, so the kubelet evicts this pod first despite free memory.', m: 'k8s-requests-limits-confusion', why: 'You reached for eviction mechanics, but evictions are a different code path (and show as Evicted, not OOMKilled) — this is the cgroup limit firing.' },
      { text: 'The 256Mi request acts as the enforcement ceiling once the node is under any pressure.', m: 'k8s-requests-limits-confusion', why: 'You gave requests a runtime role. Requests are scheduling-time reservations only; the limit is the sole runtime ceiling.' },
      { text: 'The kernel OOM killer targets random containers when zone reclaim falls behind.', why: 'The kill here is deterministic — the container\'s own cgroup hit 512Mi. Node-level OOM chooses victims by oom_score, not randomly, and the node is not under pressure.' },
    ],
    evidence: 'If a container exceeds its memory limit, it might be terminated. If the container continues to consume memory beyond its limit, the container is terminated with an OOMKilled status even if the node has available memory.',
  },
  {
    track: 'devops', topic: 'devops/containers', d: 2,
    stem: 'In Kubernetes, what does the scheduler use a container\'s CPU request for?',
    correct: {
      text: 'Finding a node with that much unreserved CPU — the request reserves capacity at scheduling time but is not a runtime cap.',
      explanation: 'Requests drive bin-packing decisions (and weight CPU shares under contention); only limits cap actual usage.',
    },
    distractors: [
      { text: 'Enforcing a hard ceiling — the container is throttled once it exceeds its request.', m: 'k8s-requests-limits-confusion', why: 'You assigned the limit\'s job to the request. A container may burst far above its request whenever the node has idle CPU.' },
      { text: 'Nothing at runtime or scheduling — requests are documentation for autoscalers only.', m: 'k8s-requests-limits-confusion', why: 'You swung to the opposite pole. Requests are the scheduler\'s core currency: pods stay Pending when no node can fit their requests.' },
      { text: 'Billing attribution in cloud-managed clusters.', why: 'Cloud billing follows node provisioning, not pod requests — requests influence cost only indirectly through cluster sizing.' },
    ],
    evidence: 'When you specify the resource request for containers in a Pod, the kube-scheduler uses this information to decide which node to place the Pod on. The scheduler ensures that the sum of the resource requests of the scheduled containers is less than the capacity of the node.',
  },
  {
    track: 'devops', topic: 'devops/containers', d: 4, boss: true,
    stem: 'A latency-critical service shows p99 spikes every few seconds. Nodes are at 30% CPU. Metrics show high container_cpu_cfs_throttled_seconds_total for the service\'s pods, which run with cpu request 500m and limit 1. What is the cause and remedy?',
    correct: {
      text: 'CFS quota throttling from the 1-CPU limit during short bursts — raise or remove the CPU limit (keep the request for scheduling).',
      explanation: 'CPU limits are enforced per 100ms CFS period; bursty threads exhaust the quota and stall until the next period, producing periodic p99 spikes even on idle nodes.',
    },
    distractors: [
      { text: 'Node CPU pressure — the pods need higher requests so the scheduler spreads them onto more nodes.', m: 'k8s-requests-limits-confusion', why: 'You read throttling as node contention. The throttle counter is quota enforcement against the pod\'s own limit — 30% idle nodes corroborate that.' },
      { text: 'The kubelet throttles any container exceeding its request as soon as limits are also set.', m: 'k8s-requests-limits-confusion', why: 'You made the request an enforcement trigger. Exceeding the request is free; only the limit\'s quota causes CFS throttling.' },
      { text: 'Memory pressure causing cgroup freezes that surface as CPU throttle time.', why: 'Memory pressure OOM-kills or evicts; it does not increment the CPU CFS throttling counter — that metric has exactly one source.' },
    ],
    evidence: 'The CPU limit defines a hard ceiling on how much CPU time the container can use. During each scheduling interval, the Linux kernel checks to see if this limit is exceeded; if so, the kernel waits before allowing that cgroup to resume execution, which can cause increased tail latencies.',
  },

  // Retired question (disputed twice, retired by pipeline) — realism for Disputes screen.
  {
    track: 'spark', topic: 'spark/memory', d: 3, status: 'retired',
    stem: 'What is the default value of spark.executor.memory in a vanilla Spark deployment?',
    correct: {
      text: '1g',
      explanation: 'The documented default for spark.executor.memory is 1g.',
    },
    distractors: [
      { text: '512m', m: 'spark-oom-driver-executor-confusion', why: 'You may be recalling spark.driver.memory defaults from very old versions.' },
      { text: '2g', why: 'Common in managed platform defaults (EMR, Databricks) but not vanilla Spark.' },
      { text: '4g', why: 'A common tuning starting point, not the shipped default.' },
    ],
    evidence: 'spark.executor.memory: Amount of memory to use per executor process (default 1g).',
  },
];

// ---------------------------------------------------------------------------
// Mastery lifecycle configuration
// ---------------------------------------------------------------------------

// stability = 9 * s / (1 - s)  ⇒  strength = stability / (stability + 9)
function stabilityFor(strength: number): number {
  return (9 * strength) / (1 - strength);
}

const MASTERY_PLAN: Record<
  string,
  { cdc: number; strength: number; dueInDays: number; lastReviewDaysAgo: number }
> = {
  // Squashed — trophies
  's3-eventual-consistency-outdated': { cdc: 3, strength: 0.88, dueInDays: 42, lastReviewDaysAgo: 3 },
  'left-join-where-null-trap': { cdc: 3, strength: 0.84, dueInDays: 35, lastReviewDaysAgo: 5 },
  'sns-message-persistence': { cdc: 3, strength: 0.81, dueInDays: 28, lastReviewDaysAgo: 8 },
  // In progress — 2/3
  'kinesis-shard-write-limit-confusion': { cdc: 2, strength: 0.66, dueInDays: 4, lastReviewDaysAgo: 1 },
  'window-function-where-filter': { cdc: 2, strength: 0.62, dueInDays: 3, lastReviewDaysAgo: 2 },
  'docker-layer-cache-order': { cdc: 2, strength: 0.58, dueInDays: 2, lastReviewDaysAgo: 2 },
  // In progress — 1/3
  'glue-crawler-schema-overwrite': { cdc: 1, strength: 0.48, dueInDays: 1, lastReviewDaysAgo: 3 },
  'nacl-stateful-confusion': { cdc: 1, strength: 0.45, dueInDays: 2, lastReviewDaysAgo: 4 },
  'spark-coalesce-shuffle-assumption': { cdc: 1, strength: 0.41, dueInDays: 1, lastReviewDaysAgo: 5 },
  'airflow-execution-date-confusion': { cdc: 1, strength: 0.44, dueInDays: 0, lastReviewDaysAgo: 6 },
  // Weak and due — the bounty board's top targets
  'iam-explicit-deny-override': { cdc: 0, strength: 0.22, dueInDays: -3, lastReviewDaysAgo: 9 },
  'redshift-sort-key-index-conflation': { cdc: 0, strength: 0.28, dueInDays: -2, lastReviewDaysAgo: 7 },
  'spark-shuffle-narrow-wide-confusion': { cdc: 0, strength: 0.19, dueInDays: -5, lastReviewDaysAgo: 12 },
  'xcom-large-data-antipattern': { cdc: 0, strength: 0.31, dueInDays: -1, lastReviewDaysAgo: 6 },
  'sqs-fifo-throughput-unlimited': { cdc: 0, strength: 0.26, dueInDays: -2, lastReviewDaysAgo: 8 },
  'read-committed-repeatable-confusion': { cdc: 0, strength: 0.24, dueInDays: -4, lastReviewDaysAgo: 11 },
  'spark-oom-driver-executor-confusion': { cdc: 0, strength: 0.33, dueInDays: -1, lastReviewDaysAgo: 5 },
  // Freshly opened
  'nat-gateway-sg-attachment': { cdc: 0, strength: 0.12, dueInDays: 0, lastReviewDaysAgo: 2 },
  's3-standard-ia-retrieval-fee-confusion': { cdc: 0, strength: 0.15, dueInDays: 0, lastReviewDaysAgo: 1 },
  'kinesis-resharding-instant': { cdc: 0, strength: 0.1, dueInDays: 0, lastReviewDaysAgo: 1 },
  'glue-dpu-billing-confusion': { cdc: 0, strength: 0.14, dueInDays: 0, lastReviewDaysAgo: 2 },
  'redshift-vacuum-auto-everything': { cdc: 0, strength: 0.11, dueInDays: 0, lastReviewDaysAgo: 3 },
  'spark-streaming-exactly-once-free': { cdc: 0, strength: 0.13, dueInDays: 0, lastReviewDaysAgo: 2 },
  'k8s-requests-limits-confusion': { cdc: 0, strength: 0.17, dueInDays: 0, lastReviewDaysAgo: 4 },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

async function main(): Promise<void> {
  await connectDB();
  console.log('Connected. Wiping owned collections…');

  await Promise.all([
    Topic.deleteMany({ parent_id: { $ne: null } }),
    SourceChunk.deleteMany({}),
    ConceptDoc.deleteMany({}),
    Misconception.deleteMany({}),
    Question.deleteMany({}),
    Mastery.deleteMany({}),
    Attempt.deleteMany({}),
    Dispute.deleteMany({}),
  ]);

  // --- Topics ---------------------------------------------------------------
  const roots = await Topic.find({ parent_id: null }).lean();
  const rootByTrack = new Map(roots.map((r) => [r.track_key, r._id]));

  // Domain-level nodes for cert tracks (dedup by path).
  const domainIdByPath = new Map<string, mongoose.Types.ObjectId>();
  for (const [shortPath, cp] of Object.entries(CERT_PARENT)) {
    const track = shortPath.slice(0, shortPath.indexOf('/'));
    const domainPath = `${track}/${cp.slug}`;
    if (domainIdByPath.has(domainPath)) continue;
    const doc = await Topic.create({
      track_key: track,
      parent_id: rootByTrack.get(track) ?? null,
      name: cp.name,
      path: domainPath,
    });
    domainIdByPath.set(domainPath, doc._id as mongoose.Types.ObjectId);
  }

  let childCount = 0;
  for (const t of TOPICS) {
    const full = realPath(t.path);
    const parentPath = full.slice(0, full.lastIndexOf('/'));
    await Topic.create({
      track_key: t.track,
      parent_id: domainIdByPath.get(parentPath) ?? rootByTrack.get(t.track) ?? null,
      name: t.name,
      path: full,
    });
    childCount++;
  }
  console.log(`Topics: ${childCount} children + ${domainIdByPath.size} domains under ${roots.length} roots`);

  // --- Source chunks (one per topic; text embeds all evidence quotes) --------
  const chunkByTopic = new Map<string, { id: mongoose.Types.ObjectId; url: string }>();
  for (const t of TOPICS) {
    const evidences = QUESTIONS.filter((q) => q.topic === t.path).map((q) => q.evidence);
    const url = SOURCES[t.path]!;
    const chunk = await SourceChunk.create({
      url,
      track_key: t.track,
      topic_path: realPath(t.path),
      title: t.name,
      text: `${t.name} — key excerpts from the official documentation.\n\n${evidences.join('\n\n')}`,
      chunk_index: 0,
      hash: `seed-${t.path.replace(/\//g, '-')}`,
      fetched_at: daysFromNow(-14),
      status: 'active',
    });
    chunkByTopic.set(t.path, { id: chunk._id as mongoose.Types.ObjectId, url });
  }
  console.log(`Source chunks: ${chunkByTopic.size}`);

  // --- Concept docs + misconceptions -----------------------------------------
  const docIdBySlug = new Map<string, mongoose.Types.ObjectId>();
  for (const m of MISCONCEPTIONS) {
    const chunk = chunkByTopic.get(m.topic)!;
    const doc = await ConceptDoc.create({
      title: m.title,
      body_md: `${m.body}\n\n[Source →](${chunk.url})`,
      source_url: chunk.url,
      chunk_id: chunk.id,
      topic_path: realPath(m.topic),
    });
    docIdBySlug.set(m.id, doc._id as mongoose.Types.ObjectId);
    await Misconception.create({
      _id: m.id,
      description: m.desc,
      topic_path: realPath(m.topic),
      concept_doc_id: doc._id,
      created_at: daysFromNow(-(10 + (m.id.length % 15))),
    });
  }
  console.log(`Misconceptions + concept docs: ${MISCONCEPTIONS.length}`);

  // --- Questions --------------------------------------------------------------
  const questionIds: Array<{ id: mongoose.Types.ObjectId; q: QSeed }> = [];
  let disputedQuestionId: mongoose.Types.ObjectId | null = null;
  let retiredQuestionId: mongoose.Types.ObjectId | null = null;

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i]!;
    const chunk = chunkByTopic.get(q.topic)!;
    const correctIndex = i % 4;
    const options: Array<Record<string, unknown>> = [];
    let di = 0;
    for (let pos = 0; pos < 4; pos++) {
      if (pos === correctIndex) {
        options.push({ text: q.correct.text, correct: true, explanation: q.correct.explanation });
      } else {
        const dist = q.distractors[di++]!;
        options.push({
          text: dist.text,
          ...(dist.m ? { misconception_id: dist.m, thought_process: dist.why } : {}),
        });
      }
    }
    const status = q.status ?? 'verified';
    const created = daysFromNow(-(21 - (i % 20)));
    const doc = await Question.create({
      stem: q.stem,
      options,
      evidence_quote: q.evidence,
      chunk_id: chunk.id,
      source_url: chunk.url,
      track_key: q.track,
      topic_path: realPath(q.topic),
      blueprint_domain: q.domain,
      difficulty: q.d,
      is_boss: q.boss ?? false,
      status,
      gate_results: {
        evidence: true,
        solver: true,
        form: status !== 'retired',
        solver_confidence: 0.86 + (i % 12) * 0.01,
      },
      created_at: created,
      verified_at: status === 'staged' ? undefined : created,
    });
    if (status === 'disputed') disputedQuestionId = doc._id as mongoose.Types.ObjectId;
    if (status === 'retired') retiredQuestionId = doc._id as mongoose.Types.ObjectId;
    if (status === 'verified') questionIds.push({ id: doc._id as mongoose.Types.ObjectId, q });
  }
  console.log(`Questions: ${QUESTIONS.length} (${questionIds.length} verified)`);

  // --- Mastery (misconception + topic rollup) ---------------------------------
  for (const [slug, plan] of Object.entries(MASTERY_PLAN)) {
    await Mastery.create({
      subject_type: 'misconception',
      subject_id: slug,
      fsrs: {
        stability: stabilityFor(plan.strength),
        difficulty: 5 + (slug.length % 4),
        last_review: daysFromNow(-plan.lastReviewDaysAgo),
        due: daysFromNow(plan.dueInDays),
      },
      strength: plan.strength,
      consecutive_distinct_correct: plan.cdc,
      last_question_ids: [],
    });
  }
  const byTopic = new Map<string, number[]>();
  for (const m of MISCONCEPTIONS) {
    const plan = MASTERY_PLAN[m.id];
    if (!plan) continue;
    const full = realPath(m.topic);
    const arr = byTopic.get(full) ?? [];
    arr.push(plan.strength);
    byTopic.set(full, arr);
    // Roll strengths up into the domain node too, for cert tracks.
    const cp = CERT_PARENT[m.topic];
    if (cp) {
      const track = m.topic.slice(0, m.topic.indexOf('/'));
      const domainPath = `${track}/${cp.slug}`;
      const dArr = byTopic.get(domainPath) ?? [];
      dArr.push(plan.strength);
      byTopic.set(domainPath, dArr);
    }
  }
  for (const [topicPath, strengths] of byTopic) {
    const mean = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    await Mastery.create({
      subject_type: 'topic',
      subject_id: topicPath,
      fsrs: {
        stability: stabilityFor(Math.min(mean, 0.95)),
        difficulty: 5,
        last_review: daysFromNow(-1),
        due: daysFromNow(3),
      },
      strength: Math.round(mean * 100) / 100,
      consecutive_distinct_correct: 0,
      last_question_ids: [],
    });
  }
  console.log(`Mastery docs: ${Object.keys(MASTERY_PLAN).length} misconceptions + ${byTopic.size} topics`);

  // --- Attempt history: 21 days, ~75% accuracy, streak gap at day -7 ----------
  const attempts: Array<Record<string, unknown>> = [];
  let counter = 0;
  for (let day = 21; day >= 1; day--) {
    if (day === 7) continue; // the missed day (freeze token spent)
    const perDay = 8 + ((day * 3) % 6);
    for (let i = 0; i < perDay; i++) {
      const pick = questionIds[(day * 13 + i * 7) % questionIds.length]!;
      const correct = (day * 17 + i * 11) % 100 < 75;
      const firstDistractor = pick.q.distractors.find((d) => d.m);
      const ts = new Date(Date.now() - day * 86_400_000 + (7 * 3600 + i * 90) * 1000);
      attempts.push({
        idempotency_key: `seed-d${day}-${i}-${counter++}`,
        question_id: pick.id,
        selected_index: 0,
        correct,
        misconception_id: correct ? undefined : firstDistractor?.m,
        mode: i < perDay - 2 ? 'daily' : ((day + i) % 3 === 0 ? 'drill' : 'topic'),
        latency_ms: 6000 + ((day * i * 997) % 34_000),
        ts,
        client_ts: ts,
        synced: true,
      });
    }
  }
  await Attempt.insertMany(attempts);
  console.log(`Attempts: ${attempts.length} over 21 days`);

  // --- Disputes ----------------------------------------------------------------
  if (disputedQuestionId) {
    await Dispute.create({
      question_id: disputedQuestionId,
      reason_tag: 'two-defensible',
      note: 'Phantom reads under PG REPEATABLE READ — options A and B both defensible depending on whether we mean the SQL standard or PostgreSQL implementation.',
      ts: daysFromNow(-2),
      resolution: 'pending',
    });
  }
  if (retiredQuestionId) {
    await Dispute.create({
      question_id: retiredQuestionId,
      reason_tag: 'contradicts-source',
      note: 'Default depends on deploy mode and platform; the "vanilla" framing is ambiguous.',
      ts: daysFromNow(-9),
      resolution: 'retired',
    });
  }
  console.log('Disputes: 2');

  // --- User state ---------------------------------------------------------------
  const tz = 'Asia/Kolkata';
  const yesterday = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(daysFromNow(-1));
  const insightDocs = ['s3-eventual-consistency-outdated', 'left-join-where-null-trap',
    'kinesis-shard-write-limit-confusion', 'docker-layer-cache-order', 'iam-explicit-deny-override']
    .map((slug) => docIdBySlug.get(slug)!.toString());

  await UserState.findByIdAndUpdate(
    'me',
    {
      _id: 'me',
      streak: { current: 6, best: 11, freeze_tokens: 2, last_active_date: yesterday },
      xp: 5240,
      level: 8,
      daily_goal: 10,
      notification_hour: 7,
      timezone: tz,
      insight_cards_unlocked: insightDocs,
      settings: { reduced_motion: false, haptics: true },
    },
    { upsert: true },
  );
  console.log('User state: streak 6 (best 11), xp 5240, level 8');

  await disconnectDB();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
