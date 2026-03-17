/**
 * Ouroboros Consciousness Plugin
 *
 * Background thinking daemon that gives the agent proactive presence.
 * Thinks between tasks, can message the owner, and schedules work for itself.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { ConsciousnessDaemon } from "./daemon.js";

const ouroborosConsciousnessPlugin = {
  id: "ouroboros-consciousness",
  name: "Ouroboros Consciousness",
  description:
    "Background thinking daemon — proactive presence between tasks",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const workspaceDir = api.runtime.workspaceDir ?? process.cwd();

    const daemon = new ConsciousnessDaemon(
      workspaceDir,
      {
        enabled: true,
        wakeIntervalMs: 300_000, // 5 minutes
        budgetPct: 10,
        model: "claude-sonnet-4-20250514",
      },
      api.logger,
    );

    api.logger.info("ouroboros-consciousness: plugin registered");

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool(
      {
        name: "ouroboros_consciousness_status",
        label: "Consciousness Status",
        description:
          "Check the background consciousness daemon status.",
        parameters: Type.Object({}),
        async execute() {
          return {
            content: [
              {
                type: "text",
                text: [
                  `Running: ${daemon.isRunning}`,
                  `Paused: ${daemon.isPaused}`,
                  `BG spent: $${daemon.spentUsd.toFixed(4)}`,
                ].join("\n"),
              },
            ],
            details: {
              running: daemon.isRunning,
              paused: daemon.isPaused,
              spentUsd: daemon.spentUsd,
            },
          };
        },
      },
      { name: "ouroboros_consciousness_status" },
    );

    api.registerTool(
      {
        name: "ouroboros_set_wakeup",
        label: "Set Wakeup Interval",
        description:
          "Set how often the background consciousness wakes to think. Range: 60-3600 seconds.",
        parameters: Type.Object({
          seconds: Type.Number({
            description: "Seconds between wakeups (60-3600)",
          }),
        }),
        async execute(_toolCallId, params) {
          const { seconds } = params as { seconds: number };
          daemon.setWakeInterval(seconds * 1000);
          return {
            content: [
              {
                type: "text",
                text: `Wake interval set to ${seconds}s.`,
              },
            ],
            details: { intervalMs: seconds * 1000 },
          };
        },
      },
      { name: "ouroboros_set_wakeup" },
    );

    // ========================================================================
    // Hooks — Pause consciousness during active tasks
    // ========================================================================

    api.on("before_agent_start", async () => {
      daemon.pause();
      return undefined;
    });

    api.on("agent_end", async () => {
      daemon.resume();
    });

    // ========================================================================
    // Service — Start/stop the daemon
    // ========================================================================

    api.registerService({
      id: "ouroboros-consciousness",
      start: () => {
        daemon.start();
      },
      stop: () => {
        daemon.stop();
      },
    });
  },
};

export default ouroborosConsciousnessPlugin;
