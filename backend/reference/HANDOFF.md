# Prepared web app architecture example

Reference lesson: `webapp-architecture`, revision `1`.

This is an illustrative team-management application, not a claim that Goldie has
generated or inspected an application. It explains frontend, backend/API, and
database as logical responsibilities; Next.js may host frontend and server code
in one project. Follow a create-team request from a browser form through server
validation and permission checks to durable team and membership records.

Opt in through `POST /api/offer` with `referenceLessonId: "webapp-architecture"`,
then accept the returned offer through `POST /api/sessions`. The handoff/profile
fields are accepted for the later provider contract but do not select or adapt
this prepared lesson and are not persisted. No real source paths are asserted.

The lesson fixture is internal prepared content. It is not Gemini-generated or
evidence of live Codex integration. Audio is produced separately by ElevenLabs
only after a session is accepted and its text has been requested.
