import mongoose, { Schema, Model } from 'mongoose';

export interface IDispute {
  question_id: mongoose.Types.ObjectId;
  reason_tag: 'two-defensible' | 'contradicts-source' | 'unclear' | 'other' | 'source-changed';
  note?: string;
  ts: Date;
  resolution: 'pending' | 'fixed' | 'retired';
}

const disputeSchema = new Schema<IDispute>({
  question_id: { type: Schema.Types.ObjectId, required: true },
  reason_tag: {
    type: String,
    enum: ['two-defensible', 'contradicts-source', 'unclear', 'other', 'source-changed'],
    required: true,
  },
  note: { type: String },
  ts: { type: Date, required: true, default: () => new Date() },
  resolution: { type: String, enum: ['pending', 'fixed', 'retired'], required: true, default: 'pending' },
});

export const Dispute: Model<IDispute> = mongoose.model<IDispute>(
  'Dispute',
  disputeSchema,
  'disputes',
);
