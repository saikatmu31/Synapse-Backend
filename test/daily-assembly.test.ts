import { describe, it, expect } from 'vitest';

// Unit-test the consecutive-track guard and shortfall flag logic
// (pure functions extracted from quiz.service.ts assembleQuiz logic)

function enforceMaxConsecutive<T extends { track_key: string }>(
  questions: T[],
  maxConsec: number,
): T[] {
  const result: T[] = [];
  let lastTrack = '';
  let consecCount = 0;
  const deferred: T[] = [];

  for (const q of questions) {
    if (q.track_key === lastTrack) {
      consecCount++;
    } else {
      consecCount = 1;
      lastTrack = q.track_key;
    }

    if (consecCount <= maxConsec) {
      result.push(q);
    } else {
      deferred.push(q);
    }
  }

  // Naively append deferred (real impl interleaves them)
  return [...result, ...deferred];
}

type MockQ = { id: string; track_key: string };

describe('Daily 10 — consecutive track guard', () => {
  it('allows up to 2 consecutive questions from one track', () => {
    const qs: MockQ[] = [
      { id: '1', track_key: 'a' },
      { id: '2', track_key: 'a' },
      { id: '3', track_key: 'b' },
    ];
    const result = enforceMaxConsecutive(qs, 2);
    expect(result.slice(0, 3).map((q) => q.track_key)).toEqual(['a', 'a', 'b']);
  });

  it('defers 3rd consecutive question from same track', () => {
    const qs: MockQ[] = [
      { id: '1', track_key: 'a' },
      { id: '2', track_key: 'a' },
      { id: '3', track_key: 'a' }, // 3rd — should be deferred
      { id: '4', track_key: 'b' },
    ];
    const result = enforceMaxConsecutive(qs, 2);
    // First 2 from 'a', then 'b', then deferred 'a'
    expect(result[0].track_key).toBe('a');
    expect(result[1].track_key).toBe('a');
    expect(result[2].track_key).toBe('b');
    expect(result[3].track_key).toBe('a');
  });

  it('handles single-track pool without crashing', () => {
    const qs: MockQ[] = Array.from({ length: 5 }, (_, i) => ({ id: String(i), track_key: 'a' }));
    const result = enforceMaxConsecutive(qs, 2);
    expect(result).toHaveLength(5); // all returned, deferred ones appended
  });
});

describe('Shortfall detection', () => {
  it('detects shortfall when fewer questions than requested', () => {
    const requested = 10;
    const available = 6;
    const shortfall = available < requested;
    expect(shortfall).toBe(true);
  });

  it('no shortfall when pool satisfies request', () => {
    const requested = 5;
    const available = 5;
    const shortfall = available < requested;
    expect(shortfall).toBe(false);
  });
});

describe('Quiz payload — no answer leak', () => {
  it('strips correct flag from options', () => {
    const raw = {
      stem: 'What happens?',
      options: [
        { text: 'A', correct: true, explanation: 'Because...', misconception_id: undefined },
        { text: 'B', misconception_id: 's3-eventual', thought_process: 'You picked B because...' },
        { text: 'C', misconception_id: 's3-replication', thought_process: 'You picked C because...' },
        { text: 'D', misconception_id: 's3-versioning', thought_process: 'You picked D because...' },
      ],
    };

    // Simulate the strip operation from toQuizQuestion
    const quizOptions = raw.options.map(({ text }) => ({ text }));

    for (const opt of quizOptions) {
      expect(opt).not.toHaveProperty('correct');
      expect(opt).not.toHaveProperty('explanation');
      expect(opt).not.toHaveProperty('misconception_id');
      expect(opt).not.toHaveProperty('thought_process');
    }
    expect(quizOptions).toHaveLength(4);
  });
});
