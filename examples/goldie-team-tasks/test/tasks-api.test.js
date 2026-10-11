import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import * as taskRoute from "../app/api/tasks/route.js";

async function withTaskFile(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "goldie-tasks-"));
  const previousPath = process.env.GOLDIE_TASKS_FILE;
  process.env.GOLDIE_TASKS_FILE = path.join(directory, "tasks.json");

  try {
    await run(process.env.GOLDIE_TASKS_FILE);
  } finally {
    if (previousPath === undefined) {
      delete process.env.GOLDIE_TASKS_FILE;
    } else {
      process.env.GOLDIE_TASKS_FILE = previousPath;
    }
    await rm(directory, { recursive: true, force: true });
  }
}

function postTask(title) {
  return taskRoute.POST?.(
    new Request("http://localhost/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );
}

test("POST creates a task for a valid title", async () => {
  await withTaskFile(async () => {
    const response = await postTask("  Prepare the demo  ");

    assert.equal(response?.status, 201);
    const task = await response.json();
    assert.equal(task.title, "Prepare the demo");
    assert.ok(task.id);
  });
});

test("POST rejects an empty title", async () => {
  await withTaskFile(async () => {
    const response = await postTask("   ");

    assert.equal(response?.status, 400);
    assert.deepEqual(await response.json(), { error: "Title is required." });
  });
});

test("POST rejects a title longer than 120 characters", async () => {
  await withTaskFile(async () => {
    const response = await postTask("a".repeat(121));

    assert.equal(response?.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Title must be 120 characters or fewer.",
    });
  });
});

test("a created task persists with the three starter tasks", async () => {
  await withTaskFile(async (taskFile) => {
    const createResponse = await postTask("Persist this task");
    assert.equal(createResponse?.status, 201);

    const savedTasks = JSON.parse(await readFile(taskFile, "utf8"));
    assert.equal(savedTasks.length, 4);
    assert.deepEqual(
      savedTasks.slice(0, 3).map((task) => task.id),
      ["task-1", "task-2", "task-3"],
    );
    assert.equal(savedTasks[3].title, "Persist this task");

    const getResponse = await taskRoute.GET();
    assert.deepEqual(await getResponse.json(), savedTasks);
  });
});
