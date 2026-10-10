import { expect } from 'chai';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

describe('GET /health', () => {
    it('returns the exact shared health contract', async () => {
        const app = await buildApp(loadConfig({}));
        const response = await app.inject({ method: 'GET', url: '/health' });
        await app.close();
        expect(response.statusCode).to.equal(200);
        expect(response.json()).to.deep.equal({ ok: true });
    });

    it('allows only the configured local origin', async () => {
        const app = await buildApp(loadConfig({
            GOLDIE_ALLOWED_ORIGIN: 'http://127.0.0.1:3000'
        }));
        const allowed = await app.inject({
            method: 'GET',
            url: '/health',
            headers: { origin: 'http://127.0.0.1:3000' }
        });
        const rejected = await app.inject({
            method: 'GET',
            url: '/health',
            headers: { origin: 'https://attacker.example' }
        });
        await app.close();
        expect(allowed.headers['access-control-allow-origin']).to.equal('http://127.0.0.1:3000');
        expect(rejected.headers['access-control-allow-origin']).to.equal(undefined);
    });
});
