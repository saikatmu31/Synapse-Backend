import { GoogleGenAI } from '@google/genai';
import { env } from './env.js';

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

// ---------------------------------------------------------------------------
// Semaphore — limits concurrent Gemini calls to avoid overwhelming the API.
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 10;
let activeCount = 0;
const waitQueue: Array<() => void> = [];

function acquireSemaphore(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(resolve);
  });
}

function releaseSemaphore(): void {
  const next = waitQueue.shift();
  if (next) {
    // Hand the slot directly to the next waiter.
    next();
  } else {
    activeCount--;
  }
}

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

const BASE_DELAY_MS = 2_000;
const MAX_RETRIES = 5;
const MAX_DELAY_MS = 60_000;
const JITTER_FACTOR = 0.2; // ±20%

function computeDelay(attempt: number): number {
  const exponential = BASE_DELAY_MS * Math.pow(2, attempt);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  const jitter = capped * JITTER_FACTOR * (Math.random() * 2 - 1);
  return Math.round(capped + jitter);
}

const RETRY_HINT_BUFFER_MS = 1_000;

/**
 * Extract the server-suggested retry delay from a 429 error, if present.
 * Gemini quota errors include both a human-readable "Please retry in 26.8s"
 * and a RetryInfo detail like {"retryDelay":"26s"}. Returns null if neither
 * is found.
 */
function extractRetryDelayMs(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const msg = err.message ?? '';
  const match = /retry in ([0-9.]+)\s*s/i.exec(msg) ?? /"retryDelay"\s*:\s*"([0-9.]+)s"/.exec(msg);
  if (!match) return null;
  const seconds = parseFloat(match[1]);
  if (isNaN(seconds)) return null;
  return Math.round(seconds * 1000) + RETRY_HINT_BUFFER_MS;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message ?? '';
    // 429 Too Many Requests or 5xx server errors
    if (/429|rate.?limit/i.test(msg)) return true;
    if (/5\d\d|internal.?server|service.?unavailable|bad.?gateway|gateway.?timeout/i.test(msg))
      return true;
    // @google/genai surfaces HTTP status on a `status` property
    const status = (err as unknown as Record<string, unknown>)['status'];
    if (typeof status === 'number') {
      if (status === 429 || status >= 500) return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call Gemini 2.5 Flash and parse a typed JSON response.
 *
 * @param prompt     The user prompt to send.
 * @param schema     A JSON Schema object describing the expected response shape.
 * @param opts       Optional overrides for temperature and max output tokens.
 * @returns          The parsed response cast to T.
 */
export async function geminiJson<T>(
  prompt: string,
  schema: object,
  opts?: { temperature?: number; maxTokens?: number },
): Promise<T> {
  await acquireSemaphore();
  try {
    return await callWithRetry<T>(prompt, schema, opts);
  } finally {
    releaseSemaphore();
  }
}

async function callWithRetry<T>(
  prompt: string,
  schema: object,
  opts?: { temperature?: number; maxTokens?: number },
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          ...(opts?.temperature !== undefined && { temperature: opts.temperature }),
          ...(opts?.maxTokens !== undefined && { maxOutputTokens: opts.maxTokens }),
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error('Gemini returned an empty response');
      }

      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err;

      if (!isRetryableError(err)) {
        // Non-retryable client error (4xx except 429) — fail immediately.
        throw err;
      }

      if (attempt === MAX_RETRIES) {
        break;
      }

      // Honor the server's suggested delay when it exceeds our own backoff —
      // retrying before the quota window reopens is guaranteed to fail.
      const delay = Math.max(computeDelay(attempt), extractRetryDelayMs(err) ?? 0);
      console.warn(
        `[gemini] Retryable error on attempt ${attempt + 1}/${MAX_RETRIES + 1}. ` +
          `Retrying in ${delay}ms. Error: ${err instanceof Error ? err.message : String(err)}`,
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
