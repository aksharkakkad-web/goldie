# API validation handoff

Revision: 2
Project: The same team-management application.
Status: Illustrative sample. Implementation remains unverified.

## Prompt history
P001: Plan the team application with a frontend, API and database.
P002: Reject blank team names and names longer than 80 characters on the server.

## Current task and plan
Focus only on API input validation. Treat incoming JSON as untrusted, trim whitespace and check its type and length.
Return a useful 400 error before any database write. Add checks for blank names, numbers and oversized names.
The frontend can duplicate these checks for feedback, but it cannot replace the server boundary.

## Decisions and implementation status
Planned: runtime validation at the API boundary. TypeScript types alone do not validate incoming JSON.
No inspected files or verified changes are claimed. Do not retell the whole application's architecture.

## Milestones
M002: Narrow validation task selected. Implementation and verification pending.
