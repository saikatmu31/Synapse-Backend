import { geminiJson } from '../../lib/index.js';
import { buildSolverPrompt, solverSchema } from '../../prompts/index.js';

export interface Gate2Result {
  passed: boolean;
  answer_index: number;
  multiple_defensible: boolean;
  confidence: number;
  reasoning: string;
}

interface SolverResponse {
  answer_index: number;
  multiple_defensible: boolean;
  confidence: number;
  reasoning: string;
}

/**
 * Shuffle an array with Fisher-Yates in-place. Returns the array.
 */
function fisherYates<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function runGate2(
  candidate: {
    stem: string;
    options: Array<{ text: string; correct?: boolean }>;
  },
  chunk_text: string,
  source_url: string,
): Promise<Gate2Result> {
  // Find the correct index in the original options array.
  const correctOriginalIndex = candidate.options.findIndex((o) => o.correct === true);

  // Build a shuffled permutation: shuffledToOriginal[shuffledIdx] = originalIdx
  const indices = candidate.options.map((_, i) => i);
  fisherYates(indices);

  const shuffledOptions = indices.map((originalIdx) => candidate.options[originalIdx].text);

  // Determine what the correct answer's shuffled position is
  const correctShuffledIndex = indices.indexOf(correctOriginalIndex);

  const prompt = buildSolverPrompt({
    stem: candidate.stem,
    shuffled_options: shuffledOptions,
    chunk_text,
    url: source_url,
  });

  const response = await geminiJson<SolverResponse>(prompt, solverSchema, {
    temperature: 0,
  });

  // Un-shuffle: map the returned shuffled index back to the original index
  const returnedOriginalIndex = indices[response.answer_index] ?? -1;

  const passed =
    returnedOriginalIndex === correctOriginalIndex &&
    !response.multiple_defensible &&
    response.confidence >= 0.8;

  return {
    passed,
    answer_index: correctShuffledIndex,
    multiple_defensible: response.multiple_defensible,
    confidence: response.confidence,
    reasoning: response.reasoning,
  };
}
