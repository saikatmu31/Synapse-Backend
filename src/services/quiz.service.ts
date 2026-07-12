import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { Question, Mastery, Track, Attempt } from '../models/index.js';
import type { IQuestion } from '../models/index.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface QuizQuestion {
  id: string;
  stem: string;
  options: Array<{ text: string }>; // text only — NO correct flag, no misconception_id
  meta: {
    track_key: string;
    topic_path: string;
    is_boss: boolean;
    difficulty: number;
    blueprint_domain?: string;
    code_lang?: string;
  };
}

export interface QuizPayload {
  quiz_id: string;
  mode: string;
  questions: QuizQuestion[];
  meta: { shortfall?: boolean };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function assembleQuiz(params: {
  mode: 'daily' | 'drill' | 'topic' | 'exam' | 'adhoc';
  track_key?: string;
  topic?: string;
  count?: number;
}): Promise<QuizPayload> {
  const { mode, track_key, topic, count } = params;

  let questions: IQuestion[] = [];

  switch (mode) {
    case 'daily':
      questions = await assembleDaily();
      break;
    case 'drill':
      questions = await assembleDrill(track_key);
      break;
    case 'topic':
      if (!topic) throw new Error('topic parameter required for topic mode');
      questions = await assembleTopic(topic, count);
      break;
    case 'exam':
      if (!track_key) throw new Error('track_key required for exam mode');
      questions = await assembleExam(track_key, count ?? 65);
      break;
    case 'adhoc':
      questions = await assembleAdhoc(topic ?? track_key ?? '', count);
      break;
  }

  return {
    quiz_id: randomBytes(8).toString('hex'),
    mode,
    questions: questions.map(toQuizQuestion),
    meta: { shortfall: questions.length < (count ?? 10) },
  };
}

// ---------------------------------------------------------------------------
// Strip sensitive fields before sending to client
// ---------------------------------------------------------------------------

function toQuizQuestion(q: IQuestion & { _id?: mongoose.Types.ObjectId | string }): QuizQuestion {
  return {
    id: String(q._id),
    stem: q.stem,
    // Strip correct flag, explanation, misconception_id, thought_process.
    options: q.options.map((o) => ({ text: o.text })),
    meta: {
      track_key: q.track_key,
      topic_path: q.topic_path,
      is_boss: q.is_boss,
      difficulty: q.difficulty,
      ...(q.blueprint_domain ? { blueprint_domain: q.blueprint_domain } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Daily (mode: 'daily')
// ---------------------------------------------------------------------------

async function assembleDaily(): Promise<IQuestion[]> {
  // Load user state for daily_goal.
  const { UserState } = await import('../models/index.js');
  const user = await UserState.findById('me').lean();
  const targetCount = user?.daily_goal ?? 10;

  const now = new Date();

  // Load active tracks sorted by intensity desc.
  const tracks = await Track.find({ intensity: { $gt: 0 } })
    .sort({ intensity: -1 })
    .lean();

  const trackKeys = tracks.map((t) => t.key);

  // ~40% due reviews, ~40% weak topics, ~20% new material.
  const dueTarget = Math.round(targetCount * 0.4);
  const weakTarget = Math.round(targetCount * 0.4);
  const newTarget = targetCount - dueTarget - weakTarget;

  // Pool 1: Due misconception review questions (fsrs.due <= now).
  const dueMasteryDocs = await Mastery.find({
    subject_type: 'misconception',
    'fsrs.due': { $lte: now },
  })
    .sort({ 'fsrs.due': 1 })
    .limit(dueTarget * 5)
    .lean();

  const dueMisconceptionIds = dueMasteryDocs.map((m) => m.subject_id);

  // Find questions tagged with those misconceptions, within active tracks.
  const dueQuestions = await Question.find({
    status: 'verified',
    track_key: trackKeys.length > 0 ? { $in: trackKeys } : { $exists: true },
    'options.misconception_id': { $in: dueMisconceptionIds },
  })
    .limit(dueTarget * 3)
    .lean();

  // Pool 2: Weak-topic questions (strength < 0.5).
  const weakTopicMastery = await Mastery.find({
    subject_type: 'topic',
    strength: { $lt: 0.5 },
  })
    .limit(weakTarget * 3)
    .lean();

  const weakTopicPaths = weakTopicMastery.map((m) => m.subject_id);

  const weakQuestions = await Question.find({
    status: 'verified',
    track_key: trackKeys.length > 0 ? { $in: trackKeys } : { $exists: true },
    topic_path: { $in: weakTopicPaths },
  })
    .limit(weakTarget * 3)
    .lean();

  // Pool 3: New material — questions never attempted.
  const attemptedIds = await Attempt.distinct('question_id');
  const newQuestions = await Question.find({
    status: 'verified',
    track_key: trackKeys.length > 0 ? { $in: trackKeys } : { $exists: true },
    _id: { $nin: attemptedIds },
  })
    .limit(newTarget * 3)
    .lean();

  // Boss questions.
  const bossQuestions = await Question.find({
    status: 'verified',
    is_boss: true,
    track_key: trackKeys.length > 0 ? { $in: trackKeys } : { $exists: true },
  })
    .limit(5)
    .lean();

  // Build a combined pool avoiding duplicates, including 1 boss if available.
  const seen = new Set<string>();
  const pool: IQuestion[] = [];

  function addUnique(qs: IQuestion[]): void {
    for (const q of qs) {
      const id = String((q as IQuestion & { _id: mongoose.Types.ObjectId })._id);
      if (!seen.has(id)) {
        seen.add(id);
        pool.push(q);
      }
    }
  }

  // Add boss first so it gets included.
  if (bossQuestions.length > 0) {
    addUnique([bossQuestions[0]!]);
  }

  addUnique(dueQuestions);
  addUnique(weakQuestions);
  addUnique(newQuestions);

  // Interleave by track proportional to intensity, ≤2 consecutive from same track.
  const selected = interleaveByTrack(pool, tracks, targetCount);

  return selected;
}

/** Interleave questions by track proportional to intensity, ≤2 consecutive from same track. */
function interleaveByTrack(
  pool: IQuestion[],
  tracks: Array<{ key: string; intensity: number }>,
  targetCount: number,
): IQuestion[] {
  if (pool.length === 0) return [];

  // Group by track.
  const byTrack = new Map<string, IQuestion[]>();
  for (const q of pool) {
    const bucket = byTrack.get(q.track_key) ?? [];
    bucket.push(q);
    byTrack.set(q.track_key, bucket);
  }

  // Build a weighted ordering: tracks with higher intensity appear more.
  const totalIntensity = tracks.reduce((s, t) => s + t.intensity, 0) || 1;
  const result: IQuestion[] = [];
  let lastTrack: string | null = null;
  let consecutiveCount = 0;

  // Round-robin weighted selection.
  const cursors = new Map<string, number>(tracks.map((t) => [t.key, 0]));

  for (let i = 0; i < targetCount; i++) {
    // Pick the track with highest remaining quota that isn't violating ≤2 consecutive.
    let picked: IQuestion | null = null;

    // Try tracks in intensity order.
    const sortedTracks = [...tracks].sort((a, b) => {
      const aShare = a.intensity / totalIntensity;
      const bShare = b.intensity / totalIntensity;
      // Bias toward higher intensity but avoid triple-consecutive.
      const aPenalty = a.key === lastTrack && consecutiveCount >= 2 ? -100 : 0;
      const bPenalty = b.key === lastTrack && consecutiveCount >= 2 ? -100 : 0;
      return bShare + bPenalty - (aShare + aPenalty);
    });

    for (const track of sortedTracks) {
      if (track.key === lastTrack && consecutiveCount >= 2) continue;
      const bucket = byTrack.get(track.key) ?? [];
      const cursor = cursors.get(track.key) ?? 0;
      if (cursor < bucket.length) {
        picked = bucket[cursor]!;
        cursors.set(track.key, cursor + 1);

        if (track.key === lastTrack) {
          consecutiveCount++;
        } else {
          lastTrack = track.key;
          consecutiveCount = 1;
        }
        break;
      }
    }

    if (!picked) {
      // Fall back: any remaining question.
      for (const [tk, bucket] of byTrack) {
        const cursor = cursors.get(tk) ?? 0;
        if (cursor < bucket.length) {
          picked = bucket[cursor]!;
          cursors.set(tk, cursor + 1);
          if (tk === lastTrack) {
            consecutiveCount++;
          } else {
            lastTrack = tk;
            consecutiveCount = 1;
          }
          break;
        }
      }
    }

    if (!picked) break; // exhausted pool

    result.push(picked);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Drill (mode: 'drill')
// ---------------------------------------------------------------------------

async function assembleDrill(track_key?: string): Promise<IQuestion[]> {
  const now = new Date();

  // Find due or weak misconception mastery docs.
  const masteryDocs = await Mastery.find({
    subject_type: 'misconception',
    $or: [{ 'fsrs.due': { $lte: now } }, { strength: { $lt: 0.5 } }],
  }).lean();

  const misconceptionIds = masteryDocs.map((m) => m.subject_id);

  // Build last_question_ids map to avoid repeating the same question per misconception.
  const lastSeenMap = new Map<string, string[]>();
  for (const doc of masteryDocs) {
    lastSeenMap.set(doc.subject_id, doc.last_question_ids);
  }

  const filter: Record<string, unknown> = {
    status: 'verified',
    'options.misconception_id': { $in: misconceptionIds },
  };
  if (track_key) {
    filter['track_key'] = track_key;
  }

  const candidates = await Question.find(filter).lean();

  // For each misconception, prefer a question not in last_question_ids.
  const scored = candidates.map((q) => {
    const misconId = q.options.find((o) => o.misconception_id)?.misconception_id;
    const lastSeen = misconId ? (lastSeenMap.get(misconId) ?? []) : [];
    const qId = String((q as IQuestion & { _id: mongoose.Types.ObjectId })._id);
    const freshBonus = lastSeen.includes(qId) ? 0 : 1;
    return { q, score: freshBonus };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.q).slice(0, 20);
}

// ---------------------------------------------------------------------------
// Topic Focus (mode: 'topic')
// ---------------------------------------------------------------------------

async function assembleTopic(topic: string, count?: number): Promise<IQuestion[]> {
  const limit = count ?? 20;

  const questions = await Question.find({
    status: 'verified',
    topic_path: { $regex: `^${escapeRegex(topic)}` },
  })
    .sort({ difficulty: 1 }) // difficulty ladder: easiest first
    .limit(limit)
    .lean();

  return questions;
}

// ---------------------------------------------------------------------------
// Exam (mode: 'exam')
// ---------------------------------------------------------------------------

async function assembleExam(track_key: string, count: number): Promise<IQuestion[]> {
  const track = await Track.findOne({ key: track_key }).lean();
  if (!track || !track.blueprint || track.blueprint.length === 0) {
    // No blueprint: just pull verified questions for this track.
    return Question.find({ status: 'verified', track_key })
      .limit(count)
      .lean();
  }

  const totalWeight = track.blueprint.reduce((s, bp) => s + bp.weight, 0) || 1;
  const collected: IQuestion[] = [];
  const seen = new Set<string>();

  for (const bp of track.blueprint) {
    const domainCount = Math.round((bp.weight / totalWeight) * count);
    if (domainCount === 0) continue;

    const domainPrefix = `${track_key}/${slugify(bp.domain)}`;

    const qs = await Question.find({
      status: 'verified',
      track_key,
      $or: [
        { blueprint_domain: bp.domain },
        { topic_path: { $regex: `^${escapeRegex(domainPrefix)}` } },
      ],
    })
      .limit(domainCount * 2)
      .lean();

    let added = 0;
    for (const q of qs) {
      if (added >= domainCount) break;
      const id = String((q as IQuestion & { _id: mongoose.Types.ObjectId })._id);
      if (!seen.has(id)) {
        seen.add(id);
        collected.push(q);
        added++;
      }
    }
  }

  // Shuffle to avoid domain-clustered ordering.
  return shuffle(collected).slice(0, count);
}

// ---------------------------------------------------------------------------
// Ad-hoc (mode: 'adhoc')
// ---------------------------------------------------------------------------

async function assembleAdhoc(keyword: string, count?: number): Promise<IQuestion[]> {
  const limit = count ?? 10;

  if (!keyword) {
    return Question.find({ status: 'verified' }).limit(limit).lean();
  }

  // Simple keyword search across stem.
  const questions = await Question.find({
    status: 'verified',
    $or: [
      { stem: { $regex: escapeRegex(keyword), $options: 'i' } },
      { topic_path: { $regex: `^${escapeRegex(keyword)}` } },
    ],
  })
    .limit(limit)
    .lean();

  return questions;
}

// ---------------------------------------------------------------------------
// Utilities
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

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
