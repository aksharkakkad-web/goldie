# Goldie judge demo

Goldie is a voice coding mentor inside a desktop IDE. Codex builds the project;
Goldie watches its cumulative handoff, offers a conceptual lesson, and uses Gemini
and ElevenLabs to explain it aloud. Ask spoken questions and explicitly return to
the same lesson position. Optional written practice compares your reasoning with
a model answer; it never grades you.

## Three-minute walkthrough

1. In native Codex chat, request a small project feature. Show the real
   `.goldie/HANDOFF.md` update and Goldie's learning offer.
2. Accept the offer and play the lesson briefly.
3. Click the microphone, ask why server validation matters when the form already
   validates, then click **Send question**. Hear the answer. Ask a follow-up if time permits.
4. Click **Return to lesson** once. This explicitly resumes the interrupted clip.
   Show the functioning task form and a task that remains after refresh at
   `http://localhost:3111`.
5. Practice is optional: after a covered section choose **Practice**, type your
   reasoning, then **Show model answer**. It adds no score or audio.

The current tested demo project is `/Users/rishits/Documents/ChatGPT/hacknc/goldie-e2e-demo`.
Its task form/API already exist from the native Codex run; use a fresh starter
for a new create-task coding demonstration rather than pretending to build it again.

## Keep open / recovery

Development processes run in the `goldie` tmux session. Inspect with
`tmux list-windows -t goldie`; attach with `tmux attach -t goldie`, detach with
Ctrl-B then D. Keep backend, demo, watch and judge-ide running.

Use **Show Goldie / Hide Goldie** in the bottom status bar. Details are available
through **Goldie: Setup and lesson details** in the command palette.

For a fresh terminal, use the pinned Node/Yarn PATH in `DEV_SETUP.md`, then:

```sh
cd /Users/rishits/Documents/ChatGPT/hacknc/buildsense
yarn electron start /Users/rishits/Documents/ChatGPT/hacknc/goldie-e2e-demo --electronUserData /tmp/goldie-e2e-user-data
```

If window reload stalls, quit Electron and run that command again. Don't launch
duplicate backends/watchers. Restoration starts no audio or microphone. Provider
failure retains text/progress in details; retry the failed operation. Credentials
remain in ignored `backend/.env`; never display that file while recording.

## Honest demo boundary

Visible orb controls now include Replay section, Skip section, and Finish & practice.
Practice is optional text self-comparison. Return to lesson appears as a named
button while asking questions. Jumping to previous completed sections is not
supported. Captions show one short sentence with approximate timing.
The live recording display shows elapsed time and an input meter. Wait for
Listening before speaking. See `stage4-proof/E2E_REPORT.md` for the actual run,
including the initial recognition failure and subsequent successful human replies.

Use click-to-record/click-to-send; automatic spoken interruption is deferred.
Lessons are conceptual, not source-grounded implementation answers. Actual native
coding, automatic offers, real lesson speech, and task persistence were exercised;
the user also confirmed human voice Q&A works. Final sign-off still requires two
uninterrupted full rehearsals and checking a recording's captured audio. No usable
backup video has been verified. Delivery does not remove these remaining rehearsal and recording checks.

## Shared demo source

The completed native-built task app is saved in `../examples/goldie-team-tasks`.
Its README covers independent installation and launch. The running local demo and
its saved tasks are preserved; neither provider credentials nor session data are
part of the shared source.
