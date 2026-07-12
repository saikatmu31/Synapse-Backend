import { Schema, Model } from 'mongoose';
import mongoose from 'mongoose';

export interface IStreak {
  current: number;
  best: number;
  freeze_tokens: number;
  last_active_date: string; // ISO date string "YYYY-MM-DD" in user TZ
}

export interface IUserState {
  _id: string; // always "me"
  streak: IStreak;
  xp: number;
  level: number;
  daily_goal: number;
  notification_hour: number;
  timezone: string; // IANA tz, e.g. "Asia/Kolkata"
  insight_cards_unlocked: string[];
  settings: Record<string, unknown>;
}

const streakSchema = new Schema<IStreak>(
  {
    current: { type: Number, required: true, default: 0 },
    best: { type: Number, required: true, default: 0 },
    freeze_tokens: { type: Number, required: true, default: 0 },
    last_active_date: { type: String, default: '' },
  },
  { _id: false },
);

const userStateSchema = new Schema<IUserState>(
  {
    _id: { type: String, required: true },
    streak: { type: streakSchema, required: true },
    xp: { type: Number, required: true, default: 0 },
    level: { type: Number, required: true, default: 1 },
    daily_goal: { type: Number, required: true, default: 10 },
    notification_hour: { type: Number, required: true, default: 9 },
    timezone: { type: String, required: true, default: 'UTC' },
    insight_cards_unlocked: [{ type: String }],
    settings: { type: Schema.Types.Mixed, required: true, default: {} },
  },
  { _id: false },
);

export const UserState: Model<IUserState> = mongoose.model<IUserState>(
  'UserState',
  userStateSchema,
  'user_state',
);
