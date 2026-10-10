/********************************************************************************
 * Copyright (C) 2026 Goldie contributors.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as http from 'http';
import { HealthResponseSchema } from '@goldie/contracts';
import { GoldieHealth } from '../common/goldie-service';

/** Bounded, local-only health check. Never accepts a URL from the renderer. */
export async function checkGoldieHealth(address: string, timeoutMs = 5000): Promise<GoldieHealth> {
    let endpoint: URL;
    try {
        endpoint = new URL(address);
        if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
            || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
            throw new Error('Invalid local address');
        }
        endpoint.pathname = '/health';
    } catch {
        return { connected: false, message: 'Set GOLDIE_BACKEND_URL to a local HTTP address, then restart the IDE.' };
    }
    return new Promise(resolve => {
        let finished = false;
        const finish = (result: GoldieHealth): void => {
            if (!finished) {
                finished = true;
                clearTimeout(timer);
                resolve(result);
            }
        };
        const request = http.get(endpoint, response => {
            if (response.statusCode !== 200) {
                finish({ connected: false, message: 'The teaching service returned an error. Retry when it is ready.' });
                response.destroy();
                return;
            }
            let body = '';
            let bytes = 0;
            response.on('data', (chunk: Buffer) => {
                bytes += chunk.length;
                if (bytes > 4096) {
                    finish({ connected: false, message: 'The teaching service returned an invalid health response.' });
                    response.destroy();
                } else {
                    body += chunk.toString('utf8');
                }
            });
            response.on('end', () => {
                try {
                    const payload: unknown = JSON.parse(body);
                    if (HealthResponseSchema.safeParse(payload).success) {
                        finish({ connected: true, message: 'The teaching service is reachable. Lessons and voice come next.' });
                        return;
                    }
                } catch { /* Invalid JSON is an unavailable service. */ }
                finish({ connected: false, message: 'The teaching service returned an invalid health response.' });
            });
            response.on('error', () => finish({ connected: false, message: 'The teaching service disconnected. Try again.' }));
        });
        const timer = setTimeout(() => {
            finish({ connected: false, message: 'The teaching service took too long to respond. Try again.' });
            request.destroy();
        }, timeoutMs);
        request.on('error', () => finish({ connected: false, message: 'Your editor still works. Start the teaching service, then retry.' }));
    });
}
