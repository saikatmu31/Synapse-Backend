import mongoose, { Schema, Model } from 'mongoose';

export interface IConceptDoc {
  title: string;
  body_md: string; // ≤400 words, ends with "Source →" link
  source_url: string;
  chunk_id: mongoose.Types.ObjectId;
  topic_path: string;
}

const conceptDocSchema = new Schema<IConceptDoc>({
  title: { type: String, required: true },
  body_md: { type: String, required: true },
  source_url: { type: String, required: true },
  chunk_id: { type: Schema.Types.ObjectId, required: true },
  topic_path: { type: String, required: true },
});

export const ConceptDoc: Model<IConceptDoc> = mongoose.model<IConceptDoc>(
  'ConceptDoc',
  conceptDocSchema,
  'concept_docs',
);
