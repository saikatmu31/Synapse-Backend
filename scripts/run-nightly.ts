import 'dotenv/config';
import { connectDB, disconnectDB, sendTelegram } from '../src/lib/index.js';
import { Track } from '../src/models/index.js';
import { GenerationRun } from '../src/models/GenerationRun.js';
import { ingestTrack } from '../src/pipeline/ingest.js';
import { generateForTrack } from '../src/pipeline/generate.js';
import { reVerifyDisputed } from '../src/pipeline/freshness.js';
import { finalizeRun } from '../src/pipeline/publish.js';

const NIGHTLY_BUDGET = 40;
const LOCK_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

async function main(): Promise<void> {
  console.log(`[nightly] starting at ${new Date().toISOString()}`);

  await connectDB();

  // Guard: abort if a run is already in progress within the last 2 hours
  const twoHoursAgo = new Date(Date.now() - LOCK_WINDOW_MS);
  const inflight = await GenerationRun.findOne({
    status: 'running',
    started_at: { $gte: twoHoursAgo },
  });
  if (inflight) {
    console.log('[nightly] Run already in progress, aborting');
    await disconnectDB();
    return;
  }

  // Create the run document and lock
  const run = await GenerationRun.create({
    track_key: 'all',
    status: 'running',
    lock_key: 'nightly',
    started_at: new Date(),
  });
  const run_id = run._id as string;

  try {
    // Load all active tracks
    const tracks = await Track.find({ intensity: { $gt: 0 } }).lean();
    console.log(`[nightly] loaded ${tracks.length} track(s): ${tracks.map((t) => t.key ?? t._id).join(', ')}`);

    // --- Stage 1: Ingest ---
    console.log('[nightly] Stage 1 — Ingest');
    const ingestStats: Record<string, unknown>[] = [];
    for (const track of tracks) {
      const key = (track.key ?? track._id) as string;
      console.log(`[nightly]   ingesting ${key}`);
      const stat = await ingestTrack(key);
      ingestStats.push({ track: key, ...stat });
    }

    // --- Stage 2: Generate ---
    console.log('[nightly] Stage 2 — Generate');
    const totalIntensity = tracks.reduce((sum, t) => sum + ((t.intensity as number) ?? 0), 0);
    const generateStats: Record<string, unknown>[] = [];
    for (const track of tracks) {
      const key = (track.key ?? track._id) as string;
      const intensity = (track.intensity as number) ?? 0;
      const budget = totalIntensity > 0
        ? Math.round((intensity / totalIntensity) * NIGHTLY_BUDGET)
        : 0;
      console.log(`[nightly]   generating for ${key} (budget=${budget})`);
      const stat = await generateForTrack(key, budget, run_id);
      generateStats.push({ track: key, budget, ...stat });
    }

    // --- Stage 3: Re-verify disputed ---
    console.log('[nightly] Stage 3 — Re-verify disputed');
    const freshStats = await reVerifyDisputed();

    // --- Finalize ---
    const combinedStats = { ingest: ingestStats, generate: generateStats, freshness: freshStats };
    await finalizeRun(run_id, combinedStats);

    console.log('[nightly] completed successfully at', new Date().toISOString());
    console.log('[nightly] stats:', JSON.stringify(combinedStats, null, 2));
  } catch (err: unknown) {
    console.error('[nightly] pipeline error:', err);
    await GenerationRun.findByIdAndUpdate(run_id, {
      status: 'failed',
      finished_at: new Date(),
      error: err instanceof Error ? err.message : String(err),
    });
    await disconnectDB();
    throw err;
  }

  await disconnectDB();
}

main().catch((err: unknown) => {
  console.error('[nightly] fatal:', err);
  process.exit(1);
});
