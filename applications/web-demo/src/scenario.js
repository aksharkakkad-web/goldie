// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
export const prompt = "Add a create-task form to Team Tasks. Validate the title on the server, save tasks locally, and keep the starter board design.";
export const handoff = "# Goldie handoff — Team Tasks demo\nRevision: 3\nProject: Team Tasks, a Next.js task board.\nThis is a prepared replay of a real local Codex build, not a live coding session on this website.\nPrompt: Add a create-task form and POST API; validate titles on the server, limit them to 120 characters, and persist tasks locally while keeping the starter design.\nArchitecture: the server-rendered page reads local JSON tasks; a client form submits to the API and updates the visible list.\nThe POST route trims and validates titles before writing. The store seeds three starter tasks, then writes new tasks to data/tasks.json.\nMilestone: form, API, local persistence, tests, and build were completed in the local demo. Browser submit/reload verification was still pending at the recorded handoff.\nThese file previews are snapshots from that local run. The public site only replays them and never edits a project.\n";
export const files = {
    "app/task-board.js": "\"use client\";\n\nimport { useState } from \"react\";\n\nexport default function TaskBoard({ initialTasks }) {\n  const [tasks, setTasks] = useState(initialTasks);\n  const [title, setTitle] = useState(\"\");\n  const [message, setMessage] = useState(\"\");\n  const [isSubmitting, setIsSubmitting] = useState(false);\n\n  async function handleSubmit(event) {\n    event.preventDefault();\n    setIsSubmitting(true);\n    setMessage(\"\");\n\n    try {\n      const response = await fetch(\"/api/tasks\", {\n        method: \"POST\",\n        headers: { \"content-type\": \"application/json\" },\n        body: JSON.stringify({ title }),\n      });\n      const result = await response.json();\n\n      if (!response.ok) {\n        setMessage(result.error ?? \"Could not add that task.\");\n        return;\n      }\n\n      setTasks((currentTasks) => [...currentTasks, result]);\n      setTitle(\"\");\n      setMessage(`“${result.title}” was added.`);\n    } catch {\n      setMessage(\"Could not reach the task service. Please try again.\");\n    } finally {\n      setIsSubmitting(false);\n    }\n  }\n\n  return (\n    <section className=\"task-section\" aria-labelledby=\"task-list-heading\">\n      <form className=\"task-form\" onSubmit={handleSubmit}>\n        <div className=\"task-form-heading\">\n          <p className=\"eyebrow\">New task</p>\n          <h2>Add to the board</h2>\n        </div>\n\n        <div className=\"task-form-fields\">\n          <label htmlFor=\"task-title\">Task title</label>\n          <div className=\"task-input-row\">\n            <input\n              id=\"task-title\"\n              name=\"title\"\n              type=\"text\"\n              value={title}\n              onChange={(event) => setTitle(event.target.value)}\n              placeholder=\"What needs to happen next?\"\n              maxLength={120}\n              required\n              disabled={isSubmitting}\n            />\n            <button type=\"submit\" disabled={isSubmitting}>\n              {isSubmitting ? \"Adding…\" : \"Add task\"}\n            </button>\n          </div>\n          <div className=\"task-form-meta\">\n            <p aria-live=\"polite\">{message || \"Titles can be up to 120 characters.\"}</p>\n            <span>{title.length}/120</span>\n          </div>\n        </div>\n      </form>\n\n      <div className=\"section-heading\">\n        <h2 id=\"task-list-heading\">Current work</h2>\n        <p>{tasks.length} tasks</p>\n      </div>\n\n      <ul className=\"task-list\">\n        {tasks.map((task, index) => (\n          <li key={task.id}>\n            <article className=\"task-card\">\n              <div className=\"task-number\" aria-hidden=\"true\">\n                {String(index + 1).padStart(2, \"0\")}\n              </div>\n\n              <div className=\"task-body\">\n                <div className=\"task-heading-row\">\n                  <h3>{task.title}</h3>\n                  <span className=\"task-status\">{task.status}</span>\n                </div>\n                <p className=\"task-description\">{task.description}</p>\n\n                <dl className=\"task-meta\">\n                  <div>\n                    <dt>Assignee</dt>\n                    <dd>{task.assignee}</dd>\n                  </div>\n                  <div>\n                    <dt>Skill</dt>\n                    <dd>{task.skill}</dd>\n                  </div>\n                </dl>\n              </div>\n            </article>\n          </li>\n        ))}\n      </ul>\n    </section>\n  );\n}\n",
    "app/api/tasks/route.js": "import { createTask, readTasks } from \"../../../lib/task-store.js\";\n\nexport async function GET() {\n  return Response.json(await readTasks());\n}\n\nexport async function POST(request) {\n  let body;\n\n  try {\n    body = await request.json();\n  } catch {\n    return Response.json({ error: \"Request body must be valid JSON.\" }, { status: 400 });\n  }\n\n  const title = typeof body?.title === \"string\" ? body.title.trim() : \"\";\n\n  if (!title) {\n    return Response.json({ error: \"Title is required.\" }, { status: 400 });\n  }\n\n  if (title.length > 120) {\n    return Response.json(\n      { error: \"Title must be 120 characters or fewer.\" },\n      { status: 400 },\n    );\n  }\n\n  return Response.json(await createTask(title), { status: 201 });\n}\n",
    "lib/task-store.js": "import { randomUUID } from \"node:crypto\";\nimport { mkdir, readFile, writeFile } from \"node:fs/promises\";\nimport path from \"node:path\";\n\nimport { starterTasks } from \"./tasks.js\";\n\nfunction getTasksFilePath() {\n  return (\n    process.env.GOLDIE_TASKS_FILE ??\n    path.join(process.cwd(), \"data\", \"tasks.json\")\n  );\n}\n\nasync function writeTasks(tasks) {\n  const filePath = getTasksFilePath();\n\n  await mkdir(path.dirname(filePath), { recursive: true });\n  await writeFile(filePath, `${JSON.stringify(tasks, null, 2)}\\n`, \"utf8\");\n}\n\nexport async function readTasks() {\n  try {\n    const contents = await readFile(getTasksFilePath(), \"utf8\");\n    return JSON.parse(contents);\n  } catch (error) {\n    if (error.code !== \"ENOENT\") {\n      throw error;\n    }\n\n    await writeTasks(starterTasks);\n    return starterTasks;\n  }\n}\n\nexport async function createTask(title) {\n  const tasks = await readTasks();\n  const task = {\n    id: `task-${randomUUID()}`,\n    title,\n    description: \"Added from the shared Team Tasks workspace.\",\n    status: \"Ready\",\n    assignee: \"Unassigned\",\n    skill: \"To be decided\",\n  };\n\n  await writeTasks([...tasks, task]);\n  return task;\n}\n",
    ".goldie/HANDOFF.md": "# Goldie handoff — Team Tasks demo\nRevision: 3\nProject: Team Tasks, a Next.js task board.\nThis is a prepared replay of a real local Codex build, not a live coding session on this website.\nPrompt: Add a create-task form and POST API; validate titles on the server, limit them to 120 characters, and persist tasks locally while keeping the starter design.\nArchitecture: the server-rendered page reads local JSON tasks; a client form submits to the API and updates the visible list.\nThe POST route trims and validates titles before writing. The store seeds three starter tasks, then writes new tasks to data/tasks.json.\nMilestone: form, API, local persistence, tests, and build were completed in the local demo. Browser submit/reload verification was still pending at the recorded handoff.\nThese file previews are snapshots from that local run. The public site only replays them and never edits a project.\n"
};
const steps = [
    {
        "label": "Team Tasks, ready to build",
        "file": null,
        "terminal": [
            "Prepared replay of a real local build · no commands are executed here."
        ]
    },
    {
        "label": "Adding the create-task form",
        "file": "app/task-board.js",
        "terminal": [
            "+ app/task-board.js",
            "  Client form submits a task and updates the board"
        ]
    },
    {
        "label": "Validating requests in the API",
        "file": "app/api/tasks/route.js",
        "terminal": [
            "+ app/api/tasks/route.js",
            "  Server trims titles and enforces the 120-character limit"
        ]
    },
    {
        "label": "Saving tasks to local JSON",
        "file": "lib/task-store.js",
        "terminal": [
            "+ lib/task-store.js",
            "  Three starter tasks are retained; new tasks are written locally"
        ]
    },
    {
        "label": "Goldie handoff ready",
        "file": ".goldie/HANDOFF.md",
        "terminal": [
            "+ .goldie/HANDOFF.md",
            "✓ Local tests and build passed in the recorded run.",
            "  Website replay only · no live Codex or file writes."
        ]
    }
];
export function replayAt(value) {
    const step = Math.min(steps.length - 1, Math.max(0, Math.floor(Number(value) || 0)));
    return { step, ...steps[step], ready: step === steps.length - 1,
        visibleFiles: steps.slice(1, step + 1).map(item => item.file),
        terminal: steps.slice(0, step + 1).flatMap(item => item.terminal) };
}
