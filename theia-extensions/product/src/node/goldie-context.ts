// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { constants } from 'fs';
import { open } from 'fs/promises';
import { basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { TextDecoder } from 'util';
import { ApplicationError } from '@theia/core/lib/common/application-error';
import { GOLDIE_NONRETRYABLE_ERROR_CODE, GoldieHandoff } from '../common/goldie-service';

const MAX_BYTES = 128000;
const MAX_CHARACTERS = 32000;

function invalid(message: string): Error {
    return ApplicationError.fromJson(GOLDIE_NONRETRYABLE_ERROR_CODE,
        { message, data: { apiCode: 'HANDOFF_INVALID' }, stack: 'Goldie handoff selection failed.' });
}

/** Read one explicitly selected regular file. Never scans a folder, follows a link, or contacts HTTP. */
export async function loadGoldieHandoff(uri: string): Promise<GoldieHandoff> {
    let filename: string;
    try {
        if (typeof uri !== 'string' || uri.length > 8192) { throw new Error(); }
        const parsed = new URL(uri);
        if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash) { throw new Error(); }
        filename = fileURLToPath(parsed);
        if (!['.md', '.markdown'].includes(extname(filename).toLowerCase())) { throw new Error(); }
    } catch { throw invalid('Choose a local Markdown handoff file.'); }

    let file;
    try {
        // NONBLOCK avoids waiting on a named pipe; NOFOLLOW rejects symlink substitution.
        file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const stat = await file.stat();
        if (!stat.isFile()) { throw invalid('Choose a regular Markdown file, not a folder or link.'); }
        if (stat.size > MAX_BYTES) { throw invalid('The handoff is too large. Use at most 32,000 characters and 128,000 bytes.'); }
        const buffer = Buffer.alloc(MAX_BYTES + 1);
        let total = 0;
        while (total < buffer.length) {
            const result = await file.read(buffer, total, buffer.length - total, total);
            if (!result.bytesRead) { break; }
            total += result.bytesRead;
        }
        if (total > MAX_BYTES) { throw invalid('The handoff is too large. Use at most 32,000 characters and 128,000 bytes.'); }
        let handoff: string;
        try { handoff = new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, total)); } catch {
            throw invalid('Save the handoff as UTF-8 Markdown, then load it again.');
        }
        if (!handoff.trim()) { throw invalid('The handoff is empty. Add the task and engineering context first.'); }
        if (handoff.length > MAX_CHARACTERS) { throw invalid('The handoff is too large. Use at most 32,000 characters.'); }
        return { handoff, name: basename(filename) };
    } catch (error) {
        if (ApplicationError.is(error)) { throw error; }
        throw invalid('The handoff could not be read. Choose an accessible regular Markdown file, then try again.');
    } finally { await file?.close(); }
}
