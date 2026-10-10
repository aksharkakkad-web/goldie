/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { expect } from 'chai';
import {
    AskRequestSchema,
    HealthResponseSchema,
    SessionResponseSchema,
    SourceExcerptSchema
} from '../src';

describe('Goldie API contracts', () => {
    it('accepts only the exact successful health payload', () => {
        expect(HealthResponseSchema.parse({ ok: true })).to.deep.equal({ ok: true });
        expect(() => HealthResponseSchema.parse({ ok: false })).to.throw();
        expect(() => HealthResponseSchema.parse({ ok: true, provider: 'ready' })).to.throw();
    });

    it('rejects malformed revisions and phases without stable IDs', () => {
        expect(() => SessionResponseSchema.parse({
            sessionId: 'session-1',
            snapshotRevision: -1,
            phases: []
        })).to.throw();
        expect(() => SessionResponseSchema.parse({
            sessionId: 'session-1',
            snapshotRevision: 1,
            phases: [{ title: 'Sessions', objective: 'Understand access control', description: '...' }]
        })).to.throw();
    });

    it('rejects source excerpts whose line range runs backwards', () => {
        expect(() => SourceExcerptSchema.parse({
            path: 'src/auth.ts',
            startLine: 20,
            endLine: 10,
            content: 'example'
        })).to.throw();
    });

    it('accepts a typed ask request without source evidence', () => {
        expect(AskRequestSchema.parse({
            sessionId: 'session-1',
            phaseId: 'phase-1',
            question: 'Why use sessions?',
            handoff: '# Goldie Handoff'
        })).to.deep.include({ phaseId: 'phase-1' });
    });
});
