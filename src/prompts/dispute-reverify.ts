export interface DisputeReverifyParams {
  stem: string;
  options: string[];
  chunk_text: string;
  url: string;
  dispute_reason: string;
}

export function buildDisputeSolverPrompt(p: DisputeReverifyParams): string {
  const optionLines = p.options.map((text, i) => `  ${i}. ${text}`).join('\n');

  return `You are a rigorous exam quality reviewer. A learner disputed the following question.
Dispute reason: "${p.dispute_reason}"
Scrutinize the dispute reason specifically in addition to the standard criteria.

QUESTION:
${p.stem}

OPTIONS:
${optionLines}

SOURCE EXCERPT (${p.url}):
${p.chunk_text}

Instructions:
- Select the single best answer index (0-based) using ONLY the excerpt.
- State whether more than one option could be defensible.
- Give confidence 0.0–1.0 that exactly one option is clearly correct.
- Address the dispute reason directly in your reasoning.`;
}
