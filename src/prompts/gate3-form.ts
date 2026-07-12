export interface FormPromptParams {
  stem: string;
  options: string[]; // texts only
}

export function buildFormPrompt(p: FormPromptParams): string {
  const optionLines = p.options.map((text, i) => `  ${i}. ${text}`).join('\n');

  return `You are a psychometrician reviewing a multiple-choice question for quality.
Evaluate the question below against each criterion and return a boolean for each.

QUESTION:
${p.stem}

OPTIONS:
${optionLines}

Criteria:
1. single_clear_ask — The stem asks exactly one clear, unambiguous question.
2. options_parallel — Options are parallel in grammatical form and length.
3. options_mutually_exclusive — No two options could both be correct simultaneously.
4. no_all_none — No "all of the above" or "none of the above" options.
5. no_answer_leak — The stem does not contain keywords or phrases that give away the correct answer.
6. correct_not_longest — The correct option is not noticeably longer or more hedged than the distractors.
7. distractors_plausible — Each distractor would genuinely tempt a real learner who has a gap in knowledge.

Return true for each criterion the question passes, false if it fails.
Also return a list of the criteria keys that failed (empty if all pass).`;
}

export const formSchema = {
  type: 'object',
  required: [
    'single_clear_ask',
    'options_parallel',
    'options_mutually_exclusive',
    'no_all_none',
    'no_answer_leak',
    'correct_not_longest',
    'distractors_plausible',
    'failed_checks',
  ],
  properties: {
    single_clear_ask: { type: 'boolean' },
    options_parallel: { type: 'boolean' },
    options_mutually_exclusive: { type: 'boolean' },
    no_all_none: { type: 'boolean' },
    no_answer_leak: { type: 'boolean' },
    correct_not_longest: { type: 'boolean' },
    distractors_plausible: { type: 'boolean' },
    failed_checks: { type: 'array', items: { type: 'string' } },
  },
};
