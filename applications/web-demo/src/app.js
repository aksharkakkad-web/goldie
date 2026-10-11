// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { files, prompt, replayAt } from './scenario.js';
import { HttpApi } from './api.js';
import { DemoController } from './controller.js';
import { BrowserMedia } from './media.js';
import { mountOrb } from './orb.js';
import { escapeHtml as e, icon, highlight, mentorView, nextStep } from './view.js';

const $ = selector => document.querySelector(selector);
const media = new BrowserMedia();
const persistence = {
    save(data) { try { sessionStorage.setItem('goldie.web-demo.session.v1', JSON.stringify(data)); } catch { /* A blocked store must not stop learning. */ } },
    load() { try { return JSON.parse(sessionStorage.getItem('goldie.web-demo.session.v1')); } catch { return null; } },
    clear() { try { sessionStorage.removeItem('goldie.web-demo.session.v1'); } catch { /* Optional storage. */ } }
};
const controller = new DemoController(new HttpApi(), media, persistence);
const ui = { step: 0, running: false, currentFile: null, openFiles: [], details: false, settings: false };
let timer;
for (const [selector, name] of Object.entries({ '#reset': 'reset', '#explorer-toggle': 'files', '#search-icon': 'search', '#branch-icon': 'branch', '#blocks-icon': 'blocks', '#mentor-focus': 'spark', '#account-icon': 'account', '#settings': 'settings', '#terminal-toggle': 'chevron', '#status-branch': 'branch' })) { $(selector).innerHTML = icon(name); }
$('#ask').innerHTML = icon('chat'); $('#skip').innerHTML = icon('skip');
const disposeOrb = mountOrb($('#orb'), () => media.level);

function selectFile(name) {
    if (!replayAt(ui.step).visibleFiles.includes(name)) { return; }
    ui.currentFile = name;
    if (!ui.openFiles.includes(name)) { ui.openFiles.push(name); }
    renderWorkspace();
}
function renderWorkspace() {
    const replay = replayAt(ui.step);
    const grouped = [{ directory: 'app', items: ['app/page.tsx', 'app/api/teams/route.ts'] }, { directory: 'prisma', items: ['prisma/schema.prisma'] }, { directory: '.goldie', items: ['.goldie/HANDOFF.md'] }];
    $('#file-tree').innerHTML = grouped.map(group => `<div class="tree-directory"><span>⌄</span>${e(group.directory)}</div>${group.items.map(file => `<button class="tree-file${file === ui.currentFile ? ' active' : ''}" data-file="${e(file)}"${replay.visibleFiles.includes(file) ? '' : ' disabled'}><span class="file-symbol ${file.endsWith('.md') ? 'markdown-symbol' : ''}">${file.endsWith('.tsx') ? '⚛' : file.endsWith('.md') ? 'M↓' : file.endsWith('.prisma') ? '◇' : 'TS'}</span><span>${e(file.replace(`${group.directory}/`, ''))}</span>${replay.visibleFiles.includes(file) ? '<span class="file-added">U</span>' : ''}</button>`).join('')}`).join('');
    $('#editor-tabs').innerHTML = `<button role="tab" aria-selected="${ui.currentFile === null}" class="editor-tab${ui.currentFile === null ? ' active' : ''}" data-welcome><img src="/assets/goldie.png" alt="">Welcome</button>${ui.openFiles.map(file => `<button role="tab" aria-selected="${ui.currentFile === file}" class="editor-tab${ui.currentFile === file ? ' active' : ''}" data-file="${e(file)}"><span class="tab-file-symbol">${file.endsWith('.md') ? 'M↓' : 'TS'}</span>${e(file.split('/').at(-1))}<span class="tab-dot" aria-hidden="true">·</span></button>`).join('')}`;
    $('#breadcrumb').textContent = ui.currentFile ? `teamspace  ›  ${ui.currentFile.replaceAll('/', '  ›  ')}` : 'Welcome to Goldie';
    if (ui.currentFile) {
        $('#editor').innerHTML = `<div class="code-lines">${files[ui.currentFile].split('\n').map((line, i) => `<div class="code-line"><span class="line-number" aria-hidden="true">${i + 1}</span><code>${highlight(line) || ' '}</code></div>`).join('')}</div><div class="code-disclosure">Illustrative source · read-only · not executed</div>`;
    } else {
        $('#editor').innerHTML = `<div class="welcome"><img class="welcome-logo" src="/assets/goldie.png" alt="Goldie"><div class="welcome-wordmark">Goldie<span> / teamspace</span></div><h1>The code is only<br>half the story.</h1><p>Follow a small build. Understand the decisions.<br>Ask the questions you’d usually skip.</p><div class="prompt-card"><div class="prompt-heading"><span class="prompt-dot"></span>A sample coding prompt</div><p>${e(prompt)}</p><div class="prompt-footer"><span>Prepared replay, not a live agent</span><button class="prompt-run" data-run aria-label="${ui.running ? 'Replay in progress' : 'Begin sample build'}"${ui.running ? ' disabled' : ''}>${icon('arrow')}</button></div></div><div class="welcome-hint">Your editor on the left. Your understanding on the right.</div></div>`;
    }
    $('#terminal-output').innerHTML = `<div class="terminal-command"><span class="terminal-user">you@teamspace</span> <span class="terminal-path">~/workspace</span> <span class="terminal-caret">%</span> <span>goldie walkthrough</span></div>${replay.terminal.map(line => `<div class="terminal-line${line.startsWith('✓') ? ' terminal-success' : ''}">${e(line)}</div>`).join('')}${ui.running ? '<span class="terminal-cursor" aria-hidden="true">▍</span>' : ''}`;
    $('#replay-label').textContent = replay.label;
    $('#replay-action').textContent = ui.running ? 'Skip replay' : ui.step === 4 ? 'Replay build' : 'Run sample prompt';
    $('#workspace-status').textContent = ui.step === 4 ? 'Handoff ready' : 'Sample workspace';
    $('#status-file').textContent = ui.currentFile?.endsWith('.md') ? 'Markdown' : 'TypeScript React';
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
    $('#mentor-content').innerHTML = mentorView(state, ui.step === 4, controller.phase, ui.details);
    $('#mentor-content').scrollTop = scroll;
    if (draft) {
        const replacement = [...document.querySelectorAll('[data-draft]')].find(element => element.dataset.draft === draft);
        replacement?.focus({ preventScroll: true }); replacement?.setSelectionRange(...selection);
    }
    $('#orb-status').textContent = state.busy ? 'Goldie is working…' : state.recording === 'recording' ? 'Listening' : state.playing ? 'Goldie is speaking' : state.view === 'recap' ? 'A little wiser. Back to building.' : 'Ready when you are';
    $('#phase-dots').innerHTML = state.session && ['lesson', 'question', 'gate', 'practice'].includes(state.view) ? state.session.phases.map(p => `<span class="phase-dot${p.id === controller.phase?.id ? ' active' : ''}${state.session.completedIds.includes(p.id) ? ' covered' : ''}" title="${e(p.title)}"></span>`).join('') : '';
    $('#knowledge-level').disabled = Boolean(controller.active || state.busy); $('#knowledge-level').value = controller.context.profile.level;
    $('#ask').disabled = state.busy || state.view !== 'lesson' || !state.explanation;
    const label = state.view === 'lesson' ? state.playing ? 'Pause audio' : 'Play audio' : state.view === 'question' && state.answer ? state.playing ? 'Pause answer audio' : 'Play answer audio' : 'Start learning';
    $('#play').setAttribute('aria-label', label); $('#play').title = label;
    $('#play').innerHTML = icon(state.playing ? 'pause' : 'play');
    $('#play').disabled = state.busy || !(['lesson'].includes(state.view) || state.view === 'question' && Boolean(state.answer));
    $('#skip').disabled = state.busy || state.view !== 'lesson';
    $('#reset').disabled = state.busy; $('#replay-action').disabled = Boolean(controller.active || state.busy);
    $('#privacy-note').textContent = state.recording === 'recording' ? 'Microphone on · click Send or Cancel' : 'You choose when to learn.';
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
    clearInterval(timer); Object.assign(ui, { step: 0, running: false, currentFile: null, openFiles: [], details: false }); renderWorkspace(); renderMentor(controller.state);
}
const actions = {
    prepare: () => controller.prepare(), accept: () => controller.accept(), decline: () => controller.decline(),
    covered: () => controller.mark('phase_completed'), familiar: () => controller.mark('already_know'),
    continue: () => controller.continuePhase(), practice: () => controller.practice(), review: () => controller.review(),
    recap: () => controller.showRecap(), end: () => controller.end(), reset,
    send: () => controller.questionSend(), cancel: () => controller.questionCancel(), resume: () => controller.questionResume(),
    retry: () => controller.retry(), details: () => { ui.details = !ui.details; renderMentor(controller.state); }
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
    if (controller.state.view === 'question') { void controller.run(async () => { if (media.playing) { media.pause(); } else { await media.play(); } }); }
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
    if (event === 'audio-error') { controller.state.error = 'Audio could not load. You can still read, skip or finish this lesson.'; controller.emit(); }
});
renderWorkspace(); controller.subscribe(renderMentor);
void fetch('/demo-config').then(response => response.json()).then(config => {
    $('#connection').textContent = config.reachable ? 'Backend connected' : config.connected ? 'Backend unavailable' : 'Replay available';
    $('#connection').classList.toggle('connected', Boolean(config.reachable));
}).catch(() => { $('#connection').textContent = 'Offline'; });
if (persistence.load()?.sessionId || persistence.load()?.acceptancePending) { ui.step = 4; renderWorkspace(); void controller.restore(); }
window.addEventListener('pagehide', () => { clearInterval(timer); controller.dispose(); media.dispose(); disposeOrb(); });
