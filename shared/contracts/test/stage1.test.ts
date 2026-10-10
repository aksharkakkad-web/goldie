// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { expect } from 'chai';
import {
    OfferRequestSchema, SessionActionRequestSchema, SessionStateSchema,
    SpeechRequestSchema, SpeechResponseSchema, TeachResponseSchema, AskResponseSchema
} from '../src';

describe('Stage 1 contracts', () => {
    it('requires accepted content IDs instead of accepting arbitrary billable text', () => {
        expect(SpeechRequestSchema.safeParse({ text: 'Unapproved content' }).success).to.equal(false);
        expect(SpeechRequestSchema.parse({ sessionId: 's1', contentId: 'frontend-v1' }))
            .to.deep.equal({ sessionId: 's1', contentId: 'frontend-v1' });
    });

    it('identifies the reference lesson explicitly without parsing arbitrary handoffs', () => {
        expect(OfferRequestSchema.parse({ projectId: 'p1', revision: 1, referenceLessonId: 'webapp-architecture' }))
            .to.deep.include({ handoff: '', referenceLessonId: 'webapp-architecture' });
        expect(OfferRequestSchema.safeParse({ projectId: 'p1', revision: 1, referenceLessonId: 'arbitrary-repo' }).success)
            .to.equal(false);
    });

    it('requires a target phase for phase actions but not for pause/resume', () => {
        expect(SessionActionRequestSchema.parse({ actionId: 'a1', action: 'pause' }).action).to.equal('pause');
        for (const action of ['skip', 'already_know', 'phase_completed']) {
            expect(SessionActionRequestSchema.safeParse({ actionId: 'a1', action }).success).to.equal(false);
            expect(SessionActionRequestSchema.safeParse({ actionId: 'a1', action, phaseId: 'frontend' }).success).to.equal(true);
        }
    });

    it('keeps roadmap length variable and self-reported familiarity separate', () => {
        const state = SessionStateSchema.parse({
            sessionId: 's1', projectId: 'p1', snapshotRevision: 1, status: 'learning', phases: [],
            completedIds: [], skippedIds: [], alreadyKnowIds: [], lastEvaluatedRevision: 1, questionHistory: []
        });
        expect(state.phases).to.have.length(0);
        expect(state.completedIds).to.deep.equal([]);
        expect(state.alreadyKnowIds).to.deep.equal([]);
    });

    it('gives lesson and answer text stable speech references', () => {
        expect(TeachResponseSchema.parse({ explanation: 'A frontend shows the interface.', groundingStatus: 'conceptual', contentId: 'c1' }))
            .to.have.property('contentId', 'c1');
        expect(AskResponseSchema.parse({ kind: 'answer', answer: 'An API is a contract.', resumePhaseId: 'frontend', contentId: 'c2' }))
            .to.have.property('contentId', 'c2');
    });

    it('limits audio identifiers to opaque hashes and declares the MIME type', () => {
        const audioId = 'a'.repeat(64);
        expect(SpeechResponseSchema.parse({ audioId, audioUrl: '/api/audio/' + audioId, mimeType: 'audio/mpeg' }))
            .to.have.property('mimeType', 'audio/mpeg');
        expect(SpeechResponseSchema.safeParse({ audioId: '../secret', audioUrl: '/api/audio/../secret', mimeType: 'audio/mpeg' }).success)
            .to.equal(false);
    });
});
