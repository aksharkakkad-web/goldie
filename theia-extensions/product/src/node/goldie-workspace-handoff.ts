// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { createHash } from 'crypto';
import { constants, Stats } from 'fs';
import { lstat, open, realpath, stat } from 'fs/promises';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';
import { TextDecoder } from 'util';
import { ApplicationError } from '@theia/core/lib/common/application-error';
import { GOLDIE_NONRETRYABLE_ERROR_CODE, GOLDIE_RETRYABLE_ERROR_CODE, GoldieWorkspaceHandoff } from '../common/goldie-service';

const MAX_BYTES = 128000;
const MAX_CHARACTERS = 32000;
const MAX_JSON_BYTES = 64 * 1024 - 1024;
const REQUIRED_SECTIONS = [
    'Project overview / existing architecture',
    'Requirements and user prompts (chronological; IDs)',
    'Implementation plan and dependencies',
    'Architectural decisions and tradeoffs',
    'Current implementation state',
    'Affected components and relevant file pointers',
    'Milestone history / changes since prior revision'
];

function invalid(message: string, changed = false): Error {
    return ApplicationError.fromJson(changed ? GOLDIE_RETRYABLE_ERROR_CODE : GOLDIE_NONRETRYABLE_ERROR_CODE,
        { message, data: { apiCode: changed ? 'HANDOFF_CHANGED' : 'HANDOFF_INVALID' }, stack: 'Goldie workspace handoff inspection failed.' });
}

function sameIdentity(first: Stats, second: Stats): boolean {
    return first.dev === second.dev && first.ino === second.ino;
}

function sameContent(first: Stats, second: Stats): boolean {
    return sameIdentity(first, second) && first.size === second.size && first.mtimeMs === second.mtimeMs && first.ctimeMs === second.ctimeMs;
}

function normalized(value: string): string {
    return value.replace(/\s+/g, '').toLowerCase();
}

function validIso(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/i.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) { return false; }
    const [, year, month, day, hour, minute, second, , offsetHour = '0', offsetMinute = '0'] = match;
    const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    return Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= days
        && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60 && Number(offsetHour) < 24 && Number(offsetMinute) < 60;
}

function parseHandoff(handoff: string): { revision: number; name: string } {
    // Ignore fenced examples when checking the document's actual metadata/headings.
    let fence: string | undefined;
    const lines = handoff.split(/\r?\n/).map(line => {
        const literal = !!fence;
        const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
        if (marker && (!fence || marker[0] === fence[0] && marker.length >= fence.length)) {
            fence = fence ? undefined : marker;
            return { text: line, literal: true };
        }
        return { text: line, literal };
    });
    const structuralLines = lines.filter(line => !line.literal).map(line => line.text);
    const titles = structuralLines.filter(line => /^\s*#\s+Goldie\s+Handoff\s*#*\s*$/i.test(line));
    const fields = (key: string): string[] => structuralLines.map(line => new RegExp(`^\\s*${key}\\s*:\\s*(.*?)\\s*$`, 'i').exec(line)?.[1])
        .filter((value): value is string => value !== undefined);
    const revisions = fields('Revision');
    const projects = fields('Project');
    const updated = fields('Updated');
    const revision = Number(revisions[0]);
    if (titles.length !== 1 || revisions.length !== 1 || !/^[1-9]\d*$/.test(revisions[0]) || !Number.isSafeInteger(revision)
        || projects.length !== 1 || !projects[0].trim() || projects[0].length > 200 || updated.length !== 1 || !validIso(updated[0])) {
        throw invalid('The handoff needs a Goldie Handoff title, one positive Revision, a Project name, and a valid ISO Updated time.');
    }
    const sections = new Map<string, string[]>();
    let section: string | undefined;
    for (const line of lines) {
        const heading = line.literal ? undefined : /^\s*(#{1,2})\s+(.+?)\s*#*\s*$/.exec(line.text);
        if (heading) {
            section = heading[1] === '##' ? normalized(heading[2]) : undefined;
            if (section) {
                if (sections.has(section)) { throw invalid('The handoff has duplicate sections. Keep each required section once.'); }
                sections.set(section, []);
            }
        } else if (section) { sections.get(section)!.push(line.text); }
    }
    if (REQUIRED_SECTIONS.some(title => !sections.get(normalized(title))?.join('\n').trim())) {
        throw invalid('The handoff needs all seven required Goldie sections with engineering context.');
    }
    // Reject literal credentials before text can enter a renderer or teaching request.
    if (/\bsk-[A-Za-z0-9_-]{12,}|\bAIza[A-Za-z0-9_-]{20,}/.test(handoff)
        || /\b(?:api[_ -]?key|password|(?:access[_ -]?|refresh[_ -]?)?token)\b["']?\s*[:=]\s*["']?[^\s"'`,;{}]{4,}/i.test(handoff)) {
        throw invalid('The handoff appears to contain a credential. Remove credentials before loading context.');
    }
    return { revision, name: projects[0].trim() };
}

/** Bounded local inspection of one canonical file; no scan, generation, HTTP, or source retrieval. */
export async function inspectGoldieWorkspaceHandoff(rootUri: string): Promise<GoldieWorkspaceHandoff> {
    let root: string;
    let rootStat: Stats;
    try {
        if (typeof rootUri !== 'string' || rootUri.length > 8192) { throw new Error(); }
        const parsed = new URL(rootUri);
        if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash) { throw new Error(); }
        root = await realpath(fileURLToPath(parsed));
        rootStat = await stat(root);
        if (!rootStat.isDirectory()) { throw new Error(); }
    } catch { throw invalid('Open an accessible local project folder to inspect its Goldie handoff.'); }

    const base: GoldieWorkspaceHandoff = {
        projectId: `goldie-workspace-${createHash('sha256').update(root).digest('hex').slice(0, 32)}`,
        name: basename(root) || 'Workspace', kind: 'missing'
    };
    const directory = join(root, '.goldie');
    const filename = join(directory, 'HANDOFF.md');
    let file;
    try {
        let directoryStat: Stats;
        try { directoryStat = await lstat(directory); } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return base; }
            throw error;
        }
        if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || await realpath(directory) !== directory) {
            throw invalid('Keep .goldie as a regular folder inside this workspace.');
        }
        let pathStat: Stats;
        try { pathStat = await lstat(filename); } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return base; }
            throw error;
        }
        if (!pathStat.isFile() || pathStat.isSymbolicLink()) { throw invalid('Keep HANDOFF.md as a regular file inside .goldie.'); }
        // NOFOLLOW rejects leaf swaps; NONBLOCK prevents a substituted pipe from blocking.
        file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const before = await file.stat();
        const unchangedPath = async (): Promise<boolean> => {
            const [currentRoot, currentDirectory, currentFile, resolvedDirectory, resolvedFile] = await Promise.all([
                lstat(root), lstat(directory), lstat(filename), realpath(directory), realpath(filename)
            ]);
            return currentRoot.isDirectory() && sameIdentity(rootStat, currentRoot)
                && currentDirectory.isDirectory() && sameIdentity(directoryStat, currentDirectory)
                && currentFile.isFile() && sameContent(before, currentFile) && resolvedDirectory === directory && resolvedFile === filename;
        };
        if (!before.isFile() || !sameContent(pathStat, before) || !await unchangedPath()) {
            throw invalid('The handoff changed while being read. Retry after the update finishes.', true);
        }
        if (before.size > MAX_BYTES) { throw invalid('The handoff is too large. Use at most 32,000 characters and 128,000 bytes.'); }
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        let total = 0;
        while (total < buffer.length) {
            const result = await file.read(buffer, total, buffer.length - total, total);
            if (!result.bytesRead) { break; }
            total += result.bytesRead;
        }
        if (total > MAX_BYTES) { throw invalid('The handoff is too large. Use at most 32,000 characters and 128,000 bytes.'); }
        if (!sameContent(before, await file.stat()) || total !== before.size || !await unchangedPath()) {
            throw invalid('The handoff changed while being read. Retry after the update finishes.', true);
        }
        let handoff: string;
        try { handoff = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, total)); } catch {
            throw invalid('Save the handoff as UTF-8 Markdown, then retry.');
        }
        if (handoff.length > MAX_CHARACTERS || Buffer.byteLength(JSON.stringify({ ...base, handoff })) > MAX_JSON_BYTES) {
            throw invalid('The handoff is too large to send safely. Shorten it and retry.');
        }
        const { revision, name } = parseHandoff(handoff);
        return { ...base, kind: 'ready', revision, name, handoff, fingerprint: createHash('sha256').update(handoff).digest('hex') };
    } catch (error) {
        if (ApplicationError.is(error)) { throw error; }
        throw invalid('The workspace handoff could not be read safely. Check .goldie/HANDOFF.md and retry.');
    } finally {
        // A close failure must not replace a sanitized error with an absolute filesystem path.
        await file?.close().catch(() => undefined);
    }
}
