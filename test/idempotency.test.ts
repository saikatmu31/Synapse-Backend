import { describe, it, expect } from 'vitest';

// Unit test idempotency key deduplication logic
// Mirrors the check in attempts.routes.ts: if an attempt with the same key
// already exists, return the cached result without re-processing.

interface CachedAttempt {
  idempotency_key: string;
  correct: boolean;
  correct_index: number;
  xp_delta: number;
}

class MockAttemptStore {
  private store = new Map<string, CachedAttempt>();
  private processCount = 0;

  async process(key: string, correct: boolean, correct_index: number, xp_delta: number): Promise<CachedAttempt> {
    if (this.store.has(key)) {
      // Return cached — do NOT increment processCount
      return this.store.get(key)!;
    }
    this.processCount++;
    const result: CachedAttempt = { idempotency_key: key, correct, correct_index, xp_delta };
    this.store.set(key, result);
    return result;
  }

  getProcessCount(): number {
    return this.processCount;
  }
}

describe('Attempt idempotency', () => {
  it('does not double-process the same idempotency key', async () => {
    const store = new MockAttemptStore();
    const key = 'session-abc-q1-attempt-1';

    const first = await store.process(key, true, 0, 30);
    const second = await store.process(key, true, 0, 30); // same key

    expect(store.getProcessCount()).toBe(1); // only processed once
    expect(first).toEqual(second); // same result returned
  });

  it('processes different keys independently', async () => {
    const store = new MockAttemptStore();

    await store.process('key-1', true, 0, 30);
    await store.process('key-2', false, 2, 0);
    await store.process('key-3', true, 1, 20);

    expect(store.getProcessCount()).toBe(3);
  });

  it('returns correct cached result on replay', async () => {
    const store = new MockAttemptStore();
    const key = 'replay-key';

    const original = await store.process(key, false, 2, 0);
    const replay = await store.process(key, false, 2, 0);

    expect(replay.correct).toBe(false);
    expect(replay.correct_index).toBe(2);
    expect(replay.xp_delta).toBe(0);
    expect(original).toEqual(replay);
  });

  it('handles batch with mixed new and duplicate keys', async () => {
    const store = new MockAttemptStore();
    const keys = ['k1', 'k2', 'k1', 'k3', 'k2'];

    for (const k of keys) {
      await store.process(k, true, 0, 10);
    }

    // Only 3 unique keys processed
    expect(store.getProcessCount()).toBe(3);
  });
});
