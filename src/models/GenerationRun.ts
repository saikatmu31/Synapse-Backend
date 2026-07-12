import mongoose, { Schema, Model } from 'mongoose';

export interface IGenerationRun {
  started_at: Date;
  finished_at?: Date;
  track_key: string;
  chunks_used: number;
  generated: number;
  rejected_gate1: number;
  rejected_gate2: number;
  rejected_gate3: number;
  published: number;
  disputed_rechecked: number;
  errors: string[];
  status: 'running' | 'done' | 'failed';
  lock_key?: string; // pipeline lock: only one running at a time
}

const generationRunSchema = new Schema<IGenerationRun>({
  started_at: { type: Date, required: true, default: () => new Date() },
  finished_at: { type: Date },
  track_key: { type: String, required: true },
  chunks_used: { type: Number, required: true, default: 0 },
  generated: { type: Number, required: true, default: 0 },
  rejected_gate1: { type: Number, required: true, default: 0 },
  rejected_gate2: { type: Number, required: true, default: 0 },
  rejected_gate3: { type: Number, required: true, default: 0 },
  published: { type: Number, required: true, default: 0 },
  disputed_rechecked: { type: Number, required: true, default: 0 },
  errors: [{ type: String }],
  status: { type: String, enum: ['running', 'done', 'failed'], required: true, default: 'running' },
  lock_key: { type: String },
});

export const GenerationRun: Model<IGenerationRun> = mongoose.model<IGenerationRun>(
  'GenerationRun',
  generationRunSchema,
  'generation_runs',
);
