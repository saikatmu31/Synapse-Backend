import { Mastery, Misconception, Question, Track, Topic } from '../models/index.js';

// ---------------------------------------------------------------------------
// updateTopicStrength
// ---------------------------------------------------------------------------

/**
 * Roll up strength for a topic from its misconceptions' Mastery docs.
 * strength = mean of misconception strengths for that topic (or 0 if none).
 * Upserts a Mastery doc with subject_type 'topic' and subject_id = topic_path.
 */
export async function updateTopicStrength(topic_path: string): Promise<void> {
  // Find all misconceptions belonging to this topic.
  const misconceptions = await Misconception.find({ topic_path }).lean();

  let strength = 0;

  if (misconceptions.length > 0) {
    const misconceptionIds = misconceptions.map((m) => m._id);

    const masteryDocs = await Mastery.find({
      subject_type: 'misconception',
      subject_id: { $in: misconceptionIds },
    }).lean();

    if (masteryDocs.length > 0) {
      const sum = masteryDocs.reduce((acc, doc) => acc + doc.strength, 0);
      strength = sum / masteryDocs.length;
    }
  }

  // Upsert the topic-level Mastery doc.
  // FSRS fields are not meaningfully used for topics — use default empty values.
  const now = new Date();
  await Mastery.updateOne(
    { subject_type: 'topic', subject_id: topic_path },
    {
      $setOnInsert: {
        'fsrs.stability': 0,
        'fsrs.difficulty': 0,
        'fsrs.last_review': null,
        'fsrs.due': now,
        consecutive_distinct_correct: 0,
        last_question_ids: [],
      },
      $set: { strength },
    },
    { upsert: true },
  );
}

// ---------------------------------------------------------------------------
// getCertReadiness
// ---------------------------------------------------------------------------

/**
 * Cert readiness: blueprint-weighted mean of domain strengths.
 * domain strength = mean strength of all misconceptions whose topic_path
 * starts with that domain's path segment.
 */
export async function getCertReadiness(track_key: string): Promise<{
  overall: number;
  by_domain: Array<{ domain: string; weight: number; strength: number }>;
}> {
  const track = await Track.findOne({ key: track_key }).lean();
  if (!track || !track.blueprint || track.blueprint.length === 0) {
    return { overall: 0, by_domain: [] };
  }

  // Fetch all misconceptions for this track.
  // topic_path uses the format "<track_key>/..." so filter by prefix.
  const allMisconceptions = await Misconception.find({
    topic_path: { $regex: `^${escapeRegex(track_key)}/` },
  }).lean();

  // Fetch all mastery docs for those misconceptions.
  const misconceptionIds = allMisconceptions.map((m) => m._id);
  const masteryDocs = await Mastery.find({
    subject_type: 'misconception',
    subject_id: { $in: misconceptionIds },
  }).lean();

  // Build a map: misconception_id -> strength.
  const strengthByMisconception = new Map<string, number>();
  for (const doc of masteryDocs) {
    strengthByMisconception.set(doc.subject_id, doc.strength);
  }

  // Build a map: misconception_id -> topic_path for quick lookup.
  const topicByMisconception = new Map<string, string>();
  for (const m of allMisconceptions) {
    topicByMisconception.set(m._id, m.topic_path);
  }

  // Compute per-domain strength.
  const byDomain: Array<{ domain: string; weight: number; strength: number }> = [];
  let overall = 0;
  let totalWeight = 0;

  for (const bp of track.blueprint) {
    // Domain path prefix: e.g. "dea-c01/domain-1"
    // The blueprint domain label might differ from path; match by simple substring or
    // by normalising the domain label to a path-safe slug to check prefix.
    const domainPrefix = `${track_key}/${slugify(bp.domain)}`;

    const domainMisconceptions = allMisconceptions.filter((m) =>
      m.topic_path.startsWith(domainPrefix),
    );

    let domainStrength = 0;
    if (domainMisconceptions.length > 0) {
      let sum = 0;
      let count = 0;
      for (const m of domainMisconceptions) {
        const s = strengthByMisconception.get(m._id) ?? 0;
        sum += s;
        count++;
      }
      domainStrength = sum / count;
    }

    byDomain.push({ domain: bp.domain, weight: bp.weight, strength: domainStrength });
    overall += bp.weight * domainStrength;
    totalWeight += bp.weight;
  }

  // Normalise overall if weights don't sum to 1.
  if (totalWeight > 0 && Math.abs(totalWeight - 1) > 0.001) {
    overall = overall / totalWeight;
  }

  return { overall, by_domain: byDomain };
}

// ---------------------------------------------------------------------------
// getMapPayload
// ---------------------------------------------------------------------------

/**
 * Neural Map payload — nodes (topics) with coverage, strength, due_count,
 * plus edges (topic-tree adjacency).
 */
export async function getMapPayload(): Promise<{
  nodes: Array<{
    topic_path: string;
    name: string;
    track: string;
    coverage: number;
    strength: number;
    due_count: number;
  }>;
  edges: Array<{ from: string; to: string }>;
}> {
  const now = new Date();

  // Load all topics.
  const topics = await Topic.find().lean();

  // Verified question counts per topic_path.
  const verifiedCounts = await Question.aggregate<{ _id: string; count: number }>([
    { $match: { status: 'verified' } },
    { $group: { _id: '$topic_path', count: { $sum: 1 } } },
  ]);
  const coverageByTopic = new Map<string, number>(
    verifiedCounts.map((r) => [r._id, r.count]),
  );

  // Topic-level mastery docs.
  const topicPaths = topics.map((t) => t.path);
  const topicMasteryDocs = await Mastery.find({
    subject_type: 'topic',
    subject_id: { $in: topicPaths },
  }).lean();
  const masteryByTopic = new Map<string, number>(
    topicMasteryDocs.map((doc) => [doc.subject_id, doc.strength]),
  );

  // Due counts per topic: number of misconceptions in that topic whose fsrs.due <= now.
  const allMisconceptions = await Misconception.find().lean();
  const misconceptionTopicMap = new Map<string, string>(
    allMisconceptions.map((m) => [m._id, m.topic_path]),
  );

  const dueMasteryDocs = await Mastery.find({
    subject_type: 'misconception',
    'fsrs.due': { $lte: now },
  }).lean();

  const dueCountByTopic = new Map<string, number>();
  for (const doc of dueMasteryDocs) {
    const tp = misconceptionTopicMap.get(doc.subject_id);
    if (tp) {
      dueCountByTopic.set(tp, (dueCountByTopic.get(tp) ?? 0) + 1);
    }
  }

  // Build nodes.
  const nodes = topics.map((t) => ({
    topic_path: t.path,
    name: t.name,
    track: t.track_key,
    coverage: coverageByTopic.get(t.path) ?? 0,
    strength: masteryByTopic.get(t.path) ?? 0,
    due_count: dueCountByTopic.get(t.path) ?? 0,
  }));

  // Build edges from parent→child adjacency using parent_id.
  // Build path lookup: ObjectId string → topic path.
  const pathById = new Map<string, string>();
  for (const t of topics) {
    // Topic._id is an ObjectId; use toString().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pathById.set((t as any)._id.toString(), t.path);
  }

  const edges: Array<{ from: string; to: string }> = [];
  for (const t of topics) {
    if (t.parent_id) {
      const parentPath = pathById.get(t.parent_id.toString());
      if (parentPath) {
        edges.push({ from: parentPath, to: t.path });
      }
    }
  }

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
