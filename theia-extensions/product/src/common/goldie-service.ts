/********************************************************************************
 * Copyright (C) 2026 Goldie contributors.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

export const GoldieService = Symbol('GoldieService');
export const GOLDIE_SERVICE_PATH = '/services/goldie';

export interface GoldieHealth {
    connected: boolean;
    message: string;
}

/** Local IDE transport only. Teaching and provider keys belong to the teaching backend. */
export interface GoldieService {
    checkHealth(): Promise<GoldieHealth>;
}
