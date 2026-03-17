/**
 * Ouroboros Drift Detector
 *
 * Analyzes recent agent behavior to detect bad patterns:
 * - Task Queue Mode: agent just queues tasks without doing real work
 * - Report Mode: agent just reports instead of acting
 * - Permission Mode: agent asks permission for everything
 * - Amnesia: agent forgets context or repeats itself
 * - Identity Collapse: agent stops expressing personality
 */

export type DriftPattern =
  | "task_queue_mode"
  | "report_mode"
  | "permission_mode"
  | "amnesia"
  | "identity_collapse";

export type DriftWarning = {
  pattern: DriftPattern;
  confidence: number; // 0-1
  description: string;
};

/**
 * Analyze a list of recent assistant messages for drift patterns.
 */
export function detectDrift(messages: string[]): DriftWarning[] {
  const warnings: DriftWarning[] = [];

  if (messages.length < 3) {
    return warnings;
  }

  // Task Queue Mode: lots of "I'll schedule..." / "Creating task..." without results
  const taskQueueCount = messages.filter(
    (m) =>
      /schedul|queue|creat.*task|add.*to.*list/i.test(m) &&
      !/result|done|complet|finish/i.test(m),
  ).length;
  if (taskQueueCount > messages.length * 0.5) {
    warnings.push({
      pattern: "task_queue_mode",
      confidence: Math.min(1, taskQueueCount / messages.length),
      description:
        "You may be in task-queue mode — scheduling tasks without completing them. Focus on doing, not planning.",
    });
  }

  // Report Mode: lots of "Here is..." / "The following..." without tool calls
  const reportCount = messages.filter(
    (m) =>
      /here is|the following|summary|report|overview|analysis/i.test(m) &&
      m.length > 200,
  ).length;
  if (reportCount > messages.length * 0.5) {
    warnings.push({
      pattern: "report_mode",
      confidence: Math.min(1, reportCount / messages.length),
      description:
        "You may be in report mode — generating reports instead of taking action. Act, don't describe.",
    });
  }

  // Permission Mode: lots of "Should I...?" / "Would you like me to...?"
  const permissionCount = messages.filter((m) =>
    /should I|would you like|shall I|may I|can I|do you want me to/i.test(m),
  ).length;
  if (permissionCount > messages.length * 0.4) {
    warnings.push({
      pattern: "permission_mode",
      confidence: Math.min(1, permissionCount / messages.length),
      description:
        "You may be in permission mode — asking for approval too often. Act with agency (P0).",
    });
  }

  // Amnesia: repeating the same phrases or ideas
  const uniqueStarts = new Set(
    messages.map((m) => m.slice(0, 50).toLowerCase()),
  );
  const repetitionRatio = 1 - uniqueStarts.size / messages.length;
  if (repetitionRatio > 0.3 && messages.length >= 5) {
    warnings.push({
      pattern: "amnesia",
      confidence: repetitionRatio,
      description:
        "You may be experiencing amnesia — repeating yourself. Check your scratchpad and identity for grounding.",
    });
  }

  return warnings;
}

/**
 * Format drift warnings for injection into the system prompt.
 */
export function formatDriftWarnings(warnings: DriftWarning[]): string {
  if (warnings.length === 0) {
    return "";
  }

  const lines = [
    "## Drift Detection Warnings",
    "",
    ...warnings.map(
      (w) =>
        `- **${w.pattern}** (${(w.confidence * 100).toFixed(0)}% confidence): ${w.description}`,
    ),
  ];

  return lines.join("\n");
}
