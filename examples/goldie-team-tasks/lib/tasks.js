import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const starterTasks = [
  {
    id: "task-1",
    title: "Map the onboarding flow",
    description:
      "Trace how a new teammate moves from opening Goldie to running their first project.",
    status: "In progress",
    assignee: "Maya",
    skill: "Product thinking",
  },
  {
    id: "task-2",
    title: "Explain the test suite",
    description:
      "Write a short guide to what each starter test checks and when the team should run it.",
    status: "Ready",
    assignee: "Noah",
    skill: "Testing",
  },
  {
    id: "task-3",
    title: "Polish the empty state",
    description:
      "Sketch clear copy for the moment when a project has no lessons or tasks yet.",
    status: "Review",
    assignee: "Ava",
    skill: "UX writing",
  },
];

const MAX_TITLE_LENGTH = 120;

export class TaskValidationError extends Error {}

function taskFilePath() {
  return (
    process.env.GOLDIE_TASKS_FILE ?? path.join(process.cwd(), "data", "tasks.json")
  );
}

export function validateTitle(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TaskValidationError("Title is required.");
  }

  const title = value.trim();
  if (title.length > MAX_TITLE_LENGTH) {
    throw new TaskValidationError("Title must be 120 characters or fewer.");
  }

  return title;
}

export async function getTasks() {
  try {
    const tasks = JSON.parse(await readFile(taskFilePath(), "utf8"));
    return Array.isArray(tasks) ? tasks : [...starterTasks];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [...starterTasks];
    }
    throw error;
  }
}

async function saveTasks(tasks) {
  const filePath = taskFilePath();
  await mkdir(path.dirname(filePath), { recursive: true });

  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

export async function createTask(value) {
  const title = validateTitle(value);
  const task = {
    id: `task-${randomUUID()}`,
    title,
    description: "Added by the team from the shared task board.",
    status: "Ready",
    assignee: "Unassigned",
    skill: "Teamwork",
  };

  const tasks = await getTasks();
  await saveTasks([...tasks, task]);
  return task;
}
