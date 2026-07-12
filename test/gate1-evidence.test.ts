import { describe, it, expect } from 'vitest';
import { checkEvidence, runGate1 } from '../src/pipeline/gates/gate1-evidence.js';

const CHUNK = `
S3 now delivers strong read-after-write consistency automatically for all objects.
This means that after a successful write of a new object, any subsequent read request
receives the latest version of the object. There is no extra cost for this feature.
Multipart uploads also benefit from strong consistency.
`.trim();

describe('gate1-evidence: checkEvidence', () => {
  it('passes when quote is verbatim substring', () => {
    const quote = 'S3 now delivers strong read-after-write consistency automatically for all objects.';
    expect(checkEvidence(quote, CHUNK)).toBe(true);
  });

  it('passes when whitespace differs (normalized)', () => {
    const quote = 'S3  now  delivers  strong  read-after-write consistency automatically for all objects.';
    expect(checkEvidence(quote, CHUNK)).toBe(true);
  });

  it('passes when case differs', () => {
    const quote = 's3 now delivers strong read-after-write consistency automatically for all objects.';
    expect(checkEvidence(quote, CHUNK)).toBe(true);
  });

  it('fails on hallucinated quote not in chunk', () => {
    const fabricated = 'S3 uses eventual consistency for all read-after-write operations by default.';
    expect(checkEvidence(fabricated, CHUNK)).toBe(false);
  });

  it('fails on paraphrased quote', () => {
    const paraphrased = 'Amazon S3 provides strong consistency for object reads after writes.';
    expect(checkEvidence(paraphrased, CHUNK)).toBe(false);
  });

  it('fails on empty evidence_quote', () => {
    expect(checkEvidence('', CHUNK)).toBe(false);
  });

  it('passes for multi-sentence verbatim quote', () => {
    const multiSentence =
      'There is no extra cost for this feature. Multipart uploads also benefit from strong consistency.';
    expect(checkEvidence(multiSentence, CHUNK)).toBe(true);
  });
});

describe('gate1-evidence: runGate1', () => {
  it('returns passed:true for valid evidence', () => {
    const result = runGate1(
      { evidence_quote: 'S3 now delivers strong read-after-write consistency automatically for all objects.' },
      CHUNK,
    );
    expect(result.passed).toBe(true);
  });

  it('returns passed:false for fabricated evidence', () => {
    const result = runGate1(
      { evidence_quote: 'This is completely fabricated content not in the chunk.' },
      CHUNK,
    );
    expect(result.passed).toBe(false);
  });
});
