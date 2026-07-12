// This file is loaded by vitest before any test files.
// Set required env vars here so that src/lib/env.ts does not throw
// when the app module is imported during tests.
process.env.APP_TOKEN = 'test-token-abc123';
process.env.MONGODB_URI = 'mongodb://placeholder/synapse';
process.env.GEMINI_API_KEY = 'test-gemini-key';
