/********************************************************************************
 * Copyright (C) 2026 Goldie contributors.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import type {
    OfferRequest, OfferResponse, SessionRequest, SessionResponse, TeachRequest, TeachResponse,
    AskRequest, AskResponse, CompleteRequest, CompleteResponse, SpeechRequest, SessionActionRequest,
    PracticeBatch, TranscribeRequest, TranscribeResponse
} from '@goldie/contracts';

export const GoldieService = Symbol('GoldieService');
export const GOLDIE_SERVICE_PATH = '/services/goldie';
/** Theia ApplicationError codes survive Node/RPC serialization. */
export const GOLDIE_NONRETRYABLE_ERROR_CODE = -32001;
export const GOLDIE_RETRYABLE_ERROR_CODE = -32002;

export interface GoldieHealth {
    connected: boolean;
    message: string;
}

export interface GoldieSpeech {
    mimeType: string;
    dataBase64: string;
}

export interface GoldieHandoff {
    handoff: string;
    name: string;
}

/** Local IDE transport only. Teaching and provider keys belong to the teaching backend. */
export interface GoldieService {
    /** Explicit local Markdown selection only; never sends the file to a provider. */
    loadHandoff(uri: string): Promise<GoldieHandoff>;
    checkHealth(): Promise<GoldieHealth>;
    offer(request: OfferRequest): Promise<OfferResponse>;
    startSession(request: SessionRequest): Promise<SessionResponse>;
    getSession(sessionId: string): Promise<SessionResponse>;
    action(sessionId: string, request: SessionActionRequest): Promise<SessionResponse>;
    teach(request: TeachRequest): Promise<TeachResponse>;
    ask(request: AskRequest): Promise<AskResponse>;
    transcribe(request: TranscribeRequest): Promise<TranscribeResponse>;
    getPractice(sessionId: string, phaseId: string): Promise<PracticeBatch | null>;
    generatePractice(sessionId: string, phaseId: string): Promise<PracticeBatch>;
    complete(request: CompleteRequest): Promise<CompleteResponse>;
    speech(request: SpeechRequest): Promise<GoldieSpeech>;
}
