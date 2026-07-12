import { Schema, Model } from 'mongoose';
import mongoose from 'mongoose';

export interface IFSRS {
  stability: number;
  difficulty: number;
  last_review: Date | null;
  due: Date;
}

export interface IMastery {
  subject_type: 'misconception' | 'topic';
  subject_id: string;
  fsrs: IFSRS;
  strength: number; // 0..1 derived
  consecutive_distinct_correct: number; // 0..3; 3 = squashed
  last_question_ids: string[]; // track distinct questions for squash logic
}

const fsrsSchema = new Schema<IFSRS>(
  {
    stability: { type: Number, required: true },
    difficulty: { type: Number, required: true },
    last_review: { type: Date, default: null },
    due: { type: Date, required: true },
  },
  { _id: false },
);

const masterySchema = new Schema<IMastery>({
  subject_type: { type: String, enum: ['misconception', 'topic'], required: true },
  subject_id: { type: String, required: true },
  fsrs: { type: fsrsSchema, required: true },
  strength: { type: Number, required: true, default: 0 },
  consecutive_distinct_correct: { type: Number, required: true, default: 0 },
  last_question_ids: [{ type: String }],
});

masterySchema.index({ subject_type: 1, 'fsrs.due': 1 });
masterySchema.index({ subject_type: 1, subject_id: 1 }, { unique: true });

export const Mastery: Model<IMastery> = mongoose.model<IMastery>(
  'Mastery',
  masterySchema,
  'mastery',
);
