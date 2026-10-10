/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PhaseSchema } from '@goldie/contracts';
import { z } from 'zod';

const TextSchema = z.string().min(1).max(4000);
const LessonSchema = z.object({
    id: z.literal('webapp-architecture'),
    version: z.number().int().positive(),
    estimatedSeconds: z.number().int().positive(),
    phases: z.array(PhaseSchema.extend({
        explanation: TextSchema,
        expanded: TextSchema,
        deeperQuestion: TextSchema
    }).strict()).min(1),
    questions: z.array(z.object({
        id: z.string().min(1),
        question: TextSchema,
        aliases: z.array(TextSchema).min(1),
        answer: TextSchema
    }).strict()).min(1),
    deeperAliases: z.array(TextSchema).min(1),
    unsupportedAnswer: TextSchema
}).strict();

// Compiled service lives at backend/lib/src; the fixture stays reviewable JSON.
export const lesson = LessonSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../reference/lesson.json'), 'utf8')));

export function normalizeQuestion(question: string): string {
    return question.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function contentId(text: string): string {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}
