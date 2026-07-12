import 'dotenv/config';
// Usage: tsx scripts/bootstrap.ts [--budget=400] [--tracks=dea-c01,spark] [--verbose]
import { connectDB, disconnectDB } from '../src/lib/index.js';
import { runBootstrap } from '../src/pipeline/bootstrap.js';

function parseArgs(): { budget: number; tracks: string[] | undefined; verbose: boolean } {
  let budget = 400;
  let tracks: string[] | undefined;
  let verbose = false;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--budget=')) {
      const parsed = parseInt(arg.slice('--budget='.length), 10);
      if (!isNaN(parsed)) budget = parsed;
    } else if (arg.startsWith('--tracks=')) {
      const raw = arg.slice('--tracks='.length).trim();
      if (raw.length > 0) tracks = raw.split(',').map((t) => t.trim());
    } else if (arg === '--verbose') {
      verbose = true;
    }
  }

  return { budget, tracks, verbose };
}

async function main(): Promise<void> {
  const { budget, tracks, verbose } = parseArgs();

  console.log(`[bootstrap] starting at ${new Date().toISOString()}`);
  if (verbose) {
    console.log(`[bootstrap] options: budget=${budget}, tracks=${tracks?.join(',') ?? 'all'}, verbose=${verbose}`);
  }

  await connectDB();

  try {
    await runBootstrap({ budget, tracks, verbose });
  } finally {
    await disconnectDB();
  }

  console.log(`[bootstrap] finished at ${new Date().toISOString()}`);
}

main().catch((err: unknown) => {
  console.error('[bootstrap] failed:', err);
  process.exit(1);
});
