// Local client QA only. This server does not generate ElevenLabs speech or AI decisions.
// Run explicitly with node scripts/goldie-stage1/fixture-server.cjs; never used by backend:start.
const http = require('node:http');
const phases = [
    { id: 'purpose', title: 'Why authentication matters', objective: 'Separate identity from access.', description: 'Who is this user, and what may they do?' },
    { id: 'sessions', title: 'Sessions and access control', objective: 'Understand signed-in state.', description: 'A session remembers identity; authorization checks access.' },
    { id: 'architecture', title: 'Where auth fits', objective: 'Protect workspace routes on the server.', description: 'Client navigation is convenient; server checks enforce access.' }
];
const explanations = {
    purpose: 'Authentication establishes who someone is. Authorization decides whether that person can open a workspace. Your team app needs both checks.',
    sessions: 'A session connects requests to a signed-in identity. Check membership before returning workspace data; hiding a button alone does not protect it.',
    architecture: 'Put access checks beside server routes and data reads. The browser can guide navigation, while the server protects the actual workspace data.'
};
// Quiet ten-second tone proves browser playback and interruption; it is not spoken provider audio.
const rate = 8000, samples = rate * 10;
const wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i * 2 * Math.PI * 220 / rate) * 500), 44 + i * 2);
let count = 0;
let failTeach = process.argv.includes('--fail-teach-once');
let failSpeech = process.argv.includes('--fail-speech-once');
const server = http.createServer(async (req, res) => {
    let data = ''; for await (const chunk of req) data += chunk;
    const input = data ? JSON.parse(data) : {};
    console.log(req.method, req.url);
    const json = body => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && req.url === '/health') return json({ ok: true });
    if (req.method !== 'POST') { res.writeHead(404); return res.end(); }
    switch (req.url) {
        case '/api/offer': return json({ shouldOffer: true, offerId: 'fixture-offer', previewTopics: phases.map(p => p.title) });
        case '/api/sessions': return json({ sessionId: `fixture-session-${++count}`, snapshotRevision: input.revision, phases });
        case '/api/teach':
            if (failTeach) { failTeach = false; res.writeHead(503); return res.end(); }
            return json({ explanation: explanations[input.phaseId], groundingStatus: 'conceptual' });
        case '/api/ask': return json({ kind: 'answer', answer: 'A session remembers who signed in. Authorization still checks whether that user belongs to the requested workspace on every protected server request.', resumePhaseId: input.phaseId });
        case '/api/speech':
            if (failSpeech) { failSpeech = false; res.writeHead(503); return res.end(); }
            res.writeHead(200, { 'Content-Type': 'audio/wav' }); return res.end(wav);
        case '/api/complete':
            console.log('completion statuses', JSON.stringify(input.learningState));
            return json({ recap: 'You explored authentication and access control. Your phase status below records what you heard, skipped, or said was familiar. Keep server-side workspace checks in mind.', lastEvaluatedRevision: input.currentRevision });
        default: res.writeHead(404); res.end();
    }
});
server.listen(8788, '127.0.0.1', () => console.log('TEST ONLY Goldie client fixture on 127.0.0.1:8788; audio is a tone, not ElevenLabs.'));
