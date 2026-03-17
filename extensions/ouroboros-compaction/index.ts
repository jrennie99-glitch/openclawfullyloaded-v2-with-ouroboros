/**
 * Ouroboros Context Compaction Plugin
 *
 * Provides LLM-driven intelligent context compaction that preserves
 * identity, constitution, and critical context while compressing
 * conversation history. Ported from ouroboros/context.py.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import {
  DEFAULT_CONFIG,
  needsCompaction,
  selectForCompaction,
  buildCompactionPrompt,
  buildCompactedMessages,
  formatCompactionStats,
  type CompactionConfig,
  type Message,
} from "./compactor.js";

// Track messages for compaction
let messageBuffer: Message[] = [];
let compactionCount = 0;
let config: CompactionConfig = { ...DEFAULT_CONFIG };

const ouroborosCompactionPlugin = {
  id: "ouroboros-compaction",
  name: "Ouroboros Context Compaction",
  description:
    "LLM-driven intelligent context compaction preserving identity and constitution",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    api.logger.info("ouroboros-compaction: plugin registered");

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool(
      {
        name: "ouroboros_compact_status",
        label: "Compaction Status",
        description:
          "Check current context compaction status: message count, whether compaction is needed, and history.",
        parameters: Type.Object({}),
        async execute() {
          const needed = needsCompaction(messageBuffer.length, config);
          const { toCompact, toPreserve } = selectForCompaction(
            messageBuffer,
            config,
          );

          const text = [
            "## Compaction Status",
            `Messages buffered: ${messageBuffer.length}`,
            `Threshold: ${config.maxMessages}`,
            `Compaction needed: ${needed}`,
            `Would compact: ${toCompact.length} messages`,
            `Would preserve: ${toPreserve.length} messages`,
            `Total compactions so far: ${compactionCount}`,
          ].join("\n");

          return {
            content: [{ type: "text", text }],
            details: {
              messageCount: messageBuffer.length,
              needed,
              compactCount: toCompact.length,
              preserveCount: toPreserve.length,
            },
          };
        },
      },
      { name: "ouroboros_compact_status" },
    );

    api.registerTool(
      {
        name: "ouroboros_compact_now",
        label: "Compact Context Now",
        description:
          "Force context compaction now. Compresses old messages into a summary while preserving recent messages, identity, and constitution.",
        parameters: Type.Object({
          summary: Type.Optional(
            Type.String({
              description:
                "Manual summary to use instead of LLM-generated one. If omitted, generates a basic summary from message content.",
            }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { summary: manualSummary } = params as {
            summary?: string;
          };

          if (messageBuffer.length < config.preserveRecent + 1) {
            return {
              content: [
                {
                  type: "text",
                  text: "Not enough messages to compact.",
                },
              ],
              details: { error: "insufficient_messages" },
            };
          }

          // Use manual summary or generate a basic one
          const summary =
            manualSummary ??
            generateBasicSummary(messageBuffer, config);

          const before = messageBuffer.length;
          messageBuffer = buildCompactedMessages(
            messageBuffer,
            summary,
            config,
          );
          compactionCount++;

          const stats = formatCompactionStats(before, messageBuffer.length);

          return {
            content: [{ type: "text", text: `Compaction complete. ${stats}` }],
            details: {
              before,
              after: messageBuffer.length,
              compactionCount,
            },
          };
        },
      },
      { name: "ouroboros_compact_now" },
    );

    api.registerTool(
      {
        name: "ouroboros_compact_config",
        label: "Configure Compaction",
        description:
          "Update compaction settings: maxMessages threshold, targetMessages, preserveRecent count.",
        parameters: Type.Object({
          maxMessages: Type.Optional(
            Type.Number({
              description: "Max messages before auto-compaction (default: 40)",
            }),
          ),
          targetMessages: Type.Optional(
            Type.Number({
              description: "Target message count after compaction (default: 15)",
            }),
          ),
          preserveRecent: Type.Optional(
            Type.Number({
              description:
                "Recent messages to always preserve (default: 6)",
            }),
          ),
        }),
        async execute(_toolCallId, params) {
          const updates = params as Partial<CompactionConfig>;
          if (updates.maxMessages) config.maxMessages = updates.maxMessages;
          if (updates.targetMessages)
            config.targetMessages = updates.targetMessages;
          if (updates.preserveRecent)
            config.preserveRecent = updates.preserveRecent;

          return {
            content: [
              {
                type: "text",
                text: `Compaction config updated: max=${config.maxMessages}, target=${config.targetMessages}, preserve=${config.preserveRecent}`,
              },
            ],
            details: config,
          };
        },
      },
      { name: "ouroboros_compact_config" },
    );

    api.registerTool(
      {
        name: "ouroboros_compact_prompt",
        label: "Get Compaction Prompt",
        description:
          "Generate the LLM prompt for compacting current context. Use this to feed to an LLM for intelligent summarization, then pass the result to ouroboros_compact_now.",
        parameters: Type.Object({}),
        async execute() {
          const { toCompact } = selectForCompaction(messageBuffer, config);
          const messagesToCompact = toCompact.map((i) => messageBuffer[i]);

          if (messagesToCompact.length === 0) {
            return {
              content: [
                { type: "text", text: "No messages to compact." },
              ],
              details: { error: "no_messages" },
            };
          }

          const prompt = buildCompactionPrompt(messagesToCompact, config);

          return {
            content: [{ type: "text", text: prompt }],
            details: { messageCount: messagesToCompact.length },
          };
        },
      },
      { name: "ouroboros_compact_prompt" },
    );

    // ========================================================================
    // Hooks — track messages for compaction
    // ========================================================================

    api.on("after_tool_call", (_event) => {
      // Track tool calls as messages
      messageBuffer.push({
        role: "tool",
        content: "[tool call]",
        timestamp: Date.now(),
      });
    });

    // ========================================================================
    // Service
    // ========================================================================

    api.registerService({
      id: "ouroboros-compaction",
      start: () => {
        api.logger.info(
          `ouroboros-compaction: initialized (threshold: ${config.maxMessages} messages)`,
        );
      },
      stop: () => {
        api.logger.info(
          `ouroboros-compaction: stopped (${compactionCount} compactions performed)`,
        );
      },
    });
  },
};

/**
 * Generate a basic summary without an LLM call.
 * Extracts key content from messages being compacted.
 */
function generateBasicSummary(
  messages: Message[],
  cfg: CompactionConfig,
): string {
  const { toCompact } = selectForCompaction(messages, cfg);
  const parts: string[] = [];

  for (const idx of toCompact) {
    const msg = messages[idx];
    const snippet = msg.content.slice(0, 200).trim();
    if (snippet) {
      parts.push(`- [${msg.role}]: ${snippet}`);
    }
  }

  return parts.length > 0
    ? `Previous conversation summary:\n${parts.join("\n")}`
    : "No significant content to summarize.";
}

export default ouroborosCompactionPlugin;
