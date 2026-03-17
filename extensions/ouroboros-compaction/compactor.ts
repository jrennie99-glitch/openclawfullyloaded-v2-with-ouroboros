/**
 * Ouroboros Context Compaction — LLM-driven intelligent compression.
 *
 * Ported from ouroboros/context.py compact_context().
 * Preserves identity, constitution, and critical context while
 * compressing conversation history to fit within token limits.
 */

export type CompactionConfig = {
  /** Max messages before triggering compaction. Default: 40. */
  maxMessages: number;
  /** Target message count after compaction. Default: 15. */
  targetMessages: number;
  /** Number of recent messages to always preserve. Default: 6. */
  preserveRecent: number;
  /** Sections to never compact (prefixes). */
  protectedPrefixes: string[];
};

export const DEFAULT_CONFIG: CompactionConfig = {
  maxMessages: 40,
  targetMessages: 15,
  preserveRecent: 6,
  protectedPrefixes: [
    "## Constitution",
    "## Identity",
    "## Scratchpad",
    "## Budget",
    "BIBLE",
  ],
};

export type Message = {
  role: string;
  content: string;
  timestamp?: number;
};

/**
 * Check if a message contains protected content that should not be compacted.
 */
function isProtected(msg: Message, config: CompactionConfig): boolean {
  const text = msg.content;
  return config.protectedPrefixes.some((prefix) => text.includes(prefix));
}

/**
 * Build a compaction prompt for the LLM summarizer.
 */
export function buildCompactionPrompt(
  messages: Message[],
  config: CompactionConfig,
): string {
  const toCompact = messages
    .map((m, i) => `[${i}] ${m.role}: ${m.content.slice(0, 500)}`)
    .join("\n\n");

  return [
    "You are a context compaction engine. Summarize the following conversation",
    "into a concise summary that preserves:",
    "1. Key decisions and their reasoning",
    "2. Current task state and progress",
    "3. Important facts, names, and values",
    "4. Any errors encountered and their resolutions",
    "5. User preferences and corrections",
    "",
    "Output a single summary message. Be concise but preserve critical details.",
    "Do NOT include constitutional principles, identity, or budget info — those are preserved separately.",
    "",
    "--- CONVERSATION TO COMPACT ---",
    toCompact,
  ].join("\n");
}

/**
 * Determine which messages should be compacted vs preserved.
 * Returns indices of messages to compact.
 */
export function selectForCompaction(
  messages: Message[],
  config: CompactionConfig,
): { toCompact: number[]; toPreserve: number[] } {
  const toPreserve: number[] = [];
  const toCompact: number[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isRecent = i >= messages.length - config.preserveRecent;

    if (isRecent || isProtected(msg, config)) {
      toPreserve.push(i);
    } else {
      toCompact.push(i);
    }
  }

  return { toCompact, toPreserve };
}

/**
 * Check if compaction is needed based on message count.
 */
export function needsCompaction(
  messageCount: number,
  config: CompactionConfig = DEFAULT_CONFIG,
): boolean {
  return messageCount >= config.maxMessages;
}

/**
 * Build the compacted message list.
 * Replaces compacted messages with a single summary message.
 */
export function buildCompactedMessages(
  messages: Message[],
  summary: string,
  config: CompactionConfig,
): Message[] {
  const { toPreserve } = selectForCompaction(messages, config);

  const result: Message[] = [
    {
      role: "system",
      content: `## Context Summary (compacted)\n\n${summary}`,
      timestamp: Date.now(),
    },
  ];

  for (const idx of toPreserve) {
    result.push(messages[idx]);
  }

  return result;
}

/**
 * Format compaction stats for logging.
 */
export function formatCompactionStats(
  before: number,
  after: number,
): string {
  const reduction = Math.round((1 - after / before) * 100);
  return `Compacted: ${before} → ${after} messages (${reduction}% reduction)`;
}
