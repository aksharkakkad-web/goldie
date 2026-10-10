/********************************************************************************
 * Copyright (C) 2026 Akshar Kakkad and others.
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export class ApiError extends Error {
    constructor(public statusCode: number, public code: string, message: string, public retryable = false) {
        super(message);
        this.name = 'ApiError';
    }
}
