// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
export const prompt = 'Build a team-management app. Let users create a team and invite members. Keep permissions on the server and save the team and its owner together.';
export const handoff = `# Goldie handoff — prepared team-management scenario
Revision: 1
Project: Teamspace, a small Next.js team-management application.
This is a synthetic coding replay, not a live coding-agent run or inspected repository.
Prompt: ${prompt}
Architecture: a React create-team form calls a server API, which writes to PostgreSQL.
The browser keeps form state and validates for fast feedback. The API authenticates the user,
checks authorization and validates input again. Credentials never go to the browser.
Create the team and owner membership in one database transaction so a failure cannot leave
an orphaned team. The database schema stores teams and memberships with a unique user/team pair.
Sample files are illustrative, not executed: app/page.tsx, app/api/teams/route.ts, prisma/schema.prisma.
Milestone: sample frontend, API and schema are visible. No real application build or tests are claimed.`;

export const files = {
    'app/page.tsx': `'use client';

import { useState } from 'react';

export default function CreateTeam() {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function createTeam(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Give your team a name.');

    const response = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) setError('Could not create this team.');
  }

  return (
    <form onSubmit={createTeam}>
      <label htmlFor="name">Team name</label>
      <input id="name" value={name}
        onChange={event => setName(event.target.value)} />
      {error && <p role="alert">{error}</p>}
      <button type="submit">Create team</button>
    </form>
  );
}
`,
    'app/api/teams/route.ts': `// Illustrative API: auth and database adapters are project-specific.
import { getUser } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  const user = await getUser();
  if (!user) return new Response('Sign in first', { status: 401 });

  const { name } = await request.json();
  if (typeof name !== 'string' || !name.trim() || name.length > 80) {
    return new Response('Invalid team name', { status: 400 });
  }

  // Either both writes succeed, or neither is saved.
  const team = await db.$transaction(async tx => {
    const created = await tx.team.create({ data: { name: name.trim() } });
    await tx.membership.create({
      data: { teamId: created.id, userId: user.id, role: 'owner' },
    });
    return created;
  });

  return Response.json(team, { status: 201 });
}
`,
    'prisma/schema.prisma': `// Illustrative PostgreSQL schema; not connected to a database.
model Team {
  id          String       @id @default(cuid())
  name        String
  memberships Membership[]
}

model Membership {
  id     String @id @default(cuid())
  teamId String
  userId String
  role   String
  team   Team   @relation(fields: [teamId], references: [id])

  @@unique([teamId, userId])
}
`,
    '.goldie/HANDOFF.md': handoff
};
const steps = [
    { label: 'Your project, ready to build', file: null, terminal: ['Prepared replay · no commands are executed.'] },
    { label: 'Creating the team form', file: 'app/page.tsx', terminal: ['+ app/page.tsx', '  Form state and fast client-side validation'] },
    { label: 'Connecting a server API', file: 'app/api/teams/route.ts', terminal: ['+ app/api/teams/route.ts', '  Authentication, validation and an atomic write'] },
    { label: 'Defining teams and memberships', file: 'prisma/schema.prisma', terminal: ['+ prisma/schema.prisma', '  A team can have many members'] },
    { label: 'Handoff ready. Let’s understand the build.', file: '.goldie/HANDOFF.md', terminal: ['+ .goldie/HANDOFF.md', '✓ Prepared walkthrough complete. Sample code has not been executed.'] }
];
export function replayAt(value) {
    const step = Math.min(4, Math.max(0, Math.floor(Number(value) || 0)));
    return { step, ...steps[step], ready: step === 4, visibleFiles: steps.slice(1, step + 1).map(item => item.file), terminal: steps.slice(0, step + 1).flatMap(item => item.terminal) };
}
