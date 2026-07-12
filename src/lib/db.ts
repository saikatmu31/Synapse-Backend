import mongoose from 'mongoose';
import { env } from './env.js';

// Singleton: track whether a connection is already established or in-flight.
let connectionPromise: Promise<typeof mongoose> | null = null;

/**
 * Connect to MongoDB using the URI from env.
 * Safe to call multiple times — reconnects only when not already connected.
 */
export async function connectDB(): Promise<void> {
  // Already fully connected — nothing to do.
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // A connection attempt is already in progress — wait for it.
  if (connectionPromise) {
    await connectionPromise;
    return;
  }

  connectionPromise = mongoose.connect(env.MONGODB_URI);

  try {
    await connectionPromise;
    console.log('MongoDB connected');
  } catch (err) {
    connectionPromise = null;
    throw err;
  }
}

/**
 * Gracefully close the MongoDB connection.
 * Useful for clean shutdown (SIGTERM handlers, test teardown, etc.).
 */
export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }
  await mongoose.disconnect();
  connectionPromise = null;
  console.log('MongoDB disconnected');
}
