export interface GenerationPromptParams {
  n: number;
  track_name: string;
  custom_instructions: string;
  existing_misconceptions: string[]; // slugs
  url: string;
  chunk_text: string;
}

export function buildGenerationPrompt(p: GenerationPromptParams): string {
  const misconceptionList =
    p.existing_misconceptions.length > 0
      ? p.existing_misconceptions.join(', ')
      : '(none yet — mint new slugs as needed)';

  return `You are an expert item-writer for professional certification exams, specializing in diagnostic distractors.
Using ONLY the source excerpt below, write ${p.n} multiple-choice questions.

Rules:
1. Every fact needed to answer must be present in or directly inferable from the excerpt. If the excerpt cannot support a good question, return an empty array.
2. Exactly one correct option. For it, write a 1–2 sentence explanation field.
3. Each of the 3 distractors must represent a specific, plausible mistake a real learner makes — not random wrong facts. For each distractor: misconception_id (reuse one of the EXISTING_MISCONCEPTIONS below if it fits, else mint a new kebab-case slug), and thought_process — 1–2 sentences in second person explaining the exact reasoning that leads a learner to pick it ("You picked this because…").
4. evidence_quote: copy VERBATIM the sentence(s) from the excerpt that prove the correct answer. Do not paraphrase.
5. For each NEW misconception (not in EXISTING_MISCONCEPTIONS), include a concept_doc object: { title, body_md } where body_md is a ≤350-word markdown explanation that fixes the misconception, written for a SQL/Python-fluent data engineer, and ends with a "Source →" link line.
6. Difficulty 1–5. Mark is_boss: true only if it requires combining two or more facts from the excerpt.
7. Question style: scenario-based where possible ("A pipeline writes… what happens?"), matching real ${p.track_name} exam register.
${p.custom_instructions ? `8. Additional instructions: ${p.custom_instructions}` : ''}

EXISTING_MISCONCEPTIONS for this topic: ${misconceptionList}

SOURCE EXCERPT (${p.url}):
${p.chunk_text}`;
}

export const generationSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['stem', 'options', 'evidence_quote', 'difficulty', 'is_boss'],
        properties: {
          stem: { type: 'string' },
          options: {
            type: 'array',
            minItems: 4,
            maxItems: 4,
            items: {
              type: 'object',
              required: ['text'],
              properties: {
                text: { type: 'string' },
                correct: { type: 'boolean' },
                explanation: { type: 'string' },
                misconception_id: { type: 'string' },
                thought_process: { type: 'string' },
                concept_doc: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    body_md: { type: 'string' },
                  },
                },
              },
            },
          },
          evidence_quote: { type: 'string' },
          difficulty: { type: 'number', minimum: 1, maximum: 5 },
          is_boss: { type: 'boolean' },
        },
      },
    },
  },
  required: ['questions'],
};
