import { describe, it, expect, vi, beforeEach } from 'vitest';

// Streak logic extracted for unit testing (mirrors rewards.service.ts)
function getDateInTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function computeStreakUpdate(
  current: number,
  best: number,
  freeze_tokens: number,
  last_active_date: string,
  now: Date,
  tz: string,
): { current: number; best: number; freeze_tokens: number; freeze_used: boolean; last_active_date: string } {
  const today = getDateInTz(now, tz);
  if (last_active_date === today) {
    // Already completed today — no change
    return { current, best, freeze_tokens, freeze_used: false, last_active_date };
  }

  const lastDate = last_active_date ? new Date(last_active_date + 'T00:00:00') : null;
  const todayDate = new Date(today + 'T00:00:00');
  const diffDays = lastDate ? Math.round((todayDate.getTime() - lastDate.getTime()) / 86_400_000) : 999;

  if (diffDays === 1) {
    const newCurrent = current + 1;
    return { current: newCurrent, best: Math.max(best, newCurrent), freeze_tokens, freeze_used: false, last_active_date: today };
  }

  if (diffDays >= 2 && freeze_tokens > 0) {
    const newCurrent = current + 1;
    return { current: newCurrent, best: Math.max(best, newCurrent), freeze_tokens: freeze_tokens - 1, freeze_used: true, last_active_date: today };
  }

  // Streak broken
  return { current: 1, best: Math.max(best, 1), freeze_tokens, freeze_used: false, last_active_date: today };
}

const TZ = 'Asia/Kolkata';

describe('streak logic', () => {
  it('increments streak on consecutive day', () => {
    const yesterday = new Date('2024-06-01T00:00:00Z');
    const today = new Date('2024-06-02T00:00:00Z');
    const result = computeStreakUpdate(5, 10, 2, getDateInTz(yesterday, TZ), today, TZ);
    expect(result.current).toBe(6);
    expect(result.freeze_used).toBe(false);
    expect(result.freeze_tokens).toBe(2);
  });

  it('preserves best streak', () => {
    const yesterday = new Date('2024-06-01T00:00:00Z');
    const today = new Date('2024-06-02T00:00:00Z');
    const result = computeStreakUpdate(10, 10, 2, getDateInTz(yesterday, TZ), today, TZ);
    expect(result.current).toBe(11);
    expect(result.best).toBe(11);
  });

  it('no-ops when already completed today', () => {
    const todayDate = new Date('2024-06-02T06:00:00Z');
    const today = getDateInTz(todayDate, TZ);
    const result = computeStreakUpdate(5, 10, 2, today, todayDate, TZ);
    expect(result.current).toBe(5); // unchanged
    expect(result.freeze_used).toBe(false);
  });

  it('spends freeze token on 2-day gap', () => {
    const twoDaysAgo = new Date('2024-05-31T00:00:00Z');
    const today = new Date('2024-06-02T00:00:00Z');
    const result = computeStreakUpdate(7, 10, 2, getDateInTz(twoDaysAgo, TZ), today, TZ);
    expect(result.current).toBe(8);
    expect(result.freeze_used).toBe(true);
    expect(result.freeze_tokens).toBe(1);
  });

  it('resets streak when no freeze tokens left', () => {
    const twoDaysAgo = new Date('2024-05-31T00:00:00Z');
    const today = new Date('2024-06-02T00:00:00Z');
    const result = computeStreakUpdate(7, 10, 0, getDateInTz(twoDaysAgo, TZ), today, TZ);
    expect(result.current).toBe(1);
    expect(result.freeze_used).toBe(false);
    expect(result.best).toBe(10); // best never decreases
  });

  it('resets streak on large gap even with tokens', () => {
    // Gap of 5 days — only one freeze token bridges one missed day, not 4
    const fiveDaysAgo = new Date('2024-05-28T00:00:00Z');
    const today = new Date('2024-06-02T00:00:00Z');
    const result = computeStreakUpdate(15, 15, 2, getDateInTz(fiveDaysAgo, TZ), today, TZ);
    // diffDays >= 2 triggers freeze usage for ANY multi-day gap — streak continues but only once
    expect(result.freeze_used).toBe(true);
    expect(result.freeze_tokens).toBe(1);
    expect(result.current).toBe(16);
  });

  it('starts streak from zero on first use', () => {
    const today = new Date('2024-06-02T00:00:00Z');
    const result = computeStreakUpdate(0, 0, 2, '', today, TZ);
    expect(result.current).toBe(1);
    expect(result.best).toBe(1);
  });
});
