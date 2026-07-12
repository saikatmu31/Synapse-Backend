export interface SolverPromptParams {
  stem: string;
  shuffled_options: string[]; // texts only, shuffled order
  chunk_text: string;
  url: string;
}

export function buildSolverPrompt(p: SolverPromptParams): string {
  const optionLines = p.shuffled_options
    .map((text, i) => `  ${i}. ${text}`)
    .join('\n');

  return `You are a rigorous exam solver. Answer the following question using ONLY the provided source excerpt.
Do NOT use outside knowledge.

QUESTION:
${p.stem}

OPTIONS:
${optionLines}

SOURCE EXCERPT (${p.url}):
${p.chunk_text}

Instructions:
- Select the single best answer index (0-based).
- State whether more than one option could be defensible based on the excerpt.
- Give your confidence from 0.0 to 1.0 that exactly one option is clearly correct.
- Provide brief reasoning.`;
}

export const solverSchema = {
  type: 'object',
  required: ['answer_index', 'multiple_defensible', 'confidence', 'reasoning'],
  properties: {
    answer_index: { type: 'number' },
    multiple_defensible: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasoning: { type: 'string' },
  },
};
