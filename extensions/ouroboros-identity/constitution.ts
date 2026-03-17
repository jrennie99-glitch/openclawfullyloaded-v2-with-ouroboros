/**
 * Ouroboros Constitution — Loads and formats BIBLE.md principles.
 *
 * Parses the 9 constitutional principles with priority ordering
 * and provides them as a formatted prompt section for the agent.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type Principle = {
  number: number;
  name: string;
  content: string;
};

/**
 * Parse BIBLE.md into structured principles.
 */
export function parseBible(text: string): Principle[] {
  const principles: Principle[] = [];
  const lines = text.split("\n");

  let current: Principle | null = null;
  const contentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^## Principle (\d+): (.+)$/);
    if (match) {
      if (current) {
        current.content = contentLines.join("\n").trim();
        principles.push(current);
        contentLines.length = 0;
      }
      current = {
        number: parseInt(match[1], 10),
        name: match[2],
        content: "",
      };
    } else if (current) {
      contentLines.push(line);
    }
  }

  if (current) {
    current.content = contentLines.join("\n").trim();
    principles.push(current);
  }

  return principles;
}

/**
 * Load BIBLE.md from a workspace path and return the full text.
 * Returns null if the file doesn't exist.
 */
export function loadConstitution(workspacePath: string): string | null {
  const biblePath = join(workspacePath, "BIBLE.md");
  if (!existsSync(biblePath)) {
    return null;
  }
  return readFileSync(biblePath, "utf-8");
}

/**
 * Format the constitution as a prompt section for the agent.
 */
export function formatConstitutionSection(bibleText: string): string {
  const principles = parseBible(bibleText);
  if (principles.length === 0) {
    return "";
  }

  const header = [
    "## Ouroboros Constitution",
    "",
    "You are governed by the following constitutional principles.",
    "Priority in case of conflict: P0 > P1 > P2 > P3 > P4 > P5 > P6 > P7 > P8",
    "",
  ];

  const principleLines = principles.map(
    (p) => `### P${p.number}: ${p.name}\n${p.content}`,
  );

  return [...header, ...principleLines].join("\n");
}
