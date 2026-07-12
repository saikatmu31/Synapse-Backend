import mongoose, { Schema, Model } from 'mongoose';

export interface IMisconception {
  _id: string; // slug id e.g. "s3-strong-consistency-unknown"
  description: string;
  topic_path: string;
  concept_doc_id: mongoose.Types.ObjectId;
  created_at: Date;
}

const misconceptionSchema = new Schema<IMisconception>(
  {
    _id: { type: String, required: true },
    description: { type: String, required: true },
    topic_path: { type: String, required: true },
    concept_doc_id: { type: Schema.Types.ObjectId, required: true },
    created_at: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

export const Misconception: Model<IMisconception> = mongoose.model<IMisconception>(
  'Misconception',
  misconceptionSchema,
  'misconceptions',
);
