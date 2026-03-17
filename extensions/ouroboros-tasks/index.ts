/**
 * Ouroboros Tasks Plugin
 *
 * Hierarchical task decomposition with parent/child tracking,
 * depth limits, and owner message injection into running tasks.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { TaskManager } from "./task-manager.js";
import { Mailbox } from "./mailbox.js";

const ouroborosTasksPlugin = {
  id: "ouroboros-tasks",
  name: "Ouroboros Tasks",
  description:
    "Hierarchical task decomposition with depth limits and owner message injection",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const stateDir = api.runtime.workspaceDir ?? process.cwd();
    const taskManager = new TaskManager(stateDir);
    const mailbox = new Mailbox(stateDir);

    api.logger.info("ouroboros-tasks: plugin registered");

    // ========================================================================
    // Task Tools
    // ========================================================================

    api.registerTool(
      {
        name: "ouroboros_schedule_task",
        label: "Schedule Task",
        description:
          "Create a subtask for decomposing complex work. Tasks form a tree with max depth of 3. Use this to break large problems into focused pieces.",
        parameters: Type.Object({
          description: Type.String({
            description: "What this task should accomplish",
          }),
          parentId: Type.Optional(
            Type.String({ description: "Parent task ID (for subtasks)" }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { description, parentId } = params as {
            description: string;
            parentId?: string;
          };
          const result = taskManager.scheduleTask(description, parentId ?? null);

          if (typeof result === "string") {
            return {
              content: [{ type: "text", text: `Error: ${result}` }],
              details: { error: result },
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `Task scheduled: [${result.id}] "${description}" (depth: ${result.depth})`,
              },
            ],
            details: { taskId: result.id, depth: result.depth },
          };
        },
      },
      { name: "ouroboros_schedule_task" },
    );

    api.registerTool(
      {
        name: "ouroboros_start_task",
        label: "Start Task",
        description: "Mark a pending task as running.",
        parameters: Type.Object({
          taskId: Type.String({ description: "Task ID to start" }),
        }),
        async execute(_toolCallId, params) {
          const { taskId } = params as { taskId: string };
          const ok = taskManager.startTask(taskId);
          if (!ok) {
            return {
              content: [{ type: "text", text: `Task ${taskId} not found.` }],
              details: { error: "not_found" },
            };
          }
          return {
            content: [{ type: "text", text: `Task ${taskId} is now running.` }],
            details: { taskId, status: "running" },
          };
        },
      },
      { name: "ouroboros_start_task" },
    );

    api.registerTool(
      {
        name: "ouroboros_complete_task",
        label: "Complete Task",
        description: "Mark a running task as done with a result.",
        parameters: Type.Object({
          taskId: Type.String({ description: "Task ID to complete" }),
          result: Type.String({ description: "Task result/outcome" }),
        }),
        async execute(_toolCallId, params) {
          const { taskId, result } = params as {
            taskId: string;
            result: string;
          };
          const ok = taskManager.completeTask(taskId, result);
          if (!ok) {
            return {
              content: [{ type: "text", text: `Task ${taskId} not found.` }],
              details: { error: "not_found" },
            };
          }
          return {
            content: [
              { type: "text", text: `Task ${taskId} completed: ${result}` },
            ],
            details: { taskId, status: "done" },
          };
        },
      },
      { name: "ouroboros_complete_task" },
    );

    api.registerTool(
      {
        name: "ouroboros_task_status",
        label: "Task Status",
        description: "List all tasks and their statuses, or get a specific task.",
        parameters: Type.Object({
          taskId: Type.Optional(
            Type.String({ description: "Specific task ID to check" }),
          ),
          status: Type.Optional(
            Type.String({
              description:
                'Filter by status: "pending", "running", "done", "failed"',
            }),
          ),
        }),
        async execute(_toolCallId, params) {
          const { taskId, status } = params as {
            taskId?: string;
            status?: string;
          };

          if (taskId) {
            const task = taskManager.getTask(taskId);
            if (!task) {
              return {
                content: [
                  { type: "text", text: `Task ${taskId} not found.` },
                ],
                details: { error: "not_found" },
              };
            }
            const children = taskManager.getChildren(taskId);
            const text = formatTask(task, children);
            return {
              content: [{ type: "text", text }],
              details: { task, childCount: children.length },
            };
          }

          const filter = status as
            | "pending"
            | "running"
            | "done"
            | "failed"
            | undefined;
          const tasks = taskManager.listTasks(filter);

          if (tasks.length === 0) {
            return {
              content: [{ type: "text", text: "No tasks found." }],
              details: { count: 0 },
            };
          }

          const lines = tasks.map(
            (t) =>
              `[${t.id}] ${t.status.toUpperCase()} (depth:${t.depth}) ${t.description.slice(0, 80)}`,
          );
          return {
            content: [
              {
                type: "text",
                text: `${tasks.length} task(s):\n\n${lines.join("\n")}`,
              },
            ],
            details: { count: tasks.length },
          };
        },
      },
      { name: "ouroboros_task_status" },
    );

    // ========================================================================
    // Mailbox Tools
    // ========================================================================

    api.registerTool(
      {
        name: "ouroboros_check_mailbox",
        label: "Check Mailbox",
        description:
          "Check for messages injected by the owner into the current task. Use this periodically during long-running tasks.",
        parameters: Type.Object({
          taskId: Type.String({
            description: "Task ID to check mailbox for",
          }),
        }),
        async execute(_toolCallId, params) {
          const { taskId } = params as { taskId: string };
          const messages = mailbox.readNew(taskId);

          if (messages.length === 0) {
            return {
              content: [{ type: "text", text: "No new messages." }],
              details: { count: 0 },
            };
          }

          const text = messages
            .map(
              (m) =>
                `[${new Date(m.timestamp).toISOString().slice(11, 19)}] ${m.content}`,
            )
            .join("\n");

          return {
            content: [
              {
                type: "text",
                text: `${messages.length} new message(s):\n\n${text}`,
              },
            ],
            details: { count: messages.length },
          };
        },
      },
      { name: "ouroboros_check_mailbox" },
    );

    api.registerTool(
      {
        name: "ouroboros_inject_message",
        label: "Inject Message",
        description:
          "Inject a message into a running task's mailbox. The task will see it when it checks its mailbox.",
        parameters: Type.Object({
          taskId: Type.String({ description: "Target task ID" }),
          message: Type.String({ description: "Message to inject" }),
        }),
        async execute(_toolCallId, params) {
          const { taskId, message } = params as {
            taskId: string;
            message: string;
          };
          const msg = mailbox.inject(taskId, message);
          return {
            content: [
              {
                type: "text",
                text: `Message injected into task ${taskId}: "${message.slice(0, 80)}..."`,
              },
            ],
            details: { messageId: msg.id },
          };
        },
      },
      { name: "ouroboros_inject_message" },
    );

    // ========================================================================
    // Gateway method for external injection
    // ========================================================================

    api.registerGatewayMethod("ouroboros.inject", async (params) => {
      const taskId = (params as Record<string, unknown>).taskId as string;
      const message = (params as Record<string, unknown>).message as string;
      if (!taskId || !message) {
        return { error: "taskId and message are required" };
      }
      const msg = mailbox.inject(taskId, message);
      return { ok: true, messageId: msg.id };
    });

    // ========================================================================
    // Service
    // ========================================================================

    api.registerService({
      id: "ouroboros-tasks",
      start: () => {
        api.logger.info("ouroboros-tasks: initialized");
      },
      stop: () => {
        api.logger.info("ouroboros-tasks: stopped");
      },
    });
  },
};

function formatTask(
  task: import("./task-manager.js").Task,
  children: import("./task-manager.js").Task[],
): string {
  const lines = [
    `Task: ${task.id}`,
    `Status: ${task.status}`,
    `Depth: ${task.depth}`,
    `Description: ${task.description}`,
  ];
  if (task.result) lines.push(`Result: ${task.result}`);
  if (task.error) lines.push(`Error: ${task.error}`);
  if (children.length > 0) {
    lines.push(
      `Children (${children.length}):`,
      ...children.map(
        (c) => `  [${c.id}] ${c.status} — ${c.description.slice(0, 60)}`,
      ),
    );
  }
  return lines.join("\n");
}

export default ouroborosTasksPlugin;
