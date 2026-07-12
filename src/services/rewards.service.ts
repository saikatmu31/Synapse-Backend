import { UserState, ConceptDoc } from '../models/index.js';
import type { IUserState } from '../models/index.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RewardResult {
  xp_delta: number;
  new_xp: number;
  new_level: number;
  level_up: boolean;
  streak: {
    current: number;
    best: number;
    freeze_used: boolean;
    freeze_tokens: number;
  };
  squashed?: string;       // misconception_id if squashed this attempt
  insight_card?: string;   // concept_doc id (rare random reward, ~15%)
  momentum_event?: 'combo_3' | 'combo_5' | 'boss_bonus';
}

// ---------------------------------------------------------------------------
// Level formula
// ---------------------------------------------------------------------------

/** level = floor(sqrt(xp / 100)) + 1 — never decreases. */
function calcLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

// ---------------------------------------------------------------------------
// processRewards
// ---------------------------------------------------------------------------

export async function processRewards(params: {
  correct: boolean;
  difficulty: number;
  is_boss: boolean;
  squashed: boolean;
  misconception_id?: string;
  mode: string;
  session_streak: number; // consecutive correct in current session (caller tracks)
}): Promise<RewardResult> {
  const { correct, difficulty, is_boss, squashed, misconception_id, session_streak } = params;

  // 1. Load or initialise user state (singleton doc: _id = "me").
  let user = await UserState.findById('me');
  if (!user) {
    user = await UserState.create({
      _id: 'me',
      streak: { current: 0, best: 0, freeze_tokens: 3, last_active_date: '' },
      xp: 0,
      level: 1,
      daily_goal: 10,
      notification_hour: 9,
      timezone: 'UTC',
      insight_cards_unlocked: [],
      settings: {},
    });
  }

  // 2. Compute XP delta.
  let xp_delta = 0;
  if (correct) {
    xp_delta = difficulty * 10;
    if (is_boss) xp_delta *= 3;
  }

  const new_xp = user.xp + xp_delta;
  const old_level = user.level;
  const new_level = Math.max(old_level, calcLevel(new_xp));
  const level_up = new_level > old_level;

  // 3. Momentum events.
  let momentum_event: RewardResult['momentum_event'];
  if (correct) {
    if (is_boss) {
      momentum_event = 'boss_bonus';
    } else if (session_streak >= 5) {
      momentum_event = 'combo_5';
    } else if (session_streak >= 3) {
      momentum_event = 'combo_3';
    }
  }

  // 4. Insight card: ~15% chance on correct answer.
  let insight_card: string | undefined;
  if (correct && Math.random() < 0.15) {
    // Pick a random ConceptDoc id; prefer same topic as the misconception if available.
    insight_card = await pickRandomConceptDocId();
  }

  // 5. Persist updated XP and level atomically.
  await UserState.updateOne(
    { _id: 'me' },
    {
      $set: { xp: new_xp, level: new_level },
      ...(insight_card
        ? { $addToSet: { insight_cards_unlocked: insight_card } }
        : {}),
    },
  );

  // 6. Read back current streak state (may have been updated by checkAndAdvanceStreak elsewhere).
  const updatedUser = await UserState.findById('me').lean();
  const streak = updatedUser?.streak ?? user.streak;

  return {
    xp_delta,
    new_xp,
    new_level,
    level_up,
    streak: {
      current: streak.current,
      best: streak.best,
      freeze_used: false, // streak freeze is evaluated at daily-goal completion
      freeze_tokens: streak.freeze_tokens,
    },
    ...(squashed && misconception_id ? { squashed: misconception_id } : {}),
    ...(insight_card ? { insight_card } : {}),
    ...(momentum_event ? { momentum_event } : {}),
  };
}

// ---------------------------------------------------------------------------
// checkAndAdvanceStreak
// ---------------------------------------------------------------------------

/**
 * Called once when the user completes their daily goal.
 * Advances or resets the streak, spending a freeze token if the user missed a day.
 * Timezone-safe: compares ISO date strings in the user's own timezone.
 */
export async function checkAndAdvanceStreak(
  userTz: string,
): Promise<RewardResult['streak']> {
  const user = await UserState.findById('me');
  if (!user) {
    return { current: 0, best: 0, freeze_used: false, freeze_tokens: 0 };
  }

  const todayStr = todayInTz(userTz);
  const lastStr = user.streak.last_active_date;

  let current = user.streak.current;
  let best = user.streak.best;
  let freeze_tokens = user.streak.freeze_tokens;
  let freeze_used = false;

  if (lastStr === todayStr) {
    // Already counted today — no change.
  } else {
    const daysDiff = lastStr ? daysBetween(lastStr, todayStr) : null;

    if (daysDiff === null || daysDiff === 1) {
      // First ever activity, or yesterday was the last active day → continue streak.
      current += 1;
    } else if (daysDiff === 2 && freeze_tokens > 0) {
      // Missed exactly one day; spend a freeze token.
      freeze_tokens -= 1;
      freeze_used = true;
      current += 1;
    } else {
      // Gap too large or no freeze tokens left → reset.
      current = 1;
    }

    best = Math.max(best, current);

    await UserState.updateOne(
      { _id: 'me' },
      {
        $set: {
          'streak.current': current,
          'streak.best': best,
          'streak.freeze_tokens': freeze_tokens,
          'streak.last_active_date': todayStr,
        },
      },
    );
  }

  return { current, best, freeze_used, freeze_tokens };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Return today's date string "YYYY-MM-DD" in the given IANA timezone. */
function todayInTz(tz: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    // en-CA format is already YYYY-MM-DD.
    return formatter.format(new Date());
  } catch {
    // Fall back to UTC if tz is invalid.
    return new Date().toISOString().slice(0, 10);
  }
}

/** Number of calendar days between two ISO date strings "YYYY-MM-DD". */
function daysBetween(from: string, to: string): number {
  const msPerDay = 86_400_000;
  return Math.round((Date.parse(to) - Date.parse(from)) / msPerDay);
}

/** Pick a random ConceptDoc _id string, or undefined if none exist. */
async function pickRandomConceptDocId(): Promise<string | undefined> {
  const count = await ConceptDoc.countDocuments();
  if (count === 0) return undefined;
  const skip = Math.floor(Math.random() * count);
  const doc = await ConceptDoc.findOne().skip(skip).select('_id').lean();
  if (!doc) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return String((doc as any)._id);
}

// Re-export IUserState for callers that need it.
export type { IUserState };
