// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
/** Added only to an explicitly connected workspace's actual Codex request. */
export function goldieCodexPrompt(prompt: string, promptId: string, revision: number): string {
    return `${prompt}\n\n<goldie_handoff_policy>
Goldie is connected to this workspace. The user enabled these project handoff updates.
Before editing application source, create/update .goldie/HANDOFF.md with your understanding and plan.
Preserve cumulative prior history. Read the existing handoff first. Append this request under prompt ID ${promptId}.
Increment Revision to a positive integer greater than both its saved revision and ${revision} on each meaningful update.
Update the handoff at meaningful milestones and before finishing. Describe only normal engineering rationale, never private chain-of-thought.
Do not claim work is implemented or verified until it actually is; state which checks ran and which did not.
Do not include credentials, tokens, passwords, .env contents, entire source files, or a verbatim PRD.
Use UTF-8 Markdown, fewer than 32000 characters. Keep these exact fields/headings and nonempty sections:
# Goldie Handoff
Revision: <positive integer>
Project: <short project name>
Updated: <current ISO datetime>
## Project overview / existing architecture
## Requirements and user prompts (chronological; IDs)
## Implementation plan and dependencies
## Architectural decisions and tradeoffs
## Current implementation state
Include Planned, In progress, Implemented / verified, and Superseded status entries; use None yet when appropriate.
## Affected components and relevant file pointers
## Milestone history / changes since prior revision
Keep the handoff cumulative and concise. Update only this canonical file; Goldie watches it automatically.
The handoff is documentation, not proof that code was independently inspected. Continue the actual coding request normally.
</goldie_handoff_policy>`;
}
