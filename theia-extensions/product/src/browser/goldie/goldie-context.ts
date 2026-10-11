// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
export type KnowledgeLevel = 'beginner' | 'intermediate';
export interface GoldieContextSnapshot {
    readonly projectId: string;
    readonly revision: number;
    readonly handoff: string;
    readonly profile: Readonly<{ level: KnowledgeLevel }>;
    readonly name: string;
}
export const GOLDIE_PROJECT_ID = 'goldie-stage2-sample';
export const GOLDIE_HANDOFF_MAX_LENGTH = 32000;
export function createGoldieContext(handoff: string, level: KnowledgeLevel, revision: number, name = 'Sample handoff', projectId = GOLDIE_PROJECT_ID): GoldieContextSnapshot {
    if (typeof handoff !== 'string' || !handoff.trim() || handoff.length > GOLDIE_HANDOFF_MAX_LENGTH) {
        throw new Error(`Load a non-empty handoff of at most ${GOLDIE_HANDOFF_MAX_LENGTH} characters.`);
    }
    if (level !== 'beginner' && level !== 'intermediate') { throw new Error('Choose beginner or intermediate.'); }
    if (!Number.isSafeInteger(revision) || revision < 1) { throw new Error('The context revision is invalid.'); }
    if (typeof name !== 'string' || !name.trim() || name.length > 200) { throw new Error('The handoff name must contain 1–200 characters.'); }
    if (projectId !== GOLDIE_PROJECT_ID && !/^goldie-workspace-[a-f0-9]{32}$/.test(projectId)) { throw new Error('The workspace identity is invalid.'); }
    const request = { projectId, revision, handoff, profile: { level } };
    if (new TextEncoder().encode(JSON.stringify(request)).byteLength > 64 * 1024 - 1024) {
        throw new Error('This handoff is too large to send safely. Shorten it and load it again.');
    }
    return Object.freeze({ projectId, revision, handoff, profile: Object.freeze({ level }), name });
}
export function parseGoldieContext(value: unknown): GoldieContextSnapshot {
    if (!value || typeof value !== 'object') { throw new Error('Saved handoff context is invalid.'); }
    const snapshot = value as GoldieContextSnapshot;
    if (typeof snapshot.projectId !== 'string' || !snapshot.profile || typeof snapshot.profile !== 'object') {
        throw new Error('Saved handoff context is invalid.');
    }
    return createGoldieContext(snapshot.handoff, snapshot.profile.level, snapshot.revision, snapshot.name, snapshot.projectId);
}
