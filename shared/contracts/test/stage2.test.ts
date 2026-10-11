// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import * as contracts from '../src';
import { z } from 'zod';

describe('Stage 2 teaching profile', () => {
    const schema = (): z.ZodType => {
        const value = (contracts as unknown as Record<string, z.ZodType>).TeachingProfileSchema;
        expect(value, 'a normalized, allowlisted teaching profile is available').not.to.equal(undefined);
        return value;
    };
    it('defaults a missing baseline and strips unrelated private profile fields', () => {
        expect(schema().parse({ privateNotes: 'not approved for forwarding' }))
            .to.deep.equal({ level: 'beginner', knownConcepts: [] });
        expect(schema().parse({ level: 'intermediate', knownConcepts: [' API ', 'database'], token: 'secret' }))
            .to.deep.equal({ level: 'intermediate', knownConcepts: ['API', 'database'] });
    });
    it('rejects invalid levels and unbounded or empty familiarity claims', () => {
        for (const input of [{ level: 'expert' }, { knownConcepts: [''] }, { knownConcepts: ['a'.repeat(201)] },
            { knownConcepts: Array(101).fill('api') }, { level: 42 }]) {
            expect(schema().safeParse(input).success).to.equal(false);
        }
    });
});
