import mongoose, { Schema, Model } from 'mongoose';

export interface IAttempt {
  idempotency_key: string; // unique — prevent double XP
  question_id: mongoose.Types.ObjectId;
  selected_index: number;
  correct: boolean;
  misconception_id?: string;
  mode: 'daily' | 'drill' | 'topic' | 'exam' | 'adhoc';
  latency_ms: number;
  ts: Date;
  client_ts?: Date;
  synced: boolean;
}

const attemptSchema = new Schema<IAttempt>({
  idempotency_key: { type: String, required: true },
  question_id: { type: Schema.Types.ObjectId, required: true },
  selected_index: { type: Number, required: true },
  correct: { type: Boolean, required: true },
  misconception_id: { type: String },
  mode: {
    type: String,
    enum: ['daily', 'drill', 'topic', 'exam', 'adhoc'],
    required: true,
  },
  latency_ms: { type: Number, required: true },
  ts: { type: Date, required: true, default: () => new Date() },
  client_ts: { type: Date },
  synced: { type: Boolean, required: true, default: false },
});

attemptSchema.index({ ts: 1 });
attemptSchema.index({ idempotency_key: 1 }, { unique: true });

export const Attempt: Model<IAttempt> = mongoose.model<IAttempt>(
  'Attempt',
  attemptSchema,
  'attempts',
);
