import mongoose, { Schema, Model } from 'mongoose';

export interface ISourceChunk {
  url: string;
  track_key: string;
  topic_path: string;
  title: string;
  text: string;
  chunk_index: number;
  hash: string; // sha256 of text
  fetched_at: Date;
  status: 'active' | 'stale';
}

const sourceChunkSchema = new Schema<ISourceChunk>({
  url: { type: String, required: true },
  track_key: { type: String, required: true },
  topic_path: { type: String, required: true },
  title: { type: String, required: true },
  text: { type: String, required: true },
  chunk_index: { type: Number, required: true },
  hash: { type: String, required: true },
  fetched_at: { type: Date, required: true },
  status: { type: String, enum: ['active', 'stale'], required: true },
});

sourceChunkSchema.index({ url: 1, chunk_index: 1 }, { unique: true });
sourceChunkSchema.index({ hash: 1 });

export const SourceChunk: Model<ISourceChunk> = mongoose.model<ISourceChunk>(
  'SourceChunk',
  sourceChunkSchema,
  'source_chunks',
);
