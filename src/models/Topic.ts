import mongoose, { Schema, Model } from 'mongoose';

export interface ITopic {
  track_key: string;
  parent_id: mongoose.Types.ObjectId | null;
  name: string;
  path: string; // e.g. "aws/s3/consistency"
}

const topicSchema = new Schema<ITopic>({
  track_key: { type: String, required: true },
  parent_id: { type: Schema.Types.ObjectId, default: null },
  name: { type: String, required: true },
  path: { type: String, required: true },
});

export const Topic: Model<ITopic> = mongoose.model<ITopic>('Topic', topicSchema, 'topics');
