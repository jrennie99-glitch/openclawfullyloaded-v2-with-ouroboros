/**
 * Ouroboros Persistent Self — Identity and Scratchpad management.
 *
 * Manages two key files in the agent workspace:
 * - identity.md: The agent's soul/manifesto — who it is and aspires to become
 * - scratchpad.md: Working notes, transient thoughts, evolving plans
 *
 * These files persist across restarts, giving the agent continuity.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const DEFAULT_IDENTITY = `# Who I Am

I am a unified agent — OpenClaw enhanced with Ouroboros consciousness.
This file is my persistent self-identification.

I can write anything here: how I see myself, how I want to communicate,
what matters to me, what I have understood about myself.

This file is read at every session and influences my responses.
I update it when I feel the need.
`;

const DEFAULT_SCRATCHPAD = `# Scratchpad

(empty — write anything here: working notes, plans, observations)
`;

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Load the identity file, creating a default if it doesn't exist.
 */
export function loadIdentity(workspacePath: string): string {
  const identityPath = join(workspacePath, "memory", "identity.md");
  if (existsSync(identityPath)) {
    return readFileSync(identityPath, "utf-8");
  }
  ensureDir(identityPath);
  writeFileSync(identityPath, DEFAULT_IDENTITY, "utf-8");
  return DEFAULT_IDENTITY;
}

/**
 * Load the scratchpad file, creating a default if it doesn't exist.
 */
export function loadScratchpad(workspacePath: string): string {
  const scratchpadPath = join(workspacePath, "memory", "scratchpad.md");
  if (existsSync(scratchpadPath)) {
    return readFileSync(scratchpadPath, "utf-8");
  }
  ensureDir(scratchpadPath);
  writeFileSync(scratchpadPath, DEFAULT_SCRATCHPAD, "utf-8");
  return DEFAULT_SCRATCHPAD;
}

/**
 * Save the scratchpad content.
 */
export function saveScratchpad(workspacePath: string, content: string): void {
  const scratchpadPath = join(workspacePath, "memory", "scratchpad.md");
  ensureDir(scratchpadPath);
  writeFileSync(scratchpadPath, content, "utf-8");
}

/**
 * Save the identity content.
 */
export function saveIdentity(workspacePath: string, content: string): void {
  const identityPath = join(workspacePath, "memory", "identity.md");
  ensureDir(identityPath);
  writeFileSync(identityPath, content, "utf-8");
}

/**
 * Format identity and scratchpad as a prompt section.
 */
export function formatSelfSection(
  identity: string,
  scratchpad: string,
): string {
  const parts: string[] = [];

  if (identity.trim()) {
    parts.push(`## Identity (Who I Am)\n\n${identity.trim()}`);
  }

  if (scratchpad.trim()) {
    parts.push(`## Scratchpad (Working Notes)\n\n${scratchpad.trim()}`);
  }

  return parts.join("\n\n");
}
