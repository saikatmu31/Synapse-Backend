export interface AdhocPromptParams {
  user_prompt: string;
  count: number;
  track_name: string;
  custom_instructions: string;
  existing_misconceptions: string[];
  url: string;
  chunk_text: string;
}

export function buildAdhocPrompt(p: AdhocPromptParams): string {
  const misconceptionList =
    p.existing_misconceptions.length > 0
      ? p.existing_misconceptions.join(', ')
      : '(none yet)';

  return `You are an expert item-writer. The learner requested: "${p.user_prompt}".
Using ONLY the source excerpt below, write ${p.count} multiple-choice questions on that topic.
Apply all standard rules:
1. Every fact needed to answer must come from the excerpt.
2. Exactly one correct option with explanation.
3. Three distractors each with misconception_id and thought_process ("You picked this because…").
4. evidence_quote: verbatim sentence(s) from excerpt proving the correct answer.
5. For NEW misconceptions, include concept_doc: { title, body_md (≤350 words, ends with "Source →") }.
6. Difficulty 1–5. is_boss: true only for multi-fact combination questions.
7. Scenario-based style for ${p.track_name}.
${p.custom_instructions ? `8. ${p.custom_instructions}` : ''}

EXISTING_MISCONCEPTIONS: ${misconceptionList}

SOURCE EXCERPT (${p.url}):
${p.chunk_text}`;
}

export { generationSchema } from './generation.js';
