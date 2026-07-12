import 'dotenv/config';
import { createApp } from './app.js';
import { connectDB, disconnectDB, env } from '../lib/index.js';

async function main(): Promise<void> {
  await connectDB();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`Synapse API listening on port ${env.PORT}`);
  });

  const shutdown = async (): Promise<void> => {
    server.close();
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(console.error);
