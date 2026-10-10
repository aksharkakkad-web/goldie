/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError } from './errors';

/** One backend process owns this file. Failed writes never commit in-memory state. */
export class JsonStore<T> {
    private pending: Promise<unknown> = Promise.resolve();

    private constructor(private filename: string, private state: T, private validate: (value: unknown) => T) { }

    static async open<T>(directory: string, initial: T, validate: (value: unknown) => T): Promise<JsonStore<T>> {
        const filename = join(directory, 'sessions.json');
        try {
            await mkdir(directory, { recursive: true, mode: 0o700 });
            let state: T;
            try {
                state = validate(JSON.parse(await readFile(filename, 'utf8')));
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw new ApiError(500, 'STORE_CORRUPT', 'Local lesson state could not be read. Preserve the data file and repair it before restarting.');
                }
                state = validate(initial);
            }
            return new JsonStore(filename, state, validate);
        } catch (error) {
            if (error instanceof ApiError) { throw error; }
            throw new ApiError(503, 'STORE_UNAVAILABLE', 'Local lesson storage is unavailable.', true);
        }
    }

    async read(): Promise<T> {
        await this.pending;
        return structuredClone(this.state);
    }

    mutate<R>(operation: (state: T) => R): Promise<R> {
        const work = this.pending.then(async () => {
            const next = structuredClone(this.state);
            const result = operation(next);
            this.validate(next);
            const temporary = `${this.filename}.${randomUUID()}.tmp`;
            try {
                await writeFile(temporary, JSON.stringify(next), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
                await rename(temporary, this.filename);
                this.state = next;
            } catch {
                await unlink(temporary).catch(() => undefined);
                throw new ApiError(503, 'STORE_UNAVAILABLE', 'Local lesson state could not be saved.', true);
            }
            return structuredClone(result);
        });
        this.pending = work.catch(() => undefined);
        return work;
    }
}
