/**
 * Ouroboros Task Manager — Hierarchical task decomposition.
 *
 * Manages a tree of parent/child tasks with depth limits.
 * Tasks are persisted as JSON in the agent state directory.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";

export type TaskStatus = "pending" | "running" | "done" | "failed";

export type Task = {
  id: string;
  parentId: string | null;
  description: string;
  status: TaskStatus;
  depth: number;
  result: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
};

export type TaskStore = {
  tasks: Record<string, Task>;
};

const MAX_DEPTH = 3;
const MAX_CONCURRENT = 10;

export class TaskManager {
  private store: TaskStore = { tasks: {} };
  private readonly storePath: string;

  constructor(stateDir: string) {
    this.storePath = join(stateDir, "ouroboros-tasks.json");
    this.load();
  }

  private load(): void {
    if (existsSync(this.storePath)) {
      try {
        this.store = JSON.parse(readFileSync(this.storePath, "utf-8"));
      } catch {
        this.store = { tasks: {} };
      }
    }
  }

  private save(): void {
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), "utf-8");
  }

  /**
   * Schedule a new child task. Returns the task or an error string.
   */
  scheduleTask(
    description: string,
    parentId: string | null = null,
  ): Task | string {
    // Check depth
    let depth = 0;
    if (parentId) {
      const parent = this.store.tasks[parentId];
      if (!parent) {
        return `Parent task ${parentId} not found.`;
      }
      depth = parent.depth + 1;
      if (depth > MAX_DEPTH) {
        return `Maximum task depth (${MAX_DEPTH}) exceeded. Cannot create subtask.`;
      }
    }

    // Check concurrent limit
    const activeTasks = Object.values(this.store.tasks).filter(
      (t) => t.status === "pending" || t.status === "running",
    );
    if (activeTasks.length >= MAX_CONCURRENT) {
      return `Maximum concurrent tasks (${MAX_CONCURRENT}) reached.`;
    }

    const task: Task = {
      id: randomUUID().slice(0, 8),
      parentId,
      description,
      status: "pending",
      depth,
      result: null,
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.store.tasks[task.id] = task;
    this.save();
    return task;
  }

  /**
   * Mark a task as running.
   */
  startTask(taskId: string): boolean {
    const task = this.store.tasks[taskId];
    if (!task) return false;
    task.status = "running";
    task.updatedAt = Date.now();
    this.save();
    return true;
  }

  /**
   * Complete a task with a result.
   */
  completeTask(taskId: string, result: string): boolean {
    const task = this.store.tasks[taskId];
    if (!task) return false;
    task.status = "done";
    task.result = result;
    task.updatedAt = Date.now();
    this.save();
    return true;
  }

  /**
   * Fail a task with an error.
   */
  failTask(taskId: string, error: string): boolean {
    const task = this.store.tasks[taskId];
    if (!task) return false;
    task.status = "failed";
    task.error = error;
    task.updatedAt = Date.now();
    this.save();
    return true;
  }

  /**
   * Get a task by ID.
   */
  getTask(taskId: string): Task | null {
    return this.store.tasks[taskId] ?? null;
  }

  /**
   * Get children of a task.
   */
  getChildren(taskId: string): Task[] {
    return Object.values(this.store.tasks).filter(
      (t) => t.parentId === taskId,
    );
  }

  /**
   * List all tasks, optionally filtered by status.
   */
  listTasks(status?: TaskStatus): Task[] {
    const tasks = Object.values(this.store.tasks);
    if (status) {
      return tasks.filter((t) => t.status === status);
    }
    return tasks;
  }

  /**
   * Check if a task and all its children are complete.
   */
  isTaskTreeComplete(taskId: string): boolean {
    const task = this.store.tasks[taskId];
    if (!task) return false;
    if (task.status !== "done") return false;
    const children = this.getChildren(taskId);
    return children.every((c) => this.isTaskTreeComplete(c.id));
  }
}
