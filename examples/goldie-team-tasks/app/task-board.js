"use client";

import { useState } from "react";

const MAX_TITLE_LENGTH = 120;

export default function TaskBoard({ initialTasks }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Task could not be added.");
        return;
      }

      setTasks((currentTasks) => [...currentTasks, result]);
      setTitle("");
    } catch {
      setError("Task could not be added. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="tasks-page">
      <header className="page-header">
        <div className="brand-lockup">
          <span className="brand-mark" />
          <span>Goldie</span>
        </div>
        <div className="header-copy">
          <p className="eyebrow">Shared workspace</p>
          <h1>Team Tasks</h1>
          <p className="page-intro">
            A clear view of what our team is building.
          </p>
        </div>
      </header>

      <form className="task-form" onSubmit={handleSubmit}>
        <div className="task-form-heading">
          <p className="eyebrow">New task</p>
          <h2>Add to the plan</h2>
        </div>
        <div className="task-form-fields">
          <label htmlFor="task-title">Task title</label>
          <div className="task-input-row">
            <input
              id="task-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What needs to get done?"
              maxLength={MAX_TITLE_LENGTH}
              aria-describedby="task-title-message task-title-count"
              aria-invalid={Boolean(error)}
              disabled={isSubmitting}
              required
            />
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Adding…" : "Add task"}
            </button>
          </div>
          <div className="task-form-meta">
            <p
              id="task-title-message"
              className={error ? "task-form-error" : undefined}
              role={error ? "alert" : undefined}
            >
              {error || "Give the task a short, clear name."}
            </p>
            <span id="task-title-count">
              {title.length}/{MAX_TITLE_LENGTH}
            </span>
          </div>
        </div>
      </form>

      <section className="task-section">
        <div className="section-heading">
          <h2>Current work</h2>
          <p>{tasks.length} tasks</p>
        </div>
        <ul className="task-list">
          {tasks.map((task, index) => (
            <li key={task.id}>
              <article className="task-card">
                <div className="task-number">{index + 1}</div>
                <div className="task-body">
                  <div className="task-heading-row">
                    <h3>{task.title}</h3>
                    <span className="task-status">{task.status}</span>
                  </div>
                  <p className="task-description">{task.description}</p>
                  <dl className="task-meta">
                    <div>
                      <dt>Assignee</dt>
                      <dd>{task.assignee}</dd>
                    </div>
                    <div>
                      <dt>Skill</dt>
                      <dd>{task.skill}</dd>
                    </div>
                  </dl>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
