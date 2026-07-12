import { describe, it, expect } from 'vitest';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';

// Unit test FSRS state transitions without a database
// Mirrors the logic in fsrs.service.ts

function cardFromMastery(m: {
  stability: number;
  difficulty: number;
  last_review: Date | null;
  due: Date;
}) {
  const base = createEmptyCard();
  return {
    ...base,
    state: State.Review, // must be Review for stability/interval to grow correctly
    stability: m.stability,
    difficulty: m.difficulty,
    last_review: m.last_review,
    due: m.due,
  };
}

function strengthFromStability(stability: number): number {
  return Math.min(1, stability / (stability + 9));
}

describe('FSRS transitions', () => {
  const f = fsrs();
  const now = new Date('2024-06-02T09:00:00Z');

  it('Again rating shortens interval significantly', () => {
    const card = cardFromMastery({ stability: 10, difficulty: 5, last_review: new Date('2024-05-23T09:00:00Z'), due: now });
    const result = f.next(card, now, Rating.Again);
    expect(result.card.due.getTime()).toBeGreaterThan(now.getTime());
    // Should schedule for review very soon (within hours, not weeks)
    const intervalDays = (result.card.due.getTime() - now.getTime()) / 86_400_000;
    expect(intervalDays).toBeLessThan(2);
  });

  it('Good rating advances stability', () => {
    const card = cardFromMastery({ stability: 5, difficulty: 5, last_review: new Date('2024-05-28T09:00:00Z'), due: now });
    const result = f.next(card, now, Rating.Good);
    expect(result.card.stability).toBeGreaterThan(card.stability);
    const intervalDays = (result.card.due.getTime() - now.getTime()) / 86_400_000;
    expect(intervalDays).toBeGreaterThan(1);
  });

  it('Easy rating gives long interval (squash)', () => {
    const card = cardFromMastery({ stability: 20, difficulty: 4, last_review: new Date('2024-05-12T09:00:00Z'), due: now });
    const result = f.next(card, now, Rating.Easy);
    const intervalDays = (result.card.due.getTime() - now.getTime()) / 86_400_000;
    expect(intervalDays).toBeGreaterThan(30);
  });

  it('New card with Again has low stability', () => {
    const card = createEmptyCard(now);
    const result = f.next(card, now, Rating.Again);
    expect(result.card.stability).toBeLessThan(1);
  });
});

describe('Strength derivation', () => {
  it('strength approaches 1 as stability grows', () => {
    expect(strengthFromStability(0)).toBeCloseTo(0);
    expect(strengthFromStability(9)).toBeCloseTo(0.5);
    expect(strengthFromStability(90)).toBeCloseTo(0.909, 2);
    expect(strengthFromStability(900)).toBeGreaterThan(0.99);
  });

  it('strength is 0 for new card (stability 0)', () => {
    // Stability is always non-negative in practice; 0 means never reviewed
    expect(strengthFromStability(0)).toBeCloseTo(0);
    expect(strengthFromStability(0)).toBeGreaterThanOrEqual(0);
  });
});

describe('Squash logic (consecutive_distinct_correct)', () => {
  it('reaches squash at cdc=3', () => {
    let cdc = 0;
    const seenQuestions = new Set<string>();
    const questions = ['q1', 'q2', 'q3'];

    for (const qid of questions) {
      if (!seenQuestions.has(qid)) {
        seenQuestions.add(qid);
        cdc++;
      }
    }

    const squashed = cdc >= 3;
    expect(squashed).toBe(true);
  });

  it('duplicate question does not increment cdc', () => {
    let cdc = 0;
    const seenQuestions = new Set<string>();
    const questions = ['q1', 'q1', 'q2']; // q1 repeated

    for (const qid of questions) {
      if (!seenQuestions.has(qid)) {
        seenQuestions.add(qid);
        cdc++;
      }
    }

    expect(cdc).toBe(2); // only 2 distinct
    expect(cdc >= 3).toBe(false);
  });
});
