import {
  createTask,
  getTasks,
  TaskValidationError,
} from "../../../lib/tasks.js";

export async function GET() {
  return Response.json(await getTasks());
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const task = await createTask(body?.title);
    return Response.json(task, { status: 201 });
  } catch (error) {
    if (error instanceof TaskValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
