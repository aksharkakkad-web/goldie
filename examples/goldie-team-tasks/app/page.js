import { getTasks } from "../lib/tasks.js";
import TaskBoard from "./task-board.js";

export const dynamic = "force-dynamic";

export default async function TeamTasksPage() {
  return <TaskBoard initialTasks={await getTasks()} />;
}
