// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { GeminiOptions, GeminiTeachingProvider, LessonPlan, PlannedPhase, PlanningInput } from '../src/providers/teaching';

function adapter(configuration: GeminiOptions): GeminiTeachingProvider {
    return new GeminiTeachingProvider(configuration);
}

async function provider(handler: (req: IncomingMessage, res: ServerResponse) => void, run: (baseUrl: string) => Promise<void>): Promise<void> {
    const server = createServer(handler);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}

async function failure(promise: Promise<unknown>, code: string, retryable: boolean): Promise<void> {
    let error;
    try { await promise; } catch (caught) { error = caught; }
    expect(error).to.include({ code, retryable });
    expect(JSON.stringify(error)).not.to.match(/private-test-key|provider-secret-body/);
}

const input: PlanningInput = { handoff: 'Build an authenticated work queue. Workers are planned, not implemented.', profile: { level: 'beginner', knownConcepts: [] } };
const phase: PlannedPhase = { id: 'queues', title: 'Work queues', objective: 'Understand asynchronous work', description: 'Decouple work from requests.',
    whyNow: 'The handoff plans background workers.', sourceStatus: 'planned', depth: 'foundation', prerequisiteIds: [] };
const plan: LessonPlan = { shouldOffer: true, reason: 'A new asynchronous boundary merits teaching.', estimatedSeconds: 75, phases: [phase] };
const options = { apiKey: 'private-test-key', model: 'gemini-3.8-flash', timeoutMs: 1000 };
const envelope = (value: unknown) => JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] });
const conversationPhase = { id: phase.id, title: phase.title, objective: phase.objective, description: phase.description };

describe('Gemini teaching REST adapter', () => {
    it('generates contextual conversations and distinct practice through the same structured REST boundary', async () => {
        let calls = 0;
        await provider((req, res) => {
            let body = ''; req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const payload = JSON.parse(body);
                const context = JSON.parse(payload.contents[0].parts[0].text);
                const valid = context.phase.id === 'queues' && context.explanation === 'Saved queue explanation'
                    && context.handoff === input.handoff && !payload.tools;
                res.writeHead(valid ? 200 : 400, { 'content-type': 'application/json' });
                res.end(envelope(calls++ === 0 ? { answer: 'Retries can repeat work; use atomic deduplication, with implementation unverified.' }
                    : { questions: [1, 2, 3].map(n => ({ id: `q${n}`, question: `Reason about failure ${n}`, modelAnswer: `Apply boundary ${n}` })) }));
            });
        }, async baseUrl => {
            const service = adapter({ ...options, baseUrl });
            const context = { ...input, phase: conversationPhase, explanation: 'Saved queue explanation' };
            expect((await service.ask({ ...context, question: 'What if a retry repeats?', history: [] })).answer).to.include('unverified');
            expect((await service.practice(context)).questions).to.have.length(3);
            expect(service.identity).to.equal('gemini-3.8-flash:stage2-v7-qualified');
        });
        expect(calls).to.equal(2);
    });
    it('rejects malformed answers and duplicate practice instead of falling back, and keeps quota/timeouts safe', async () => {
        for (const result of [{ answer: '' }, { answer: 'x'.repeat(4001) }, { answer: 'safe', unexpected: true }]) {
            await provider((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(envelope(result)); },
                baseUrl => failure(adapter({ ...options, baseUrl }).ask({ ...input, phase: conversationPhase, explanation: 'Saved', question: 'Why?', history: [] }),
                    'GEMINI_INVALID_OUTPUT', true));
        }
        await provider((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' });
            res.end(envelope({ questions: [1, 2, 3].map(n => ({ id: `q${n}`, question: 'Same prompt', modelAnswer: 'Reason' })) })); },
        baseUrl => failure(adapter({ ...options, baseUrl }).practice({ ...input, phase: conversationPhase, explanation: 'Saved' }), 'GEMINI_INVALID_OUTPUT', true));
        await provider((_req, res) => { res.writeHead(429); res.end('provider-secret-body'); },
            baseUrl => failure(adapter({ ...options, baseUrl }).ask({ ...input, phase: conversationPhase, explanation: 'Saved', question: 'Why?', history: [] }),
                'GEMINI_QUOTA', true));
        await provider(() => undefined,
            baseUrl => failure(adapter({ ...options, baseUrl, timeoutMs: 20 }).practice({ ...input, phase: conversationPhase, explanation: 'Saved' }), 'GEMINI_TIMEOUT', true));
    });
    it('requests low thinking for interactive Gemini 3 planning and teaching without breaking older model requests', async () => {
        for (const model of ['gemini-3.8-flash', 'gemini-2.5-flash']) {
            let calls = 0;
            await provider((req, res) => {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    const config = JSON.parse(body).generationConfig;
                    const thinkingValid = model === 'gemini-3.8-flash'
                        ? config.thinkingConfig?.thinkingLevel === 'LOW'
                        : config.thinkingConfig === undefined;
                    const valid = thinkingValid && config.maxOutputTokens === (calls === 0 ? 8192 : 1024);
                    res.writeHead(valid ? 200 : 400, { 'content-type': 'application/json' });
                    res.end(envelope(calls++ === 0 ? plan : {
                        explanation: 'Conceptual queue lesson. The implementation is unverified.', groundingStatus: 'conceptual'
                    }));
                });
            }, async baseUrl => {
                const service = adapter({ ...options, model, baseUrl });
                expect(await service.plan(input)).to.deep.equal(plan);
                expect((await service.teach({ ...input, plan, phaseId: 'queues', detail: 'expanded' })).explanation)
                    .to.include('unverified');
            });
            expect(calls).to.equal(2);
        }
    });

    it('uses header credentials, structured output and separate untrusted context for planning and teaching', async () => {
        let calls = 0;
        await provider((req, res) => {
            expect(req.method).to.equal('POST');
            expect(req.url).to.equal('/v1beta/models/gemini-3.8-flash:generateContent');
            expect(req.headers['x-goog-api-key']).to.equal('private-test-key');
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const parsed = JSON.parse(body);
                expect(parsed.systemInstruction.parts[0].text).to.match(/untrusted/i);
                expect(parsed.generationConfig.responseMimeType).to.equal('application/json');
                expect(parsed.generationConfig.responseJsonSchema.type).to.equal('object');
                expect(parsed).not.to.have.property('tools');
                expect(parsed.contents[0].parts[0].text).to.include(input.handoff);
                expect(body).not.to.include('private-test-key');
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(envelope(calls++ === 0 ? plan : {
                    explanation: 'A queue separates accepting work from doing it. Your handoff describes workers as planned; this is conceptual, not code verification.',
                    groundingStatus: 'inferred'
                }));
            });
        }, async baseUrl => {
            const service = adapter({ ...options, baseUrl });
            expect(await service.plan(input)).to.deep.equal(plan);
            const taught = await service.teach({ ...input, plan, phaseId: 'queues', detail: 'standard' });
            expect(taught.explanation).to.include('planned');
            expect(taught.groundingStatus).to.equal('inferred');
        });
        expect(calls).to.equal(2);
    });

    it('rejects missing credentials before any request', async () => {
        let calls = 0;
        await provider((_req, res) => { calls++; res.end(); }, async baseUrl => {
            await failure(adapter({ ...options, baseUrl, apiKey: '' }).plan(input), 'GEMINI_NOT_CONFIGURED', false);
        });
        expect(calls).to.equal(0);
    });

    it('instructs teaching to qualify guarantees and account for side effects outside a transaction', async () => {
        await provider((req, res) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const system = JSON.parse(body).systemInstruction.parts[0].text;
                const qualified = system.includes('Never claim complete security or data integrity')
                    && system.includes('external side effects outside that transaction')
                    && system.includes('State a remaining failure mode');
                res.writeHead(qualified ? 200 : 400, { 'content-type': 'application/json' });
                res.end(envelope({ explanation: 'Atomic deduplication protects the database write, not external side effects.', groundingStatus: 'conceptual' }));
            });
        }, async baseUrl => {
            expect((await adapter({ ...options, baseUrl }).teach({ ...input, plan, phaseId: 'queues', detail: 'standard' })).explanation)
                .to.include('not external side effects');
        });
    });

    it('sanitizes provider failures and does not automatically retry', async () => {
        for (const [status, code, retryable] of [[401, 'GEMINI_AUTH_FAILED', false], [403, 'GEMINI_AUTH_FAILED', false],
            [429, 'GEMINI_QUOTA', true], [503, 'GEMINI_UNAVAILABLE', true], [400, 'GEMINI_REQUEST_REJECTED', false]]) {
            let calls = 0;
            await provider((_req, res) => { calls++; res.writeHead(status as number); res.end('private-test-key provider-secret-body'); }, async baseUrl => {
                await failure(adapter({ ...options, baseUrl }).plan(input), code as string, retryable as boolean);
            });
            expect(calls).to.equal(1);
        }
    });

    it('bounds stalled headers and bodies with the same total timeout', async () => {
        for (const headers of [false, true]) {
            await provider((_req, res) => {
                if (headers) { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{'); }
            }, async baseUrl => {
                await failure(adapter({ ...options, baseUrl, timeoutMs: 35 }).plan(input), 'GEMINI_TIMEOUT', true);
            });
        }
    });

    it('rejects malformed, truncated, blocked, oversized and invalid plans rather than offering a fixture', async () => {
        const samples = ['not-json', JSON.stringify({ candidates: [] }),
            JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: JSON.stringify(plan) }] } }] }),
            envelope({ ...plan, phases: [] }), envelope({ ...plan, phases: [phase, phase] }),
            envelope({ ...plan, phases: [{ ...phase, prerequisiteIds: ['missing'] }] }),
            envelope({ ...plan, phases: [{ ...phase, prerequisiteIds: ['queues'] }] }),
            'x'.repeat(1024 * 1024 + 1)];
        for (const sample of samples) {
            await provider((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(sample); }, async baseUrl => {
                await failure(adapter({ ...options, baseUrl }).plan(input), 'GEMINI_INVALID_OUTPUT', true);
            });
        }
    });

    it('accepts a no-offer decision and roadmaps longer than ten phases', async () => {
        for (const value of [{ shouldOffer: false, reason: 'Only styling changed.', estimatedSeconds: 0, phases: [] },
            { ...plan, phases: Array.from({ length: 12 }, (_, i) => ({ ...phase, id: `phase-${i}`, prerequisiteIds: i ? [`phase-${i - 1}`] : [] })) }]) {
            await provider((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(envelope(value)); }, async baseUrl => {
                expect(await adapter({ ...options, baseUrl }).plan(input)).to.deep.equal(value);
            });
        }
    });

    it('rejects observed grounding and oversized teaching text', async () => {
        for (const value of [{ explanation: 'I inspected your source.', groundingStatus: 'observed' },
            { explanation: 'x'.repeat(4001), groundingStatus: 'conceptual' }]) {
            await provider((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(envelope(value)); }, async baseUrl => {
                await failure(adapter({ ...options, baseUrl }).teach({ ...input, plan, phaseId: 'queues', detail: 'standard' }), 'GEMINI_INVALID_OUTPUT', true);
            });
        }
    });

    it('rejects expanded explanations that exceed the focused 100-word budget', async () => {
        await provider((_req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(envelope({ explanation: Array(101).fill('concept').join(' '), groundingStatus: 'conceptual' }));
        }, async baseUrl => {
            await failure(adapter({ ...options, baseUrl }).teach({ ...input, plan, phaseId: 'queues', detail: 'expanded' }), 'GEMINI_INVALID_OUTPUT', true);
        });
    });

    it('sends the requested expanded mode as trusted instruction and mode-specific schema guidance', async () => {
        await provider((req, res) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const request = JSON.parse(body);
                const description = request.generationConfig.responseJsonSchema.properties.explanation.description;
                const bounded = description?.includes('50-100 words')
                    && request.systemInstruction.parts[0].text.includes('REQUESTED DETAIL: expanded');
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(envelope({ explanation: Array(bounded ? 70 : 101).fill('concept').join(' '), groundingStatus: 'conceptual' }));
            });
        }, async baseUrl => {
            const result = await adapter({ ...options, baseUrl }).teach({ ...input, plan, phaseId: 'queues', detail: 'expanded' });
            expect(result.explanation.split(/\s+/u)).to.have.length(70);
        });
    });

    it('limits simultaneous generations and frees capacity after a failure', async () => {
        const pending: ServerResponse[] = [];
        await provider((_req, res) => { pending.push(res); }, async baseUrl => {
            const service = adapter({ ...options, baseUrl });
            const first = service.plan(input);
            const second = service.plan(input);
            await failure(service.plan(input), 'GEMINI_BUSY', true);
            while (pending.length < 2) { await new Promise(resolve => setTimeout(resolve, 2)); }
            for (const res of pending) { res.writeHead(503); res.end(); }
            await Promise.all([failure(first, 'GEMINI_UNAVAILABLE', true), failure(second, 'GEMINI_UNAVAILABLE', true)]);
            const next = service.plan(input);
            while (pending.length < 3) { await new Promise(resolve => setTimeout(resolve, 2)); }
            pending[2].writeHead(200, { 'content-type': 'application/json' }); pending[2].end(envelope(plan));
            expect(await next).to.deep.equal(plan);
        });
    });

    it('does not follow redirects carrying a credential', async () => {
        let redirected = 0;
        await provider((_req, res) => { redirected++; res.end(); }, async destination => {
            await provider((_req, res) => { res.writeHead(307, { location: destination }); res.end(); }, async baseUrl => {
                await failure(adapter({ ...options, baseUrl }).plan(input), 'GEMINI_UNAVAILABLE', true);
            });
        });
        expect(redirected).to.equal(0);
    });
});
