// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { inject, injectable } from '@theia/core/shared/inversify';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { CodexFrontendService } from '@theia/ai-codex/lib/browser/codex-frontend-service';
import type { CodexRequest } from '@theia/ai-codex/lib/common/codex-service';
import type { ThreadEvent } from '@openai/codex-sdk';
import { GoldieWorkspaceConnection } from './goldie-workspace-connection';
import { goldieCodexPrompt } from './goldie-codex-policy';

/** Preserve upstream Codex streaming; add the opt-in policy through an extension seam. */
@injectable()
export class GoldieCodexFrontendService extends CodexFrontendService {
    @inject(GoldieWorkspaceConnection) protected readonly goldie: GoldieWorkspaceConnection;

    async send(request: CodexRequest, cancellationToken?: CancellationToken): Promise<AsyncIterable<ThreadEvent>> {
        const roots = await this.workspaceService.roots;
        const rootUri = roots[0]?.resource.toString();
        const connected = this.goldie.state.connected && rootUri === this.goldie.state.workspaceUri;
        const projectId = this.goldie.connectedProjectId;
        // Read-only requests cannot satisfy an instruction to write a handoff.
        if (!connected || !rootUri || !projectId || request.sandboxMode === 'read-only') { return super.send(request, cancellationToken); }
        const workingDirectory = FileUri.fsPath(rootUri);
        if (request.options?.workingDirectory && request.options.workingDirectory !== workingDirectory) { return super.send(request, cancellationToken); }
        const prompt = goldieCodexPrompt(request.prompt, globalThis.crypto.randomUUID(), this.goldie.state.revision ?? 0);
        this.goldie.promptStarted(rootUri);
        const model = this.preferenceService.get<string>('goldie.codexModel')?.trim();
        const options = { ...request.options, workingDirectory, ...(model && !request.options?.model ? { model } : {}) };
        // Upstream caches the first directory by session ID. Keep native chats safe across workspace navigation.
        const sessionId = request.sessionId ? `${request.sessionId}:goldie:${projectId}` : undefined;
        let stream: AsyncIterable<ThreadEvent>;
        try {
            stream = await super.send({ ...request, sessionId, options, prompt }, cancellationToken);
        } catch (error) {
            this.goldie.promptFinished(rootUri);
            throw error;
        }
        const connection = this.goldie;
        return {
            async *[Symbol.asyncIterator](): AsyncIterator<ThreadEvent> {
                try { for await (const event of stream) { yield event; } }
                finally { connection.promptFinished(rootUri); }
            }
        };
    }
}
