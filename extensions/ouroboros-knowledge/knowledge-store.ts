/**
 * Ouroboros Knowledge Store — Persistent knowledge base with topic indexing.
 *
 * Ported from ouroboros/memory.py knowledge management.
 * Stores learned facts, procedures, and insights that persist
 * across sessions with topic-based organization.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

export type KnowledgeEntry = {
  id: string;
  topic: string;
  content: string;
  source: string;
  confidence: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  accessCount: number;
};

export type KnowledgeIndex = {
  entries: Record<string, KnowledgeEntry>;
  topicIndex: Record<string, string[]>;
  tagIndex: Record<string, string[]>;
};

/**
 * Load or create the knowledge index.
 */
export function loadIndex(storeDir: string): KnowledgeIndex {
  const indexPath = join(storeDir, "index.json");
  if (existsSync(indexPath)) {
    return JSON.parse(readFileSync(indexPath, "utf-8"));
  }
  return { entries: {}, topicIndex: {}, tagIndex: {} };
}

/**
 * Save the knowledge index.
 */
export function saveIndex(storeDir: string, index: KnowledgeIndex): void {
  mkdirSync(storeDir, { recursive: true });
  writeFileSync(
    join(storeDir, "index.json"),
    JSON.stringify(index, null, 2),
    "utf-8",
  );
}

/**
 * Generate a unique ID for a knowledge entry.
 */
function generateId(): string {
  return `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Add a knowledge entry.
 */
export function addEntry(
  index: KnowledgeIndex,
  topic: string,
  content: string,
  source: string,
  tags: string[] = [],
  confidence = 0.8,
): KnowledgeEntry {
  const id = generateId();
  const now = new Date().toISOString();

  const entry: KnowledgeEntry = {
    id,
    topic: topic.toLowerCase(),
    content,
    source,
    confidence,
    tags: tags.map((t) => t.toLowerCase()),
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
  };

  index.entries[id] = entry;

  // Update topic index
  if (!index.topicIndex[entry.topic]) {
    index.topicIndex[entry.topic] = [];
  }
  index.topicIndex[entry.topic].push(id);

  // Update tag index
  for (const tag of entry.tags) {
    if (!index.tagIndex[tag]) {
      index.tagIndex[tag] = [];
    }
    index.tagIndex[tag].push(id);
  }

  return entry;
}

/**
 * Search entries by topic.
 */
export function searchByTopic(
  index: KnowledgeIndex,
  topic: string,
): KnowledgeEntry[] {
  const normalized = topic.toLowerCase();
  const ids = index.topicIndex[normalized] ?? [];
  return ids
    .map((id) => index.entries[id])
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Search entries by tag.
 */
export function searchByTag(
  index: KnowledgeIndex,
  tag: string,
): KnowledgeEntry[] {
  const normalized = tag.toLowerCase();
  const ids = index.tagIndex[normalized] ?? [];
  return ids
    .map((id) => index.entries[id])
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Search entries by keyword in content.
 */
export function searchByKeyword(
  index: KnowledgeIndex,
  keyword: string,
): KnowledgeEntry[] {
  const normalized = keyword.toLowerCase();
  return Object.values(index.entries)
    .filter(
      (e) =>
        e.content.toLowerCase().includes(normalized) ||
        e.topic.includes(normalized) ||
        e.tags.some((t) => t.includes(normalized)),
    )
    .sort((a, b) => b.confidence - a.confidence);
}

/**
 * Delete an entry by ID.
 */
export function deleteEntry(index: KnowledgeIndex, id: string): boolean {
  const entry = index.entries[id];
  if (!entry) return false;

  // Remove from topic index
  const topicIds = index.topicIndex[entry.topic];
  if (topicIds) {
    index.topicIndex[entry.topic] = topicIds.filter((i) => i !== id);
    if (index.topicIndex[entry.topic].length === 0) {
      delete index.topicIndex[entry.topic];
    }
  }

  // Remove from tag index
  for (const tag of entry.tags) {
    const tagIds = index.tagIndex[tag];
    if (tagIds) {
      index.tagIndex[tag] = tagIds.filter((i) => i !== id);
      if (index.tagIndex[tag].length === 0) {
        delete index.tagIndex[tag];
      }
    }
  }

  delete index.entries[id];
  return true;
}

/**
 * Update an existing entry's content or confidence.
 */
export function updateEntry(
  index: KnowledgeIndex,
  id: string,
  updates: { content?: string; confidence?: number; tags?: string[] },
): KnowledgeEntry | null {
  const entry = index.entries[id];
  if (!entry) return null;

  if (updates.content !== undefined) entry.content = updates.content;
  if (updates.confidence !== undefined) entry.confidence = updates.confidence;
  if (updates.tags !== undefined) {
    // Remove old tag index entries
    for (const tag of entry.tags) {
      const tagIds = index.tagIndex[tag];
      if (tagIds) {
        index.tagIndex[tag] = tagIds.filter((i) => i !== id);
        if (index.tagIndex[tag].length === 0) delete index.tagIndex[tag];
      }
    }
    // Add new tag index entries
    entry.tags = updates.tags.map((t) => t.toLowerCase());
    for (const tag of entry.tags) {
      if (!index.tagIndex[tag]) index.tagIndex[tag] = [];
      index.tagIndex[tag].push(id);
    }
  }

  entry.updatedAt = new Date().toISOString();
  return entry;
}

/**
 * Get stats about the knowledge base.
 */
export function getStats(index: KnowledgeIndex): {
  totalEntries: number;
  topicCount: number;
  tagCount: number;
  topTopics: Array<{ topic: string; count: number }>;
} {
  const topTopics = Object.entries(index.topicIndex)
    .map(([topic, ids]) => ({ topic, count: ids.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalEntries: Object.keys(index.entries).length,
    topicCount: Object.keys(index.topicIndex).length,
    tagCount: Object.keys(index.tagIndex).length,
    topTopics,
  };
}

/**
 * Format knowledge entries for prompt injection.
 */
export function formatForPrompt(
  entries: KnowledgeEntry[],
  maxEntries = 5,
): string {
  if (entries.length === 0) return "";

  const formatted = entries.slice(0, maxEntries).map(
    (e) =>
      `- **${e.topic}** (confidence: ${e.confidence}): ${e.content.slice(0, 200)}`,
  );

  return ["## Relevant Knowledge", ...formatted].join("\n");
}
