// Controlled integration check, NOT evidence of live Gemini/ElevenLabs/Whisper.
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const targetUrl = process.env.TARGET_URL || 'http://127.0.0.1:4317';

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    try {
        const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1440, height: 900 } });
        await context.addInitScript(() => {
            // Replace only external audio playback, not the controller or DOM.
            globalThis.AudioContext = undefined;
            globalThis.Audio = class extends EventTarget {
                constructor() { super(); globalThis.demoTestAudio = this; }
                currentTime = 12; duration = 120; ended = false; preload = '';
                async play() {} pause() {} load() {} removeAttribute() {}
            };
            const NativeRecorder = globalThis.MediaRecorder;
            globalThis.MediaRecorder = class extends NativeRecorder {
                constructor(...args) {
                    super(...args); globalThis.demoTestRecordedBytes = 0;
                    this.addEventListener('dataavailable', event => { globalThis.demoTestRecordedBytes += event.data.size; });
                }
            };
        });
        const page = await context.newPage(); const errors = []; const calls = [];
        const holds = new Map();
        const hold = (path, method = 'POST') => {
            let release; const pending = new Promise(resolve => { release = resolve; });
            holds.set(`${method} ${path}`, pending); return release;
        };
        page.on('pageerror', e => errors.push(e.message));
        let session;
        const fresh = () => ({ sessionId: 'controlled-session', projectId: 'controlled-project', snapshotRevision: 1,
            phases: [{ id: 'frontend', title: 'The frontend boundary', objective: 'Understand form state', description: 'Local state is not a trust boundary.' }, { id: 'api', title: 'The server boundary', objective: 'Validate on the server', description: 'Trust only server checks.' }],
            activePhaseId: 'frontend', completedIds: [], skippedIds: [], alreadyKnowIds: [], questionHistory: [], status: 'learning', lastEvaluatedRevision: 1 });
        await page.route('**/demo-config', route => route.fulfill({ json: { connected: true, reachable: true } }));
        await page.route('**/api/**', async route => {
            const request = route.request(); const path = new URL(request.url()).pathname;
            const body = request.method() === 'POST' ? request.postDataJSON() : undefined;
            const key = `${request.method()} ${path}`;
            if (holds.has(key)) { const pending = holds.get(key); holds.delete(key); await pending; }
            calls.push({ path, body }); let json;
            if (path === '/api/offer') json = { shouldOffer: true, offerId: 'controlled-offer', previewTopics: ['Frontend state', 'Server validation'], estimatedSeconds: 180 };
            else if (path === '/api/sessions') { session = fresh(); json = session; }
            else if (path === '/api/teach') json = { explanation: 'Your frontend owns the form state. The server owns the trust boundary. A request can bypass your form, so validate inputs again on the server.', contentId: `content-${body.phaseId}`, groundingStatus: 'conceptual' };
            else if (path === '/api/speech') json = { audioUrl: `/api/audio/${'a'.repeat(64)}`, audioId: 'a'.repeat(64), mimeType: 'audio/mpeg' };
            else if (path.endsWith('/actions')) {
                if (['pause', 'resume'].includes(body.action)) session.status = body.action === 'pause' ? 'paused' : 'learning';
                else {
                    session[body.action === 'phase_completed' ? 'completedIds' : body.action === 'skip' ? 'skippedIds' : 'alreadyKnowIds'].push(body.phaseId);
                    session.activePhaseId = body.phaseId === 'frontend' ? 'api' : undefined;
                }
                json = session;
            } else if (path.endsWith('/practice')) {
                const phaseId = path.split('/')[5];
                json = body ? { practiceId: `practice-${phaseId}`, phaseId, questions: [1, 2, 3].map(n => ({ id: `${phaseId}-q${n}`, question: `Why does boundary ${n} matter?`, modelAnswer: 'Client validation helps UX; server validation protects data.' })) } : null;
            } else if (path === '/api/transcribe') json = { text: 'Why should I validate on the server too?' };
            else if (path === '/api/ask') json = { kind: 'answer', answer: 'A malicious client can bypass the browser form. Server validation is the trusted boundary.', contentId: 'answer-content', resumePhaseId: session.activePhaseId };
            else if (path === '/api/complete') { session.status = body.status; json = { recap: 'You covered the frontend and server boundaries.', lastEvaluatedRevision: 1 }; }
            else { await route.fulfill({ status: 404, json: { error: { message: 'Not found', retryable: false } } }); return; }
            await route.fulfill({ json });
        });
        const response = await page.goto(targetUrl); assert.equal(response.status(), 200, 'UI should be served');
        assert.equal(response.headers()['www-authenticate'], undefined, 'No login challenge');
        await expect(page.locator('#opening-screen')).toBeVisible();
        await expect(page.locator('#opening-screen')).toContainText('Goldie');
        assert.equal(await page.locator('.ide').evaluate(el => el.inert), true, 'Covered controls cannot receive focus');
        assert.equal(calls.length, 0, 'Opening never starts paid work');
        await page.screenshot({ path: '/tmp/goldie-web-opening.png', fullPage: true });
        await expect(page.locator('#opening-screen')).toBeHidden();
        assert.equal(await page.locator('.ide').evaluate(el => el.inert), false, 'IDE becomes interactive automatically');
        await page.reload();
        await expect(page.locator('#opening-screen')).toBeHidden();
        await expect(page.getByRole('button', { name: 'Run sample prompt' })).toHaveClass(/next-action/);
        await expect(page.locator('#next-step')).toContainText('Run sample prompt');
        assert.notEqual(await page.locator('#replay-action').evaluate(el => getComputedStyle(el).boxShadow), 'none');
        await page.getByRole('button', { name: 'Run sample prompt' }).click();
        await page.getByRole('button', { name: 'Skip replay' }).click();
        await expect(page.getByRole('button', { name: 'Prepare lesson', exact: true })).toHaveClass(/next-action/);
        const releaseOffer = hold('/api/offer');
        await page.getByRole('button', { name: 'Prepare lesson', exact: true }).click();
        await expect(page.locator('#processing-loader')).toBeVisible();
        await expect(page.locator('#processing-label')).toHaveText('Preparing your lesson…');
        await page.locator('.tree-file[data-file="app/task-board.js"]').click();
        await expect(page.locator('#breadcrumb')).toContainText('task-board.js');
        releaseOffer();
        await page.getByRole('button', { name: 'Not now', exact: true }).click();
        await expect(page.locator('#processing-loader')).toBeHidden();
        assert.equal(calls.filter(c => c.path === '/api/sessions').length, 0);
        await page.getByRole('button', { name: 'Prepare lesson', exact: true }).click();
        const releaseTeach = hold('/api/teach'); const releaseVoice = hold('/api/speech');
        await page.getByRole('button', { name: 'Explain this build', exact: true }).click();
        await expect(page.locator('#processing-label')).toHaveText('Preparing this explanation…');
        await expect(page.locator('#mentor-content')).toHaveAttribute('aria-busy', 'true');
        releaseTeach();
        await expect(page.locator('#processing-label')).toHaveText('Preparing voice…');
        await expect(page.locator('#play')).toBeDisabled();
        await expect(page.locator('.orb-wrap')).toBeHidden();
        assert.ok(await page.locator('#processing-loader').getByRole('status').count());
        for (const width of [1440, 900, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
            const loader = await page.locator('#processing-loader').boundingBox();
            const panel = await page.locator('#mentor').boundingBox();
            assert.ok(loader.x >= panel.x && loader.y >= panel.y && loader.x + loader.width <= panel.x + panel.width + 1
                && loader.y + loader.height <= panel.y + panel.height, `Loader stays inside Goldie at ${width}`);
            await expect(page.locator('#editor')).toBeVisible();
            assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth), `No loader overflow at ${width}`);
            await page.screenshot({ path: `/tmp/goldie-web-loading-${width}.png`, fullPage: true });
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.locator('.processing-bar span').evaluate(el => getComputedStyle(el).animationName), 'none');
        assert.ok(await page.locator('.processing-bar span').evaluate(el => {
            const segment = el.getBoundingClientRect(); const bar = el.parentElement.getBoundingClientRect();
            return segment.left >= bar.left && segment.right <= bar.right;
        }), 'Reduced motion keeps a visible static indicator');
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.setViewportSize({ width: 1440, height: 900 });
        releaseVoice();
        await expect(page.locator('#processing-loader')).toBeHidden();
        await expect(page.locator('#mentor-content')).toHaveAttribute('aria-busy', 'false');
        await expect(page.locator('#orb-status')).toHaveText('Goldie is speaking');
        await expect(page.getByRole('heading', { name: 'The frontend boundary', exact: true })).toHaveCount(0);
        await expect(page.locator('#speech-caption')).toHaveText('Your frontend owns the form state.');
        await expect(page.locator('#mentor-content')).not.toContainText('The server owns the trust boundary.');
        await page.getByRole('button', { name: 'Pause audio', exact: true }).click();
        await page.getByRole('button', { name: 'Mark covered & continue', exact: true }).click();
        const releasePractice = hold('/api/sessions/controlled-session/phases/frontend/practice');
        await page.getByRole('button', { name: 'Practice', exact: true }).click();
        await expect(page.locator('#processing-label')).toHaveText('Preparing practice questions…');
        releasePractice();
        await page.getByLabel('Your answer 1').fill('The browser is not trusted.');
        const before = calls.length;
        await page.getByRole('button', { name: 'Show model answer' }).first().click();
        await expect(page.getByText('Client validation helps UX; server validation protects data.').first()).toBeVisible();
        assert.equal(calls.length, before, 'Reveal must be local');
        await page.getByRole('button', { name: 'Continue lesson', exact: true }).click();
        await page.getByRole('button', { name: 'Ask Goldie by voice', exact: true }).click();
        await expect(page.getByText('Listening…', { exact: true })).toBeVisible();
        await page.waitForFunction(() => globalThis.demoTestRecordedBytes > 0);
        const releaseAnswer = hold('/api/ask'); const releaseAnswerVoice = hold('/api/speech');
        await page.getByRole('button', { name: 'Stop and send question', exact: true }).click();
        await expect(page.locator('#processing-label')).toHaveText('Thinking through your question…');
        await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
        releaseAnswer();
        await expect(page.locator('#processing-label')).toHaveText('Preparing voice…');
        releaseAnswerVoice();
        await expect(page.locator('#processing-loader')).toBeHidden();
        await expect(page.locator('#speech-caption')).toHaveText('A malicious client can bypass the browser form.');
        await expect(page.locator('.conversation-turn')).toHaveCount(0);
        await page.evaluate(() => { globalThis.demoTestAudio.ended = true; globalThis.demoTestAudio.dispatchEvent(new Event('ended')); });
        await expect(page.getByText('Ready to go back to the lesson?', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Ask another', exact: true }).click();
        await expect(page.getByText('Listening…', { exact: true })).toBeVisible();
        await page.waitForFunction(() => globalThis.demoTestRecordedBytes > 0);
        await page.getByRole('button', { name: 'Send question', exact: true }).click();
        await expect(page.locator('#processing-loader')).toBeHidden();
        await expect(page.locator('.conversation-turn')).toHaveCount(0);
        await page.getByRole('button', { name: 'Resume lesson', exact: true }).click();
        await page.getByRole('button', { name: 'Mark covered & finish', exact: true }).click();
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Back to building.', exact: true })).toBeVisible();
        const reviewCalls = calls.length;
        await page.getByRole('button', { name: 'Review practice', exact: true }).click();
        await expect(page.getByLabel('Your answer 1')).toHaveValue('The browser is not trusted.');
        assert.equal(calls.length, reviewCalls, 'Final review must not generate');
        for (const width of [1440, 900, 390]) {
            await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
            const dimensions = await page.evaluate(() => ({ viewport: innerHeight, document: document.documentElement.scrollHeight,
                elements: ['body', '.ide', '.workspace', '.editor', '.mentor-panel', '.mentor-content', '.player-controls'].map(selector => {
                    const el = document.querySelector(selector); const b = el.getBoundingClientRect(); const css = getComputedStyle(el);
                    return { selector, height: b.height, bottom: b.bottom, overflow: css.overflow, scrollHeight: el.scrollHeight };
                }) }));
            if (dimensions.document > dimensions.viewport) console.log(dimensions);
            assert.ok(dimensions.document <= dimensions.viewport, `App shell stays within viewport at ${width}`);
            await page.screenshot({ path: `/tmp/goldie-web-review-${width}.png`, fullPage: true });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal page overflow at ${width}`);
        }
        await page.getByRole('button', { name: 'Reset demo', exact: true }).click();
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({ path: '/tmp/goldie-web-desktop.png', fullPage: true });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
        assert.equal(await page.locator('.next-action').first().evaluate(el => getComputedStyle(el).animationName), 'none');
        await page.keyboard.press('Tab');
        assert.ok(await page.evaluate(() => document.activeElement !== document.body), 'Keyboard reaches an interactive control');
        await context.close();
        for (const width of [900, 390]) {
            const introContext = await browser.newContext({ viewport: { width, height: 844 } });
            if (width === 390) {
                await introContext.addInitScript(() => {
                    Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage disabled for this check'); };
                });
            }
            const opening = await introContext.newPage();
            await opening.route('**/demo-config', route => route.fulfill({ json: { connected: false, reachable: false } }));
            await opening.route('**/api/**', () => { throw new Error('Opening must never request teaching or voice'); });
            await opening.goto(targetUrl);
            await expect(opening.locator('#opening-screen')).toBeVisible();
            assert.ok(await opening.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Opening fits at ${width}`);
            await opening.screenshot({ path: `/tmp/goldie-web-opening-${width}.png`, fullPage: true });
            await expect(opening.locator('#opening-screen')).toBeHidden();
            await opening.keyboard.press('Tab');
            assert.ok(await opening.evaluate(() => document.activeElement !== document.body), 'Opening restores keyboard access');
            await introContext.close();
        }
        const offline = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
        // No test context may fall through to a configured paid backend.
        await offline.route('**/demo-config', route => route.fulfill({ json: { connected: false, reachable: false } }));
        await offline.route('**/api/**', route => route.fulfill({ status: 503, json: { error: {
            code: 'DEMO_BACKEND_UNAVAILABLE', message: 'The live mentor is not connected. The coding replay still works.', retryable: true
        } } }));
        await offline.goto(targetUrl);
        await expect(offline.locator('#opening-screen')).toBeVisible();
        assert.equal(await offline.locator('#opening-screen').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
        await expect(offline.locator('#opening-screen')).toBeHidden();
        await offline.getByRole('button', { name: 'Run sample prompt' }).click();
        await offline.getByRole('button', { name: 'Skip replay' }).click();
        await offline.getByRole('button', { name: 'Prepare lesson', exact: true }).click();
        await expect(offline.getByRole('alert')).toContainText('not connected');
        await expect(offline.locator('#processing-loader')).toBeHidden();
        await expect(offline.locator('#mentor-content')).toHaveAttribute('aria-busy', 'false');
        await offline.screenshot({ path: '/tmp/goldie-web-offline.png', fullPage: true });
        assert.deepEqual(errors, []);
        console.log(`PASS: anonymous opening/automatic transition/refresh/blocked storage, controlled replay/opt-in/lesson/practice/voice/resume/recap/reset, loader, three widths, reduced motion and offline state. ${calls.length} controlled API requests; zero paid requests.`);
    } finally { await browser.close(); }
})();
