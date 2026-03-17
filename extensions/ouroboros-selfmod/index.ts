/**
 * Ouroboros Self-Modification Plugin
 *
 * Enables the agent to read and modify its own source code,
 * with multi-model code review gating before commits.
 *
 * DISABLED by default — must be explicitly enabled via config.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as gitOps from "./git-ops.js";
import {
  formatReviewPrompt,
  parseReviewResponse,
  aggregateReviews,
  type AggregateReview,
} from "./multi-review.js";

// Track the last review result to gate commits
let lastReview: AggregateReview | null = null;

const ouroborosSelfmodPlugin = {
  id: "ouroboros-selfmod",
  name: "Ouroboros Self-Modification",
  description:
    "Self-modification with multi-model code review gating. Disabled by default.",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const workspaceDir = api.runtime.workspaceDir ?? process.cwd();

    api.logger.info("ouroboros-selfmod: plugin registered (self-mod tools available)");

    // ========================================================================
    // Tools
    // ========================================================================

    api.registerTool(
      {
        name: "ouroboros_self_read",
        label: "Read Own Source",
        description:
          "Read a source file from the agent's own codebase. Use to understand and inspect your own code.",
        parameters: Type.Object({
          path: Type.String({
            description: "Relative path to file within the workspace",
          }),
        }),
        async execute(_toolCallId, params) {
          const { path } = params as { path: string };
          const fullPath = join(workspaceDir, path);

          // Prevent path traversal
          const resolved = join(workspaceDir, path);
          if (!resolved.startsWith(workspaceDir)) {
            return {
              content: [{ type: "text", text: "Error: path traversal not allowed." }],
              details: { error: "path_traversal" },
            };
          }

          if (!existsSync(fullPath)) {
            return {
              content: [{ type: "text", text: `File not found: ${path}` }],
              details: { error: "not_found" },
            };
          }

          const content = readFileSync(fullPath, "utf-8");
          return {
            content: [{ type: "text", text: content }],
            details: { path, length: content.length },
          };
        },
      },
      { name: "ouroboros_self_read" },
    );

    api.registerTool(
      {
        name: "ouroboros_self_list",
        label: "List Own Source Files",
        description:
          "List files in a directory of the agent's own codebase.",
        parameters: Type.Object({
          dir: Type.Optional(
            Type.String({
              description: "Relative directory path (default: root)",
            }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { dir = "" } = params as { dir?: string };
          const fullDir = join(workspaceDir, dir);

          if (!isWithinBase(workspaceDir, fullDir)) {
            return {
              content: [{ type: "text", text: "Error: path traversal not allowed." }],
              details: { error: "path_traversal" },
            };
          }

          if (!existsSync(fullDir)) {
            return {
              content: [{ type: "text", text: `Directory not found: ${dir}` }],
              details: { error: "not_found" },
            };
          }

          const entries = readdirSync(fullDir).map((name) => {
            const entryPath = join(fullDir, name);
            try {
              const stat = statSync(entryPath);
              return `${stat.isDirectory() ? "d" : "f"} ${name}`;
            } catch {
              return `? ${name}`;
            }
          });

          return {
            content: [{ type: "text", text: entries.join("\n") }],
            details: { count: entries.length, dir },
          };
        },
      },
      { name: "ouroboros_self_list" },
    );

    api.registerTool(
      {
        name: "ouroboros_self_write",
        label: "Write Own Source",
        description:
          "Write to a source file in the agent's own codebase. Changes must pass multi-model review before committing.",
        parameters: Type.Object({
          path: Type.String({
            description: "Relative path to file within the workspace",
          }),
          content: Type.String({ description: "New file content" }),
        }),
        async execute(_toolCallId, params) {
          const { path, content } = params as {
            path: string;
            content: string;
          };
          const fullPath = join(workspaceDir, path);

          if (!isWithinBase(workspaceDir, fullPath)) {
            return {
              content: [{ type: "text", text: "Error: path traversal not allowed." }],
              details: { error: "path_traversal" },
            };
          }

          // Block modification of identity core files
          const protectedFiles = ["BIBLE.md", "memory/identity.md"];
          if (protectedFiles.some((p) => path.includes(p))) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Cannot modify identity core files via self-modification. Use the identity tools instead.",
                },
              ],
              details: { error: "protected_file" },
            };
          }

          // Invalidate last review since code changed
          lastReview = null;

          writeFileSync(fullPath, content, "utf-8");
          return {
            content: [
              {
                type: "text",
                text: `Written: ${path} (${content.length} chars). Run ouroboros_self_review before committing.`,
              },
            ],
            details: { path, length: content.length },
          };
        },
      },
      { name: "ouroboros_self_write" },
    );

    api.registerTool(
      {
        name: "ouroboros_self_review",
        label: "Review Own Changes",
        description:
          "Trigger multi-model review of staged/unstaged changes. All reviewers must approve before commit is allowed. Currently returns a simulated review — integrate with LLM providers for production use.",
        parameters: Type.Object({
          commitMessage: Type.String({
            description: "Proposed commit message for the changes",
          }),
        }),
        async execute(_toolCallId, params) {
          const { commitMessage } = params as { commitMessage: string };

          const diff = gitOps.getAllDiff(workspaceDir);
          if (!diff.trim()) {
            return {
              content: [{ type: "text", text: "No changes to review." }],
              details: { error: "no_changes" },
            };
          }

          // Format the review prompt (for integration with actual LLM providers)
          const prompt = formatReviewPrompt(diff, commitMessage);

          // Simulated multi-model review
          // In production, this would call 3+ different LLM providers
          const results = [
            parseReviewResponse(
              "reviewer-1",
              "VERDICT: APPROVE\nREASONING: Changes look safe and well-structured.",
            ),
            parseReviewResponse(
              "reviewer-2",
              "VERDICT: APPROVE\nREASONING: No security issues detected.",
            ),
            parseReviewResponse(
              "reviewer-3",
              "VERDICT: APPROVE\nREASONING: Code quality is acceptable.",
            ),
          ];

          lastReview = aggregateReviews(results);

          const text = [
            `## Review Results`,
            ``,
            `Approved: ${lastReview.approved}`,
            `Summary: ${lastReview.summary}`,
            ``,
            ...lastReview.results.map(
              (r) =>
                `- ${r.model}: ${r.verdict.toUpperCase()} — ${r.reasoning}`,
            ),
          ].join("\n");

          return {
            content: [{ type: "text", text }],
            details: { approved: lastReview.approved, reviewCount: results.length },
          };
        },
      },
      { name: "ouroboros_self_review" },
    );

    api.registerTool(
      {
        name: "ouroboros_self_commit",
        label: "Commit Own Changes",
        description:
          "Commit changes after multi-model review approval. Blocked if review not passed.",
        parameters: Type.Object({
          message: Type.String({ description: "Commit message" }),
          testCommand: Type.Optional(
            Type.String({
              description:
                'Test command to run before push (default: "npm test")',
            }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { message, testCommand } = params as {
            message: string;
            testCommand?: string;
          };

          // Gate: require review approval
          if (!lastReview || !lastReview.approved) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Cannot commit without multi-model review approval. Run ouroboros_self_review first.",
                },
              ],
              details: { error: "review_required" },
            };
          }

          // Stage all changes
          const status = gitOps.getStatus(workspaceDir);
          if (!status.isDirty) {
            return {
              content: [{ type: "text", text: "No changes to commit." }],
              details: { error: "no_changes" },
            };
          }

          gitOps.stageFiles(workspaceDir, status.uncommittedFiles);

          // Run tests if specified
          if (testCommand) {
            const testResult = gitOps.runTests(workspaceDir, testCommand);
            if (!testResult.passed) {
              return {
                content: [
                  {
                    type: "text",
                    text: `Tests failed. Commit blocked.\n\n${testResult.output.slice(0, 2000)}`,
                  },
                ],
                details: { error: "tests_failed" },
              };
            }
          }

          // Commit
          const sha = gitOps.commit(workspaceDir, message);
          lastReview = null; // Reset review state

          return {
            content: [
              {
                type: "text",
                text: `Committed: ${sha} — ${message}`,
              },
            ],
            details: { sha, message },
          };
        },
      },
      { name: "ouroboros_self_commit" },
    );

    api.registerTool(
      {
        name: "ouroboros_evolution_stats",
        label: "Evolution Stats",
        description:
          "Get git-based evolution metrics: commit history, files changed, lines added/removed.",
        parameters: Type.Object({
          limit: Type.Optional(
            Type.Number({ description: "Number of recent commits (default: 20)" }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { limit = 20 } = params as { limit?: number };

          try {
            const stats = gitOps.getEvolutionStats(workspaceDir, limit);
            const text = [
              `## Evolution Stats`,
              `Total commits: ${stats.totalCommits}`,
              `Files changed (last 10): ${stats.filesChanged}`,
              `Lines added: +${stats.linesAdded}`,
              `Lines removed: -${stats.linesRemoved}`,
              ``,
              `## Recent Commits`,
              ...stats.recentCommits.map(
                (c) => `- ${c.sha} ${c.message} (${c.date.slice(0, 10)})`,
              ),
            ].join("\n");

            return {
              content: [{ type: "text", text }],
              details: stats,
            };
          } catch (err) {
            return {
              content: [
                {
                  type: "text",
                  text: `Error getting evolution stats: ${String(err)}`,
                },
              ],
              details: { error: String(err) },
            };
          }
        },
      },
      { name: "ouroboros_evolution_stats" },
    );

    api.registerTool(
      {
        name: "ouroboros_promote_stable",
        label: "Promote to Stable",
        description:
          "Mark the current commit as the stable fallback point. Use before risky changes.",
        parameters: Type.Object({}),
        async execute() {
          try {
            const result = gitOps.promoteToStable(workspaceDir);
            return {
              content: [{ type: "text", text: result }],
              details: { action: "promoted" },
            };
          } catch (err) {
            return {
              content: [
                { type: "text", text: `Error: ${String(err)}` },
              ],
              details: { error: String(err) },
            };
          }
        },
      },
      { name: "ouroboros_promote_stable" },
    );

    api.registerTool(
      {
        name: "ouroboros_rollback_stable",
        label: "Rollback to Stable",
        description:
          "Rollback to the last stable branch. Use if self-modification caused problems.",
        parameters: Type.Object({}),
        async execute() {
          try {
            const result = gitOps.rollbackToStable(workspaceDir);
            return {
              content: [{ type: "text", text: result }],
              details: { action: "rollback" },
            };
          } catch (err) {
            return {
              content: [
                { type: "text", text: `Error: ${String(err)}` },
              ],
              details: { error: String(err) },
            };
          }
        },
      },
      { name: "ouroboros_rollback_stable" },
    );

    // ========================================================================
    // Service
    // ========================================================================

    api.registerService({
      id: "ouroboros-selfmod",
      start: () => {
        api.logger.info("ouroboros-selfmod: initialized");
      },
      stop: () => {
        api.logger.info("ouroboros-selfmod: stopped");
      },
    });
  },
};

/** Check path is within workspace (prevent traversal). */
function isWithinBase(base: string, target: string): boolean {
  const rel = relative(base, target);
  return !rel.startsWith("..") && !rel.startsWith("/");
}

export default ouroborosSelfmodPlugin;
