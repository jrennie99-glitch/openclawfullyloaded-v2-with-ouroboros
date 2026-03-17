/**
 * Ouroboros Budget Tracker
 *
 * Real-time per-round cost accumulation with alert thresholds.
 * Tracks API spending and emits warnings when budget limits approach.
 */

export type BudgetAlert = "ok" | "warning" | "critical" | "emergency";

export type BudgetStatus = {
  totalSpentUsd: number;
  budgetLimitUsd: number;
  remainingUsd: number;
  percentUsed: number;
  alert: BudgetAlert;
  roundCount: number;
};

export class BudgetTracker {
  private totalSpentUsd = 0;
  private roundCount = 0;
  private readonly budgetLimitUsd: number;
  private readonly warningPct: number;
  private readonly criticalPct: number;
  private readonly emergencyPct: number;

  constructor(config: {
    budgetLimitUsd: number;
    warningPct?: number;
    criticalPct?: number;
    emergencyPct?: number;
  }) {
    this.budgetLimitUsd = config.budgetLimitUsd;
    this.warningPct = config.warningPct ?? 70;
    this.criticalPct = config.criticalPct ?? 85;
    this.emergencyPct = config.emergencyPct ?? 95;
  }

  /**
   * Record spending from a tool call or LLM round.
   */
  addCost(costUsd: number): void {
    this.totalSpentUsd += costUsd;
    this.roundCount++;
  }

  /**
   * Get current budget status.
   */
  getStatus(): BudgetStatus {
    const remaining = Math.max(0, this.budgetLimitUsd - this.totalSpentUsd);
    const percentUsed =
      this.budgetLimitUsd > 0
        ? (this.totalSpentUsd / this.budgetLimitUsd) * 100
        : 0;

    let alert: BudgetAlert = "ok";
    if (percentUsed >= this.emergencyPct) {
      alert = "emergency";
    } else if (percentUsed >= this.criticalPct) {
      alert = "critical";
    } else if (percentUsed >= this.warningPct) {
      alert = "warning";
    }

    return {
      totalSpentUsd: this.totalSpentUsd,
      budgetLimitUsd: this.budgetLimitUsd,
      remainingUsd: remaining,
      percentUsed,
      alert,
      roundCount: this.roundCount,
    };
  }

  /**
   * Format budget status as a string for the system prompt.
   */
  formatForPrompt(): string {
    const s = this.getStatus();
    const alertEmoji =
      s.alert === "emergency"
        ? "[EMERGENCY]"
        : s.alert === "critical"
          ? "[CRITICAL]"
          : s.alert === "warning"
            ? "[WARNING]"
            : "";

    return [
      `Budget: $${s.totalSpentUsd.toFixed(4)} / $${s.budgetLimitUsd.toFixed(2)} (${s.percentUsed.toFixed(1)}%) ${alertEmoji}`,
      `Remaining: $${s.remainingUsd.toFixed(2)}`,
      `Rounds: ${s.roundCount}`,
    ].join(" | ");
  }
}
