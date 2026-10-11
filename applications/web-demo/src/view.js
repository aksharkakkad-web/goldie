// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const e = escapeHtml;
const paths = {
    files: '<path d="M8 3H5v18h14V7l-4-4H8Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    branch: '<circle cx="7" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="6" r="2"/><path d="M7 7v10M7 14c6 0 11-1 11-6"/>',
    blocks: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    account: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="9" r="3"/><path d="M5 18c2-5 12-5 14 0"/>',
    settings: '<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
    chat: '<path d="M4 5h16v12H9l-5 4V5Z"/><path d="M8 9h8M8 13h5"/>',
    play: '<path d="m9 5 10 7-10 7V5Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    skip: '<path d="m5 6 10 6-10 6V6ZM19 6v12"/>',
    chevron: '<path d="m7 14 5-5 5 5"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? paths.spark}</svg>`;
const button = (label, action, kind = 'primary', disabled = false) => `<button class="${kind}-button" data-action="${action}"${disabled ? ' disabled' : ''}>${e(label)}</button>`;
export function processingLabel(stage) {
    return ({ offer: 'Preparing your lesson…', starting: 'Getting Goldie ready…', teaching: 'Preparing this explanation…',
        voice: 'Preparing voice…', playback: 'Starting audio…', microphone: 'Waiting for microphone permission…',
        recording: 'Preparing your recording…', transcription: 'Transcribing your question…', thinking: 'Thinking through your question…',
        'practice-cache': 'Loading saved practice…', practice: 'Preparing practice questions…', recap: 'Preparing your recap…',
        saving: 'Saving your progress…', restoring: 'Restoring your lesson…', pausing: 'Pausing the lesson…', resuming: 'Resuming the lesson…'
    })[stage] ?? 'Getting Goldie ready…';
}

export function nextStep(state, ready, running = false) {
    const action = (name, message) => ({ target: `[data-action="${name}"]`, message });
    if (state.busy) { return { target: null, message: 'Goldie is preparing. You can keep browsing the code.' }; }
    if (running) { return { target: null, message: 'Watch the sample build. A lesson comes next.' }; }
    if (state.error && state.retryable) { return action('retry', 'Click Retry when you’re ready, or keep browsing.'); }
    switch (state.view) {
        case 'offer': return action('accept', 'Click Explain this build to start the spoken lesson.');
        case 'lesson': return state.explanation
            ? action('covered', 'Listen or read, then mark this topic covered. Ask Goldie any time.')
            : { target: '#play', message: 'Click Play to load this phase. Nothing starts on reload.' };
        case 'gate': return action('practice', 'Practice is optional. Try it, or click Continue.');
        case 'practice': return action('continue', 'Compare your reasoning with the model answers, then continue.');
        case 'question':
            if (['recording', 'ready'].includes(state.recording)) { return action('send', 'Click Send question when you’re done, or Cancel to discard.'); }
            if (state.answer || state.recording === 'idle') { return action('resume', 'Click Resume lesson to return to the original explanation.'); }
            return { target: null, message: 'Wait for your question to finish processing.' };
        case 'recap': return Object.keys(state.batches ?? {}).length || state.cachedPracticePhaseIds?.length
            ? action('review', 'Click Review practice to revisit your questions—no new generation.')
            : action('reset', 'You’re done. Click Start again only if you want another walkthrough.');
        case 'review': return action('recap', 'Review at your own pace, then return to the recap.');
        case 'no-offer': return action('reset', 'No lesson is needed. Browse the code or reset the walkthrough.');
        default: return ready ? action('prepare', 'Click Prepare lesson to see what you can learn.')
            : { target: '#replay-action', message: 'Click Run sample prompt in the terminal to begin.' };
    }
}

export function highlight(source) {
    // Tokenize original text first. Never interpolate source into HTML attributes.
    const regex = /(\/\/[^\n]*|'[^'\n]*'|"[^"\n]*"|\b(?:import|from|export|default|function|const|let|async|await|return|if|new|typeof|model|String|React|Request|Response)\b|\b\d+\b)/g;
    let result = ''; let last = 0;
    for (const match of source.matchAll(regex)) {
        result += e(source.slice(last, match.index)); const token = match[0];
        const kind = token.startsWith('//') ? 'comment' : /^['"]/.test(token) ? 'string' : /^\d/.test(token) ? 'number' : 'keyword';
        result += `<span class="syntax-${kind}">${e(token)}</span>`; last = match.index + token.length;
    }
    return result + e(source.slice(last));
}

function practiceCard(state, batch) {
    return batch.questions.map((q, i) => {
        const key = `${batch.phaseId}:${q.id}`;
        return `<section class="practice-question">
      <div class="question-number">Question ${i + 1}</div><h3>${e(q.question)}</h3>
      <label class="visually-hidden" for="answer-${e(key)}">Your answer ${i + 1}</label>
      <textarea id="answer-${e(key)}" data-draft="${e(key)}" rows="3" maxlength="2000" placeholder="Think it through in your own words…">${e(state.drafts[key] ?? '')}</textarea>
      ${state.revealed.has(key) ? `<div class="model-answer"><span>Model answer</span><p>${e(q.modelAnswer)}</p></div>` : `<button class="text-button" data-reveal="${e(key)}">Show model answer</button>`}
    </section>`;
    }).join('');
}

export function mentorView(state, ready, phase, details = false) {
    const busy = state.busy;
    const error = state.error ? `<div class="error-message" role="alert"><p>${e(state.error)}</p>${state.retryable ? button('Retry', 'retry', 'secondary', busy) : ''}</div>` : '';
    let body;
    switch (state.view) {
        case 'offer':
            body = `<span class="section-label">A moment to understand</span><h2>There’s a lesson in this build.</h2><p>Let’s connect the code to the ideas behind it.</p><ul class="topic-list">${(state.offer.previewTopics ?? []).map(topic => `<li>${e(topic)}</li>`).join('')}</ul><div class="action-row">${button('Explain this build', 'accept', 'primary', busy)}${button('Not now', 'decline', 'text', busy)}</div><p class="quiet-note">Audio starts only after you choose Explain.</p>`; break;
        case 'lesson':
            body = `<span class="section-label">Phase ${Math.max(0, state.session.phases.findIndex(p => p.id === phase?.id)) + 1} of ${state.session.phases.length}</span><h2>${e(phase?.title ?? 'Lesson complete')}</h2><p class="objective">${e(phase?.objective)}</p>
              ${state.explanation ? `<div class="explanation${details ? ' expanded' : ''}"><p>${e(state.explanation)}</p></div>${button(details ? 'Hide full explanation' : 'Read full explanation', 'details', 'text')}` : `<p>${busy ? 'Your explanation will appear here.' : 'Load the explanation when you’re ready.'}</p>`}
              <div class="lesson-actions">${button(phase?.id === state.session.phases.at(-1)?.id ? 'Mark read & finish' : 'Mark read & continue', 'covered', 'secondary', busy)}${button('I already know this', 'familiar', 'text', busy)}</div>${button('End session', 'end', 'text', busy)}`; break;
        case 'gate': {
            const topic = state.session.phases.find(p => p.id === state.gatePhaseId);
            body = `<span class="section-label">Topic covered</span><h2>Make it click.</h2><p>You’ve covered ${e(topic?.title ?? 'this topic')}. Try a few questions, or keep moving.</p><div class="action-row">${button('Practice', 'practice', 'primary', busy)}${button('Continue', 'continue', 'secondary', busy)}</div><p class="quiet-note">Optional. No grades, no pressure.</p>`; break;
        }
        case 'practice':
            body = `<span class="section-label">Practice, not a test</span><h2>Think it through.</h2><p>Write your reasoning, then compare with the model answer. Your answers stay in this tab.</p>${practiceCard(state, state.batches[state.practicePhaseId])}${button('Continue lesson', 'continue', 'primary', busy)}`; break;
        case 'question':
            body = `<span class="section-label">A little deeper</span><h2>${state.answer ? 'Here’s the idea.' : 'What’s on your mind?'}</h2>
              ${state.recording === 'recording' ? '<p class="recording-label"><span></span>Listening to your question…</p><p>Click Send when you’re done. Maximum 30 seconds.</p>' : ''}
              ${state.recording === 'ready' ? '<p>Recording stopped. Send your question, or cancel to discard it.</p>' : ''}
              ${state.question ? `<blockquote>${e(state.question)}</blockquote>` : ''}${state.answer ? `<div class="answer-text">${e(state.answer)}</div>` : ''}
              <div class="action-row">${['recording', 'ready'].includes(state.recording) ? button('Send question', 'send', 'primary', busy) : ''}${state.answer || state.recording === 'idle' ? button('Resume lesson', 'resume', 'primary', busy) : ''}${!state.answer ? button('Cancel', 'cancel', 'text') : ''}</div>`; break;
        case 'recap':
            body = `<span class="section-label">A little more understanding</span><h2>Back to building.</h2><p>${e(state.recap || 'Your lesson progress is saved.')}</p><dl class="recap-counts"><div><dt>Covered</dt><dd>${state.session?.completedIds.length ?? 0}</dd></div><div><dt>Skipped</dt><dd>${state.session?.skippedIds.length ?? 0}</dd></div><div><dt>Already familiar</dt><dd>${state.session?.alreadyKnowIds.length ?? 0}</dd></div></dl><p class="quiet-note">Covered means listened or marked read—not assessed mastery.</p>${Object.keys(state.batches).length || state.cachedPracticePhaseIds?.length ? button('Review practice', 'review', 'primary', busy) : ''}${button('Start again', 'reset', 'secondary', busy)}`; break;
        case 'review':
            body = `<span class="section-label">Your final review</span><h2>Keep the ideas.</h2><p>The same practice you opened during the lesson. No new generation or grading.</p>${Object.values(state.batches).map(batch => `<h3 class="review-topic">${e(state.session.phases.find(p => p.id === batch.phaseId)?.title)}</h3>${practiceCard(state, batch)}`).join('')}${button('Back to recap', 'recap', 'primary')}`; break;
        case 'no-offer':
            body = `<h2>Keep building.</h2><p>Goldie didn’t find a useful new lesson for this context.</p>${button('Reset walkthrough', 'reset', 'secondary', busy)}`; break;
        default:
            body = `<span class="section-label">Your opt-in engineering mentor</span><h2>${ready ? 'Understand what you just built.' : 'Build it.\nUnderstand it.'}</h2><p>${ready ? 'Follow the request from form to API to database. Learn the why, not just the code.' : 'As the code comes together, Goldie helps the ideas come together too.'}</p>${ready ? `<div class="action-row">${button('Prepare lesson', 'prepare', 'primary', busy)}</div>` : '<p class="quiet-note">Run the sample prompt to begin.</p>'}<p class="quiet-note">${state.view === 'declined' ? 'No problem. Your code stays right here.' : 'No surprise audio. No interruptions.'}</p>`;
    }
    return `${error}${body}`;
}
