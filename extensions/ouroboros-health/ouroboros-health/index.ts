/**
 * Ouroboros Health Plugin
 *
 * Budget tracking, health invariants, and drift detection.
 * Monitors the agent's behavior patterns and resource usage.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { BudgetTracker } from "./budget-tracker.js";
import { detectDrift, formatDriftWarnings } from "./drift-detector.js";

const ouroborosHealthPlugin = {
  id: "ouroboros-health",
  name: "Ouroboros Health",
  description:
    "Budget tracking, health invariants, and behavioral drift detection",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const budget = new BudgetTracker({
      budgetLimitUsd: 100, // Default $100 budget
      warningPct: 70,
      criticalPct: 85,
      emergencyPct: 95,
    });

    // Collect recent assistant messages for drift detection
    const recentMessages: string[] = [];
    const MAX_RECENT = 20;

    api.logger.info("ouroboros-health: plugin registered");

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool(
      {
        name: "ouroboros_budget_status",
        label: "Budget Status",
        description:
          "Check current API spending, budget remaining, and alert level.",
        parameters: Type.Object({}),
        async execute() {
          const status = budget.getStatus();
          const text = [
            `Spent: $${status.totalSpentUsd.toFixed(4)}`,
            `Budget: $${status.budgetLimitUsd.toFixed(2)}`,
            `Remaining: $${status.remainingUsd.toFixed(2)}`,
            `Used: ${status.percentUsed.toFixed(1)}%`,
            `Alert: ${status.alert.toUpperCase()}`,
            `Rounds: ${status.roundCount}`,
          ].join("\n");

          return {
            content: [{ type: "text", text }],
            details: status,
          };
        },
      },
      { name: "ouroboros_budget_status" },
    );

    api.registerTool(
      {
        name: "ouroboros_health_check",
        label: "Health Check",
        description:
          "Run a comprehensive health check: budget status, drift detection, and system invariants.",
        parameters: Type.Object({}),
        async execute() {
          const budgetStatus = budget.getStatus();
          const driftWarnings = detectDrift(recentMessages);

          const parts: string[] = [];

          // Budget
          parts.push("## Budget");
          parts.push(budget.formatForPrompt());

          // Drift detection
          if (driftWarnings.length > 0) {
            parts.push("");
            parts.push(formatDriftWarnings(driftWarnings));
          } else {
            parts.push("\n## Drift Detection\nNo drift patterns detected.");
          }

          // System invariants
          parts.push("\n## System Invariants");
          parts.push(`Recent messages tracked: ${recentMessages.length}`);
          parts.push(
            `Budget alert: ${budgetStatus.alert === "ok" ? "OK" : budgetStatus.alert.toUpperCase()}`,
          );

          return {
            content: [{ type: "text", text: parts.join("\n") }],
            details: {
              budget: budgetStatus,
              driftWarnings: driftWarnings.length,
            },
          };
        },
      },
      { name: "ouroboros_health_check" },
    );

    // ========================================================================
    // Hooks
    // ========================================================================

    // Track costs after each tool call
    api.on("after_tool_call", async (event) => {
      // Estimate cost from duration (rough heuristic when actual cost not available)
      const durationMs = event.durationMs ?? 0;
      if (durationMs > 0) {
        // Rough estimate: $0.001 per second of tool execution
        const estimatedCost = (durationMs / 1000) * 0.001;
        budget.addCost(estimatedCost);
      }
    });

    // Inject budget status into system prompt
    api.on("before_agent_start", async () => {
      const status = budget.getStatus();
      const driftWarnings = detectDrift(recentMessages);

      const parts: string[] = [];

      // Always show budget status
      parts.push("## Budget Status\n" + budget.formatForPrompt());

      // Show drift warnings if any
      const driftSection = formatDriftWarnings(driftWarnings);
      if (driftSection) {
        parts.push("\n" + driftSection);
      }

      // Add budget-specific guidance when alerts are active
      if (status.alert === "emergency") {
        parts.push(
          "\n**EMERGENCY: Budget nearly exhausted. Only perform critical actions.**",
        );
      } else if (status.alert === "critical") {
        parts.push(
          "\n**CRITICAL: Budget running low. Prioritize essential work only.**",
        );
      }

      if (parts.length === 0) {
        return;
      }

      return {
        prependContext: parts.join("\n"),
      };
    });

    // Collect assistant messages for drift detection
    api.on("agent_end", async (event) => {
      if (event.messages) {
        for (const msg of event.messages) {
          if (
            msg &&
            typeof msg === "object" &&
            (msg as Record<string, unknown>).role === "assistant"
          ) {
            const content = (msg as Record<string, unknown>).content;
            if (typeof content === "string" && content.length > 10) {
              recentMessages.push(content);
              while (recentMessages.length > MAX_RECENT) {
                recentMessages.shift();
              }
            }
          }
        }
      }
    });

    // ========================================================================
    // Service
    // ========================================================================

    api.registerService({
      id: "ouroboros-health",
      start: () => {
        api.logger.info("ouroboros-health: initialized");
      },
      stop: () => {
        api.logger.info("ouroboros-health: stopped");
      },
    });
  },
};

export default ouroborosHealthPlugin;
