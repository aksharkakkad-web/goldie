// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { files, prompt, replayAt } from './scenario.js';
import { HttpApi } from './api.js';
import { DemoController } from './controller.js';
import { BrowserMedia } from './media.js';
import { mountOrb } from './orb.js';
import { escapeHtml as e, icon, highlight, mentorView, nextStep, processingLabel } from './view.js';

const $ = selector => document.querySelector(selector);
function showOpening() {
    const screen = $('#opening-screen');
    try {
        if (sessionStorage.getItem('goldie.web-demo.opened.v1')) { return; }
        sessionStorage.setItem('goldie.web-demo.opened.v1', 'true');
    } catch { /* A blocked store must not block the opening or IDE. */ }
    const workspace = $('.ide'); const skip = $('.skip-link');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    screen.hidden = false; workspace.inert = true; skip.inert = true;
    document.body.classList.add('intro-active');
    // A brief brand introduction, not a model/voice loading indicator.
    setTimeout(() => {
        screen.classList.add('leaving'); document.body.classList.remove('intro-active');
        setTimeout(() => { screen.hidden = true; workspace.inert = false; skip.inert = false; }, reducedMotion ? 0 : 500);
    }, 1500);
}
showOpening();
const media = new BrowserMedia();
const persistence = {
    save(data) { try { sessionStorage.setItem('goldie.web-demo.session.v1', JSON.stringify(data)); } catch { /* A blocked store must not stop learning. */ } },
    load() { try { return JSON.parse(sessionStorage.getItem('goldie.web-demo.session.v1')); } catch { return null; } },
    clear() { try { sessionStorage.removeItem('goldie.web-demo.session.v1'); } catch { /* Optional storage. */ } }
};
const controller = new DemoController(new HttpApi(), media, persistence);
const ui = { step: 0, running: false, currentFile: null, openFiles: [], settings: false };
let timer;
for (const [selector, name] of Object.entries({ '#reset': 'reset', '#explorer-toggle': 'files', '#search-icon': 'search', '#branch-icon': 'branch', '#blocks-icon': 'blocks', '#mentor-focus': 'spark', '#account-icon': 'account', '#settings': 'settings', '#terminal-toggle': 'chevron', '#status-branch': 'branch' })) { $(selector).innerHTML = icon(name); }
$('#ask').innerHTML = icon('mic'); $('#skip').innerHTML = icon('skip');
const disposeOrb = mountOrb($('#orb'), () => media.level);

function selectFile(name) {
    if (!replayAt(ui.step).visibleFiles.includes(name)) { return; }
    ui.currentFile = name;
    if (!ui.openFiles.includes(name)) { ui.openFiles.push(name); }
    renderWorkspace();
}
function renderWorkspace() {
    const replay = replayAt(ui.step);
    const grouped = Object.entries(Object.keys(files).reduce((groups, file) => {
        const directory = file.split('/')[0]; (groups[directory] ??= []).push(file); return groups;
    }, {})).map(([directory, items]) => ({ directory, items }));
    const fileMark = file => file.endsWith('.md') ? 'M↓' : file.endsWith('.js') ? 'JS' : file.endsWith('.tsx') ? '⚛' : file.endsWith('.prisma') ? '◇' : 'TS';
    $('#file-tree').innerHTML = grouped.map(group => `<div class="tree-directory"><span>⌄</span>${e(group.directory)}</div>${group.items.map(file => `<button class="tree-file${file === ui.currentFile ? ' active' : ''}" data-file="${e(file)}"${replay.visibleFiles.includes(file) ? '' : ' disabled'}><span class="file-symbol ${file.endsWith('.md') ? 'markdown-symbol' : ''}">${fileMark(file)}</span><span>${e(file.replace(`${group.directory}/`, ''))}</span>${replay.visibleFiles.includes(file) ? '<span class="file-added">U</span>' : ''}</button>`).join('')}`).join('');
    $('#editor-tabs').innerHTML = `<button role="tab" aria-selected="${ui.currentFile === null}" class="editor-tab${ui.currentFile === null ? ' active' : ''}" data-welcome><img src="/assets/goldie.png" alt="">Welcome</button>${ui.openFiles.map(file => `<button role="tab" aria-selected="${ui.currentFile === file}" class="editor-tab${ui.currentFile === file ? ' active' : ''}" data-file="${e(file)}"><span class="tab-file-symbol">${fileMark(file)}</span>${e(file.split('/').at(-1))}<span class="tab-dot" aria-hidden="true">·</span></button>`).join('')}`;
    $('#breadcrumb').textContent = ui.currentFile ? `team-tasks  ›  ${ui.currentFile.replaceAll('/', '  ›  ')}` : 'Welcome to Goldie';
    if (ui.currentFile) {
        $('#editor').innerHTML = `<div class="code-lines">${files[ui.currentFile].split('\n').map((line, i) => `<div class="code-line"><span class="line-number" aria-hidden="true">${i + 1}</span><code>${highlight(line) || ' '}</code></div>`).join('')}</div><div class="code-disclosure">Prepared source snapshot · read-only · not executed here</div>`;
    } else {
        $('#editor').innerHTML = `<div class="welcome"><img class="welcome-logo" src="/assets/goldie.png" alt="Goldie"><div class="welcome-wordmark">Goldie<span> / Team Tasks</span></div><h1>Build it.<br> Understand it.</h1><p>Replay a real local implementation, then ask Goldie about the engineering choices behind it.</p><div class="prompt-card"><div class="prompt-heading"><span class="prompt-dot"></span>Prepared coding prompt</div><p>${e(prompt)}</p><div class="prompt-footer"><span>Code replay · no live coding agent</span><button class="prompt-run" data-run aria-label="${ui.running ? 'Replay in progress' : 'Begin prepared code replay'}"${ui.running ? ' disabled' : ''}>${icon('arrow')}</button></div></div><div class="welcome-hint">The implementation is on the left. The lesson stays on the right.</div></div>`;
    }
    $('#terminal-output').innerHTML = `<div class="terminal-command"><span class="terminal-user">you@team-tasks</span> <span class="terminal-path">~/workspace</span> <span class="terminal-caret">%</span> <span>goldie prepared-replay</span></div>${replay.terminal.map(line => `<div class="terminal-line${line.startsWith('✓') ? ' terminal-success' : ''}">${e(line)}</div>`).join('')}${ui.running ? '<span class="terminal-cursor" aria-hidden="true">▍</span>' : ''}`;
    $('#replay-label').textContent = replay.label;
    $('#replay-action').textContent = ui.running ? 'Skip replay' : ui.step === 4 ? 'Replay build' : 'Run sample prompt';
    $('#workspace-status').textContent = ui.step === 4 ? 'Prepared handoff ready' : 'Prepared workspace';
    $('#status-file').textContent = ui.currentFile?.endsWith('.md') ? 'Markdown' : 'JavaScript';
    $('#terminal-output').scrollTop = $('#terminal-output').scrollHeight;
}
function setStep(step) {
    ui.step = step;
    const replay = replayAt(step);
    if (replay.file) { selectFile(replay.file); }
    renderWorkspace(); renderMentor(controller.state);
}
function runReplay() {
    if (controller.active || controller.state.busy) { return; }
    if (ui.running) { clearInterval(timer); ui.running = false; setStep(4); return; }
    ui.running = true; ui.step = 0; ui.currentFile = null; ui.openFiles = []; renderWorkspace(); renderMentor(controller.state);
    timer = setInterval(() => {
        const next = ui.step + 1;
        if (next >= 4) { clearInterval(timer); ui.running = false; }
        setStep(next);
    }, 900);
}
function renderMentor(state) {
    const focus = document.activeElement; const draft = focus?.dataset.draft;
    const selection = draft ? [focus.selectionStart, focus.selectionEnd] : null;
    const scroll = $('#mentor-content').scrollTop;
    $('#mentor').dataset.view = state.view;
    $('.orb-stage').classList.toggle('processing', state.busy);
    $('#processing-loader').hidden = !state.busy;
    $('#processing-label').textContent = state.busy ? processingLabel(state.processing) : '';
    $('#mentor-content').setAttribute('aria-busy', String(state.busy));
    $('#mentor-content').innerHTML = mentorView(state, ui.step === 4, controller.phase);
    $('#mentor-content').scrollTop = scroll;
    if (draft) {
        const replacement = [...document.querySelectorAll('[data-draft]')].find(element => element.dataset.draft === draft);
        replacement?.focus({ preventScroll: true }); replacement?.setSelectionRange(...selection);
    }
    $('#orb-status').textContent = state.busy ? '' : state.recording === 'recording' ? 'Listening to you' : state.playing ? 'Goldie is speaking' : state.view === 'question' && state.turns?.length ? 'Ask another or return to the lesson' : state.view === 'recap' ? 'A little wiser. Back to building.' : 'Ready when you are';
    $('#phase-dots').innerHTML = state.session && ['lesson', 'question', 'gate', 'practice'].includes(state.view) ? state.session.phases.map(p => `<span class="phase-dot${p.id === controller.phase?.id ? ' active' : ''}${state.session.completedIds.includes(p.id) ? ' covered' : ''}" title="${e(p.title)}"></span>`).join('') : '';
    $('#knowledge-level').disabled = Boolean(controller.active || state.busy); $('#knowledge-level').value = controller.context.profile.level;
    const recordingReady = ['recording', 'ready'].includes(state.recording);
    $('#ask').disabled = state.busy || !(state.view === 'lesson' && state.explanation
        || state.view === 'question' && (recordingReady || state.recording === 'idle'));
    const askLabel = recordingReady ? 'Stop and send question' : 'Ask Goldie by voice';
    $('#ask').setAttribute('aria-label', askLabel); $('#ask').title = askLabel;
    $('#ask').innerHTML = icon(recordingReady ? 'arrow' : 'mic');
    const captionTrackMatches = state.view === 'lesson' && media.selected === 'lesson'
        || state.view === 'question' && media.selected === 'answer' && state.answer;
    const caption = !state.busy && state.recording === 'idle' && captionTrackMatches ? media.caption : '';
    $('#speech-caption').textContent = caption; $('#speech-caption').hidden = !caption;
    const hasAnswer = Boolean(state.answer && media.tracks.has('answer'));
    const capturingQuestion = state.recording !== 'idle';
    const label = state.view === 'lesson' ? state.playing ? 'Pause audio' : 'Play audio' : state.view === 'question' && hasAnswer ? state.playing ? 'Pause answer audio' : 'Play answer audio' : 'Start learning';
    $('#play').setAttribute('aria-label', label); $('#play').title = label;
    $('#play').innerHTML = icon(state.playing ? 'pause' : 'play');
    $('#play').disabled = state.busy || capturingQuestion || !(['lesson'].includes(state.view) || state.view === 'question' && hasAnswer);
    $('#skip').disabled = state.busy || state.view !== 'lesson';
    $('#reset').disabled = state.busy; $('#replay-action').disabled = Boolean(controller.active || state.busy);
    $('#privacy-note').textContent = state.recording === 'recording' ? 'Microphone on · send or cancel when ready' : 'Prepared code replay · teaching can use the connected backend.';
    const guidance = nextStep(state, ui.step === 4, ui.running);
    $('#next-step-text').textContent = guidance.message;
    for (const element of document.querySelectorAll('.next-action')) {
        element.classList.remove('next-action'); element.removeAttribute('aria-describedby');
    }
    const next = guidance.target ? $(guidance.target) : null;
    if (next && !next.disabled) { next.classList.add('next-action'); next.setAttribute('aria-describedby', 'next-step'); }
}
async function reset() {
    await controller.reset();
    if (controller.active) { return; }
    clearInterval(timer); Object.assign(ui, { step: 0, running: false, currentFile: null, openFiles: [] }); renderWorkspace(); renderMentor(controller.state);
}
const actions = {
    prepare: () => controller.prepare(), accept: () => controller.accept(), decline: () => controller.decline(),
    covered: () => controller.mark('phase_completed'), familiar: () => controller.mark('already_know'),
    continue: () => controller.continuePhase(), practice: () => controller.practice(), review: () => controller.review(),
    recap: () => controller.showRecap(), end: () => controller.end(), reset,
    send: () => controller.questionSend(), cancel: () => controller.questionCancel(), followup: () => controller.questionFollowup(), resume: () => controller.questionResume(),
    retry: () => controller.retry()
};
document.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) { return; }
    if (button.dataset.file) { selectFile(button.dataset.file); }
    else if (button.hasAttribute('data-welcome')) { ui.currentFile = null; renderWorkspace(); }
    else if (button.hasAttribute('data-run')) { runReplay(); }
    else if (button.dataset.reveal) { controller.reveal(button.dataset.reveal); }
    else if (button.dataset.action) { void actions[button.dataset.action]?.(); }
});
$('#mentor-content').addEventListener('input', event => { if (event.target.dataset.draft) { controller.setDraft(event.target.dataset.draft, event.target.value); } });
$('#replay-action').addEventListener('click', runReplay); $('#reset').addEventListener('click', () => void reset());
$('#ask').addEventListener('click', () => void controller.questionStart());
$('#play').addEventListener('click', () => {
    if (controller.state.view === 'question') { void controller.run(async () => { if (media.playing) { media.pause(); } else { await controller.startPlayback(); } }); }
    else { void controller.playPause(); }
});
$('#skip').addEventListener('click', () => void controller.mark('skip'));
$('#settings').addEventListener('click', () => { ui.settings = !ui.settings; $('#settings-panel').hidden = !ui.settings; $('#settings').setAttribute('aria-expanded', ui.settings); });
$('#knowledge-level').addEventListener('change', event => controller.setLevel(event.target.value));
$('#explorer-toggle').addEventListener('click', () => document.body.classList.toggle('explorer-hidden'));
$('#mentor-focus').addEventListener('click', () => $('#mentor-content').focus());
$('#terminal-toggle').addEventListener('click', () => {
    const collapsed = $('.terminal').classList.toggle('collapsed');
    $('#terminal-toggle').setAttribute('aria-label', collapsed ? 'Expand terminal' : 'Collapse terminal');
});
media.subscribe(event => {
    if (event === 'audio-error') { controller.state.error = 'Audio could not load. Try Play again, skip or finish this lesson.'; controller.emit(); }
});
renderWorkspace(); controller.subscribe(renderMentor);
void fetch('/demo-config').then(response => response.json()).then(config => {
    $('#connection').textContent = config.reachable ? 'Backend connected' : config.connected ? 'Backend unavailable' : 'Replay available';
    $('#connection').classList.toggle('connected', Boolean(config.reachable));
}).catch(() => { $('#connection').textContent = 'Offline'; });
if (persistence.load()?.sessionId || persistence.load()?.acceptancePending) { ui.step = 4; renderWorkspace(); void controller.restore(); }
window.addEventListener('pagehide', () => { clearInterval(timer); controller.dispose(); media.dispose(); disposeOrb(); });
