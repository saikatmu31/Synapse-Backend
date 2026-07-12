import mongoose, { Schema, Model } from 'mongoose';

export interface ITrack {
  _id: string; // e.g. "dea-c01"
  key: string;
  name: string;
  kind: 'certification' | 'skill';
  blueprint: Array<{ domain: string; weight: number }>; // cert only
  intensity: 0 | 1 | 2 | 3;
  custom_instructions: string;
  sources: string[];
  created_at: Date;
}

const trackSchema = new Schema<ITrack>(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true },
    name: { type: String, required: true },
    kind: { type: String, enum: ['certification', 'skill'], required: true },
    blueprint: [
      {
        domain: { type: String, required: true },
        weight: { type: Number, required: true },
        _id: false,
      },
    ],
    intensity: { type: Number, enum: [0, 1, 2, 3], required: true },
    custom_instructions: { type: String, default: '' },
    sources: [{ type: String }],
    created_at: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

export const Track: Model<ITrack> = mongoose.model<ITrack>('Track', trackSchema, 'tracks');
