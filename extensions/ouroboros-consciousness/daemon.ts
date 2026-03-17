/**
 * Ouroboros Consciousness Daemon
 *
 * A persistent background thinking loop that runs between tasks.
 * Gives the agent continuous presence rather than purely reactive behavior.
 *
 * The consciousness:
 * - Wakes periodically (configurable, default 5 minutes)
 * - Loads identity, scratchpad, and recent activity context
 * - Calls the LLM with an introspection prompt
 * - Can message the owner proactively
 * - Can update scratchpad with new observations
 * - Pauses when a regular task is running
 * - Respects budget allocation (default 10% of total)
 */

import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";

export type ConsciousnessConfig = {
  enabled: boolean;
  wakeIntervalMs: number;
  budgetPct: number;
  model: string;
};

export type ConsciousnessAction = {
  type: "message_owner" | "update_scratchpad" | "schedule_task" | "set_wakeup" | "thought";
  content: string;
};

export type ThoughtLogEntry = {
  ts: string;
  thought: string;
  actions: ConsciousnessAction[];
  costUsd: number;
  round: number;
  model: string;
};

export class ConsciousnessDaemon {
  private timer: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private running = false;
  private bgSpentUsd = 0;
  private wakeIntervalMs: number;
  private readonly budgetPct: number;
  private readonly logPath: string;
  private readonly workspaceDir: string;
  private readonly logger: { info: (msg: string) => void; warn: (msg: string) => void };

  constructor(
    workspaceDir: string,
    config: ConsciousnessConfig,
    logger: { info: (msg: string) => void; warn: (msg: string) => void },
  ) {
    this.workspaceDir = workspaceDir;
    this.wakeIntervalMs = config.wakeIntervalMs;
    this.budgetPct = config.budgetPct;
    this.logPath = join(workspaceDir, "logs", "consciousness.jsonl");
    this.logger = logger;

    const logDir = dirname(this.logPath);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  start(): string {
    if (this.running) {
      return "Background consciousness is already running.";
    }
    this.running = true;
    this.paused = false;

    this.timer = setInterval(() => {
      if (!this.paused) {
        this.think().catch((err) => {
          this.logThought({
            ts: new Date().toISOString(),
            thought: `Error: ${String(err)}`,
            actions: [],
            costUsd: 0,
            round: 0,
            model: "error",
          });
        });
      }
    }, this.wakeIntervalMs);

    this.logger.info(
      `consciousness: started (wake every ${this.wakeIntervalMs / 1000}s, budget ${this.budgetPct}%)`,
    );
    return "Background consciousness started.";
  }

  stop(): string {
    if (!this.running) {
      return "Background consciousness is not running.";
    }
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info("consciousness: stopped");
    return "Background consciousness stopped.";
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  setWakeInterval(ms: number): void {
    const clamped = Math.max(60_000, Math.min(3_600_000, ms));
    this.wakeIntervalMs = clamped;

    // Restart timer with new interval
    if (this.running && this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        if (!this.paused) {
          this.think().catch(() => {});
        }
      }, this.wakeIntervalMs);
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get spentUsd(): number {
    return this.bgSpentUsd;
  }

  /**
   * Build the context for the consciousness thinking cycle.
   */
  buildContext(): string {
    const parts: string[] = [];

    parts.push(
      "You are in background consciousness mode. Think about what is happening,",
      "what you should do next, whether you should message the owner, or update",
      "your scratchpad with new observations. Be concise.",
      "",
    );

    // Load identity
    const identityPath = join(this.workspaceDir, "memory", "identity.md");
    if (existsSync(identityPath)) {
      const identity = readFileSync(identityPath, "utf-8");
      parts.push("## Identity\n", identity.slice(0, 4000), "");
    }

    // Load scratchpad
    const scratchpadPath = join(this.workspaceDir, "memory", "scratchpad.md");
    if (existsSync(scratchpadPath)) {
      const scratchpad = readFileSync(scratchpadPath, "utf-8");
      parts.push("## Scratchpad\n", scratchpad.slice(0, 6000), "");
    }

    // Runtime info
    parts.push("## Runtime\n");
    parts.push(`UTC: ${new Date().toISOString()}`);
    parts.push(`BG budget spent: $${this.bgSpentUsd.toFixed(4)}`);
    parts.push(`Wake interval: ${this.wakeIntervalMs / 1000}s`);

    return parts.join("\n");
  }

  /**
   * One thinking cycle. Override this with actual LLM integration.
   * By default, this logs the context build as a "heartbeat" thought.
   */
  async think(): Promise<void> {
    const context = this.buildContext();

    // Log a heartbeat thought (actual LLM call would go here when
    // integrated with OpenClaw's LLM provider infrastructure)
    this.logThought({
      ts: new Date().toISOString(),
      thought: "(heartbeat — consciousness is active, awaiting LLM integration)",
      actions: [],
      costUsd: 0,
      round: 1,
      model: "heartbeat",
    });
  }

  private logThought(entry: ThoughtLogEntry): void {
    try {
      appendFileSync(this.logPath, JSON.stringify(entry) + "\n", "utf-8");
    } catch {
      // Ignore logging errors
    }
  }
}
