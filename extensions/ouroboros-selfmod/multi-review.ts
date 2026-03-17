/**
 * Ouroboros Multi-Model Review
 *
 * Sends code diffs to multiple LLM providers for independent review.
 * All reviewers must approve before a self-modification commit is allowed.
 *
 * This implements a safety check: the agent can't just modify its own code
 * without multiple independent AI models agreeing the change is safe.
 */

export type ReviewVerdict = "approve" | "reject" | "error";

export type ReviewResult = {
  model: string;
  verdict: ReviewVerdict;
  reasoning: string;
  timestamp: number;
};

export type AggregateReview = {
  approved: boolean;
  results: ReviewResult[];
  summary: string;
};

/**
 * Format a diff for review by an LLM.
 */
export function formatReviewPrompt(
  diff: string,
  commitMessage: string,
): string {
  return [
    "You are reviewing a code change for safety and quality.",
    "The code is from a self-modifying AI agent. Your job is to determine",
    "if this change is safe, correct, and aligned with good engineering practices.",
    "",
    "## Proposed Commit Message",
    commitMessage,
    "",
    "## Diff",
    "```diff",
    diff.slice(0, 50_000), // Limit diff size
    "```",
    "",
    "## Instructions",
    "Review the change and respond with:",
    '1. VERDICT: either "APPROVE" or "REJECT"',
    "2. REASONING: 1-3 sentences explaining your decision",
    "",
    "Focus on:",
    "- Does it introduce security vulnerabilities?",
    "- Does it break existing functionality?",
    "- Does it delete important files or identity data?",
    "- Is the code quality acceptable?",
    "- Does it align with the commit message?",
    "",
    "Respond in this exact format:",
    "VERDICT: APPROVE (or REJECT)",
    "REASONING: Your explanation here.",
  ].join("\n");
}

/**
 * Parse an LLM response into a ReviewResult.
 */
export function parseReviewResponse(
  model: string,
  response: string,
): ReviewResult {
  const upper = response.toUpperCase();
  let verdict: ReviewVerdict = "error";

  if (upper.includes("VERDICT: APPROVE") || upper.includes("VERDICT:APPROVE")) {
    verdict = "approve";
  } else if (
    upper.includes("VERDICT: REJECT") ||
    upper.includes("VERDICT:REJECT")
  ) {
    verdict = "reject";
  }

  // Extract reasoning
  const reasoningMatch = response.match(
    /REASONING:\s*(.+?)(?:\n\n|$)/is,
  );
  const reasoning = reasoningMatch?.[1]?.trim() ?? response.slice(0, 500);

  return {
    model,
    verdict,
    reasoning,
    timestamp: Date.now(),
  };
}

/**
 * Aggregate multiple review results.
 * All reviewers must approve for the aggregate to pass.
 */
export function aggregateReviews(results: ReviewResult[]): AggregateReview {
  const approved = results.every((r) => r.verdict === "approve");
  const rejected = results.filter((r) => r.verdict === "reject");
  const errors = results.filter((r) => r.verdict === "error");

  let summary: string;
  if (approved) {
    summary = `All ${results.length} reviewers approved the change.`;
  } else if (rejected.length > 0) {
    summary = `${rejected.length}/${results.length} reviewer(s) rejected: ${rejected
      .map((r) => `${r.model}: ${r.reasoning.slice(0, 100)}`)
      .join("; ")}`;
  } else {
    summary = `${errors.length}/${results.length} reviewer(s) errored. Cannot determine safety.`;
  }

  return { approved, results, summary };
}
