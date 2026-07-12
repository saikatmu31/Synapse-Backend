import { createEmptyCard, fsrs, Rating, type Card, type RecordLogItem } from 'ts-fsrs';
import { Mastery } from '../models/index.js';
import type { IMastery } from '../models/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a ts-fsrs Card from a stored IFSRS object (or a fresh empty card). */
function toFsrsCard(mastery: IMastery): Card {
  const base = createEmptyCard();
  return {
    ...base,
    stability: mastery.fsrs.stability,
    difficulty: mastery.fsrs.difficulty,
    last_review: mastery.fsrs.last_review ?? undefined,
    due: mastery.fsrs.due,
  } as Card;
}

/** strength = stability / (stability + 9), clamped to [0, 1]. */
function stabilityToStrength(stability: number): number {
  if (stability <= 0) return 0;
  return Math.min(1, stability / (stability + 9));
}

// ---------------------------------------------------------------------------
// applyAttemptToFSRS
// ---------------------------------------------------------------------------

export async function applyAttemptToFSRS(params: {
  misconception_id: string;
  question_id: string;
  correct: boolean;
}): Promise<{
  squashed: boolean;
  kill_progress: number;
  due: Date;
}> {
  const { misconception_id, question_id, correct } = params;

  // 1. Load or create the Mastery doc for this misconception.
  let mastery = await Mastery.findOne({
    subject_type: 'misconception',
    subject_id: misconception_id,
  });

  if (!mastery) {
    const emptyCard = createEmptyCard();
    mastery = await Mastery.create({
      subject_type: 'misconception',
      subject_id: misconception_id,
      fsrs: {
        stability: emptyCard.stability,
        difficulty: emptyCard.difficulty,
        last_review: null,
        due: emptyCard.due,
      },
      strength: 0,
      consecutive_distinct_correct: 0,
      last_question_ids: [],
    });
  }

  // 2. Create the scheduler.
  const f = fsrs();

  // 3. Map stored fields to a ts-fsrs Card.
  const card = toFsrsCard(mastery);

  const now = new Date();
  let rating: Rating;
  let squashed = false;
  let cdc = mastery.consecutive_distinct_correct;
  let lastQIds: string[] = [...mastery.last_question_ids];

  // 4 & 5. Determine rating and update tracking fields.
  if (!correct) {
    // Wrong: Rating.Again, no change to last_question_ids or cdc.
    rating = Rating.Again;
  } else {
    const alreadySeen = lastQIds.includes(question_id);
    if (!alreadySeen) {
      // New distinct correct question.
      lastQIds.push(question_id);
      cdc = Math.min(cdc + 1, 3);
    }

    if (cdc >= 3) {
      rating = Rating.Easy;
      squashed = true;
      cdc = 3; // cap
    } else {
      rating = Rating.Good;
    }
  }

  // 6. Advance the FSRS card state.
  const result: RecordLogItem = f.next(card, now, rating);
  const newCard: Card = result.card;

  // 7. Persist updated Mastery doc.
  const newStrength = stabilityToStrength(newCard.stability);

  await Mastery.updateOne(
    { subject_type: 'misconception', subject_id: misconception_id },
    {
      $set: {
        'fsrs.stability': newCard.stability,
        'fsrs.difficulty': newCard.difficulty,
        'fsrs.last_review': now,
        'fsrs.due': newCard.due,
        strength: newStrength,
        consecutive_distinct_correct: cdc,
        last_question_ids: lastQIds,
      },
    },
  );

  // 8. Return result.
  return {
    squashed,
    kill_progress: cdc,
    due: newCard.due,
  };
}

// ---------------------------------------------------------------------------
// Convenience getters
// ---------------------------------------------------------------------------

export async function getMasteryForMisconception(
  misconception_id: string,
): Promise<IMastery | null> {
  return Mastery.findOne({
    subject_type: 'misconception',
    subject_id: misconception_id,
  }).lean();
}

export async function getMasteryForTopic(topic_path: string): Promise<IMastery | null> {
  return Mastery.findOne({
    subject_type: 'topic',
    subject_id: topic_path,
  }).lean();
}
