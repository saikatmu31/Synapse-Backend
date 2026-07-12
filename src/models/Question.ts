import mongoose, { Schema, Model } from 'mongoose';

export interface IQuestionOption {
  text: string;
  correct?: boolean;         // only the correct option
  explanation?: string;      // only the correct option
  misconception_id?: string; // distractors only
  thought_process?: string;  // distractors only
}

export interface IGateResults {
  evidence: boolean;
  solver: boolean;
  form: boolean;
  solver_confidence: number;
  rejected_gate?: 'gate1' | 'gate2' | 'gate3';
  form_failures?: string[];
}

export interface IQuestion {
  stem: string;
  options: IQuestionOption[]; // exactly 4
  evidence_quote: string;
  chunk_id: mongoose.Types.ObjectId;
  source_url: string;
  track_key: string;
  topic_path: string;
  blueprint_domain?: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  is_boss: boolean;
  status: 'staged' | 'verified' | 'rejected' | 'disputed' | 'retired';
  gate_results: IGateResults;
  created_at: Date;
  verified_at?: Date;
}

const questionOptionSchema = new Schema<IQuestionOption>(
  {
    text: { type: String, required: true },
    correct: { type: Boolean },
    explanation: { type: String },
    misconception_id: { type: String },
    thought_process: { type: String },
  },
  { _id: false },
);

const gateResultsSchema = new Schema<IGateResults>(
  {
    evidence: { type: Boolean, required: true },
    solver: { type: Boolean, required: true },
    form: { type: Boolean, required: true },
    solver_confidence: { type: Number, required: true },
    rejected_gate: { type: String, enum: ['gate1', 'gate2', 'gate3'] },
    form_failures: [{ type: String }],
  },
  { _id: false },
);

const questionSchema = new Schema<IQuestion>({
  stem: { type: String, required: true },
  options: { type: [questionOptionSchema], required: true },
  evidence_quote: { type: String, required: true },
  chunk_id: { type: Schema.Types.ObjectId, required: true },
  source_url: { type: String, required: true },
  track_key: { type: String, required: true },
  topic_path: { type: String, required: true },
  blueprint_domain: { type: String },
  difficulty: { type: Number, enum: [1, 2, 3, 4, 5], required: true },
  is_boss: { type: Boolean, required: true, default: false },
  status: {
    type: String,
    enum: ['staged', 'verified', 'rejected', 'disputed', 'retired'],
    required: true,
  },
  gate_results: { type: gateResultsSchema, required: true },
  created_at: { type: Date, required: true, default: () => new Date() },
  verified_at: { type: Date },
});

questionSchema.index({ status: 1, track_key: 1, topic_path: 1 });
questionSchema.index({ 'options.misconception_id': 1 });

export const Question: Model<IQuestion> = mongoose.model<IQuestion>(
  'Question',
  questionSchema,
  'questions',
);
