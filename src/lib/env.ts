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
} as const;
