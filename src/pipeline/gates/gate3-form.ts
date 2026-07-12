import { geminiJson } from '../../lib/index.js';
import { buildFormPrompt, formSchema } from '../../prompts/index.js';

export interface Gate3Result {
  passed: boolean;
  failed_checks: string[];
}

interface FormResponse {
  single_clear_ask: boolean;
  options_parallel: boolean;
  options_mutually_exclusive: boolean;
  no_all_none: boolean;
  no_answer_leak: boolean;
  correct_not_longest: boolean;
  distractors_plausible: boolean;
  failed_checks: string[];
}

export async function runGate3(candidate: {
  stem: string;
  options: Array<{ text: string }>;
}): Promise<Gate3Result> {
  const prompt = buildFormPrompt({
    stem: candidate.stem,
    options: candidate.options.map((o) => o.text),
  });

  const response = await geminiJson<FormResponse>(prompt, formSchema, {
    temperature: 0,
  });

  return {
    passed: response.failed_checks.length === 0,
    failed_checks: response.failed_checks,
  };
}
