/**
 * Ouroboros Mailbox — Per-task message injection.
 *
 * Allows the owner to inject messages into running tasks
 * without stopping them. Each task has its own mailbox.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";

export type MailboxMessage = {
  id: string;
  taskId: string;
  content: string;
  timestamp: number;
};

export class Mailbox {
  private readonly mailboxDir: string;
  private readOffsets: Map<string, number> = new Map();

  constructor(stateDir: string) {
    this.mailboxDir = join(stateDir, "ouroboros-mailbox");
    if (!existsSync(this.mailboxDir)) {
      mkdirSync(this.mailboxDir, { recursive: true });
    }
  }

  private mailboxPath(taskId: string): string {
    // Sanitize taskId to prevent path traversal
    const safe = taskId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.mailboxDir, `${safe}.jsonl`);
  }

  /**
   * Inject a message into a task's mailbox.
   */
  inject(taskId: string, content: string): MailboxMessage {
    const msg: MailboxMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      taskId,
      content,
      timestamp: Date.now(),
    };

    const path = this.mailboxPath(taskId);
    ensureDir(path);
    appendFileSync(path, JSON.stringify(msg) + "\n", "utf-8");
    return msg;
  }

  /**
   * Read new messages from a task's mailbox (since last read).
   */
  readNew(taskId: string): MailboxMessage[] {
    const path = this.mailboxPath(taskId);
    if (!existsSync(path)) {
      return [];
    }

    const lines = readFileSync(path, "utf-8").trim().split("\n").filter(Boolean);
    const offset = this.readOffsets.get(taskId) ?? 0;
    const newLines = lines.slice(offset);

    this.readOffsets.set(taskId, lines.length);

    return newLines
      .map((line) => {
        try {
          return JSON.parse(line) as MailboxMessage;
        } catch {
          return null;
        }
      })
      .filter((m): m is MailboxMessage => m !== null);
  }

  /**
   * Read all messages from a task's mailbox.
   */
  readAll(taskId: string): MailboxMessage[] {
    const path = this.mailboxPath(taskId);
    if (!existsSync(path)) {
      return [];
    }

    return readFileSync(path, "utf-8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as MailboxMessage;
        } catch {
          return null;
        }
      })
      .filter((m): m is MailboxMessage => m !== null);
  }
}

function ensureDir(filePath: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
