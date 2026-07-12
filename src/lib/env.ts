// Load and validate environment variables at startup.
// Required vars are checked immediately; missing ones throw with a descriptive message.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Please set it in your .env file or environment before starting the server.`,
    );
  }
  return value;
}

export const env = {
  MONGODB_URI: requireEnv('MONGODB_URI'),
  APP_TOKEN: requireEnv('APP_TOKEN'),
  GEMINI_API_KEY: requireEnv('GEMINI_API_KEY'),
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID ?? '',
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  IS_PROD: process.env.NODE_ENV === 'production',
  // Gemini free-tier limits vary per project — check the error payloads or AI
  // Studio's rate-limit view, not the published table. Raise after billing.
  // flash-lite: free tier allows ~1000 req/day vs flash's 20/day on this project.
  GEMINI_MODEL: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite',
  GEMINI_RPM: Number(process.env.GEMINI_RPM ?? 7),
  GEMINI_MAX_CONCURRENT: Number(process.env.GEMINI_MAX_CONCURRENT ?? 2),
  // ~6 Gemini calls per budget unit worst case (see generate.ts); keep
  // budget*6 under the daily request cap with headroom for retries.
  NIGHTLY_BUDGET: Number(process.env.NIGHTLY_BUDGET ?? 15),
} as const;
