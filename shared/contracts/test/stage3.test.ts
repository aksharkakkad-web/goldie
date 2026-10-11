// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import * as contracts from '../src';
import { z } from 'zod';

describe('Stage 3 contracts', () => {
    it('accepts a stable question intent ID without requiring it from old clients', () => {
        const input = { sessionId: 's', phaseId: 'p', question: 'Why?', requestId: 'voice-1' };
        expect(contracts.AskRequestSchema.safeParse(input).success).to.equal(true);
        expect(contracts.AskRequestSchema.safeParse({ sessionId: 's', phaseId: 'p', question: 'Why?' }).success).to.equal(true);
    });
    it('bounds practice to three to five distinct prompts with model answers and rejects student responses', () => {
        const schema = (contracts as unknown as Record<string, z.ZodType>).PracticeBatchSchema;
        expect(schema).not.to.equal(undefined);
        const questions = [1, 2, 3].map(n => ({ id: `q${n}`, question: `Why ${n}?`, modelAnswer: `Reason ${n}` }));
        const batch = { practiceId: 'practice', phaseId: 'p', questions };
        expect(schema.safeParse(batch).success).to.equal(true);
        for (const value of [{ ...batch, questions: questions.slice(1) }, { ...batch, questions: [...questions, ...questions] },
            { ...batch, studentResponse: 'private' }, { ...batch, questions: questions.map(q => ({ ...q, question: 'same' })) }]) {
            expect(schema.safeParse(value).success).to.equal(false);
        }
    });
    it('accepts bounded WebM input only and does not accept a caller duration as evidence', () => {
        const schema = (contracts as unknown as Record<string, z.ZodType>).TranscribeRequestSchema;
        expect(schema).not.to.equal(undefined);
        const input = { sessionId: 's', phaseId: 'p', requestId: 'r', mimeType: 'audio/webm', dataBase64: 'GkXfow==' };
        expect(schema.safeParse(input).success).to.equal(true);
        for (const value of [{ ...input, mimeType: 'audio/wav' }, { ...input, duration: 5 }, { ...input, dataBase64: 'x'.repeat(3 * 1024 * 1024) }]) {
            expect(schema.safeParse(value).success).to.equal(false);
        }
    });
});
