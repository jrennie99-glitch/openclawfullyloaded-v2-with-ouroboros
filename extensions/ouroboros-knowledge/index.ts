/**
 * Ouroboros Knowledge Base Plugin
 *
 * Persistent knowledge base with topic indexing for the unified agent.
 * Stores learned facts, procedures, and insights across sessions.
 * Ported from ouroboros/memory.py knowledge management.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { join } from "node:path";
import {
  loadIndex,
  saveIndex,
  addEntry,
  searchByTopic,
  searchByTag,
  searchByKeyword,
  deleteEntry,
  updateEntry,
  getStats,
  formatForPrompt,
  type KnowledgeIndex,
} from "./knowledge-store.js";

let knowledgeIndex: KnowledgeIndex | null = null;
let storeDir = "";

const ouroborosKnowledgePlugin = {
  id: "ouroboros-knowledge",
  name: "Ouroboros Knowledge Base",
  description:
    "Persistent knowledge base with topic indexing and semantic retrieval",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const workspaceDir = api.runtime.workspaceDir ?? process.cwd();
    storeDir = join(workspaceDir, "memory", "knowledge");

    api.logger.info("ouroboros-knowledge: plugin registered");

    function ensureIndex(): KnowledgeIndex {
      if (!knowledgeIndex) {
        knowledgeIndex = loadIndex(storeDir);
      }
      return knowledgeIndex;
    }

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool(
      {
        name: "ouroboros_knowledge_add",
        label: "Add Knowledge",
        description:
          "Store a new knowledge entry with topic, content, source, and optional tags. Use this to remember facts, procedures, and insights for future sessions.",
        parameters: Type.Object({
          topic: Type.String({ description: "Topic category (e.g., 'deployment', 'user-preferences', 'architecture')" }),
          content: Type.String({ description: "The knowledge content to store" }),
          source: Type.String({ description: "Where this knowledge came from (e.g., 'user', 'observation', 'documentation')" }),
          tags: Type.Optional(
            Type.Array(Type.String(), { description: "Optional tags for cross-referencing" }),
          ),
          confidence: Type.Optional(
            Type.Number({ description: "Confidence level 0-1 (default: 0.8)" }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { topic, content, source, tags = [], confidence = 0.8 } =
            params as {
              topic: string;
              content: string;
              source: string;
              tags?: string[];
              confidence?: number;
            };

          const index = ensureIndex();
          const entry = addEntry(index, topic, content, source, tags, confidence);
          saveIndex(storeDir, index);

          return {
            content: [
              {
                type: "text",
                text: `Knowledge stored: "${topic}" (id: ${entry.id}, confidence: ${confidence})`,
              },
            ],
            details: { id: entry.id, topic, tags },
          };
        },
      },
      { name: "ouroboros_knowledge_add" },
    );

    api.registerTool(
      {
        name: "ouroboros_knowledge_search",
        label: "Search Knowledge",
        description:
          "Search the knowledge base by topic, tag, or keyword. Returns matching entries sorted by confidence.",
        parameters: Type.Object({
          query: Type.String({ description: "Search query" }),
          searchType: Type.Optional(
            Type.Union([
              Type.Literal("topic"),
              Type.Literal("tag"),
              Type.Literal("keyword"),
            ]),
          ),
          limit: Type.Optional(
            Type.Number({ description: "Max results (default: 10)" }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { query, searchType = "keyword", limit = 10 } = params as {
            query: string;
            searchType?: string;
            limit?: number;
          };

          const index = ensureIndex();
          let results;

          switch (searchType) {
            case "topic":
              results = searchByTopic(index, query);
              break;
            case "tag":
              results = searchByTag(index, query);
              break;
            default:
              results = searchByKeyword(index, query);
          }

          results = results.slice(0, limit);

          if (results.length === 0) {
            return {
              content: [{ type: "text", text: `No knowledge found for: "${query}"` }],
              details: { resultCount: 0 },
            };
          }

          // Mark as accessed
          for (const r of results) {
            r.accessCount++;
          }
          saveIndex(storeDir, index);

          const text = results
            .map(
              (e) =>
                `**[${e.id}]** ${e.topic} (confidence: ${e.confidence})\n  ${e.content.slice(0, 300)}${e.content.length > 300 ? "..." : ""}\n  Tags: ${e.tags.join(", ") || "none"} | Source: ${e.source} | Updated: ${e.updatedAt.slice(0, 10)}`,
            )
            .join("\n\n");

          return {
            content: [{ type: "text", text }],
            details: { resultCount: results.length, searchType },
          };
        },
      },
      { name: "ouroboros_knowledge_search" },
    );

    api.registerTool(
      {
        name: "ouroboros_knowledge_update",
        label: "Update Knowledge",
        description:
          "Update an existing knowledge entry's content, confidence, or tags.",
        parameters: Type.Object({
          id: Type.String({ description: "Knowledge entry ID" }),
          content: Type.Optional(Type.String({ description: "New content" })),
          confidence: Type.Optional(
            Type.Number({ description: "New confidence 0-1" }),
          ),
          tags: Type.Optional(
            Type.Array(Type.String(), { description: "New tags" }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { id, content, confidence, tags } = params as {
            id: string;
            content?: string;
            confidence?: number;
            tags?: string[];
          };

          const index = ensureIndex();
          const updated = updateEntry(index, id, { content, confidence, tags });

          if (!updated) {
            return {
              content: [{ type: "text", text: `Knowledge entry not found: ${id}` }],
              details: { error: "not_found" },
            };
          }

          saveIndex(storeDir, index);

          return {
            content: [
              {
                type: "text",
                text: `Updated knowledge: ${updated.topic} (${id})`,
              },
            ],
            details: { id, topic: updated.topic },
          };
        },
      },
      { name: "ouroboros_knowledge_update" },
    );

    api.registerTool(
      {
        name: "ouroboros_knowledge_delete",
        label: "Delete Knowledge",
        description: "Remove a knowledge entry by ID.",
        parameters: Type.Object({
          id: Type.String({ description: "Knowledge entry ID to delete" }),
        }),
        async execute(_toolCallId, params) {
          const { id } = params as { id: string };
          const index = ensureIndex();
          const deleted = deleteEntry(index, id);

          if (!deleted) {
            return {
              content: [{ type: "text", text: `Knowledge entry not found: ${id}` }],
              details: { error: "not_found" },
            };
          }

          saveIndex(storeDir, index);

          return {
            content: [{ type: "text", text: `Deleted knowledge entry: ${id}` }],
            details: { id },
          };
        },
      },
      { name: "ouroboros_knowledge_delete" },
    );

    api.registerTool(
      {
        name: "ouroboros_knowledge_stats",
        label: "Knowledge Stats",
        description:
          "Get statistics about the knowledge base: entry count, topics, tags.",
        parameters: Type.Object({}),
        async execute() {
          const index = ensureIndex();
          const stats = getStats(index);

          const text = [
            "## Knowledge Base Stats",
            `Total entries: ${stats.totalEntries}`,
            `Topics: ${stats.topicCount}`,
            `Tags: ${stats.tagCount}`,
            "",
            "Top topics:",
            ...stats.topTopics.map(
              (t) => `  - ${t.topic}: ${t.count} entries`,
            ),
          ].join("\n");

          return {
            content: [{ type: "text", text }],
            details: stats,
          };
        },
      },
      { name: "ouroboros_knowledge_stats" },
    );

    // ========================================================================
    // Service
    // ========================================================================

    api.registerService({
      id: "ouroboros-knowledge",
      start: () => {
        knowledgeIndex = loadIndex(storeDir);
        const stats = getStats(knowledgeIndex);
        api.logger.info(
          `ouroboros-knowledge: loaded ${stats.totalEntries} entries across ${stats.topicCount} topics`,
        );
      },
      stop: () => {
        if (knowledgeIndex) {
          saveIndex(storeDir, knowledgeIndex);
        }
        api.logger.info("ouroboros-knowledge: saved and stopped");
      },
    });
  },
};

export default ouroborosKnowledgePlugin;
