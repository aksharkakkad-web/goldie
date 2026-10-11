// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import type { GoldieService, GoldieWorkspaceHandoff } from '../../common/goldie-service';
import { createGoldieContext } from './goldie-context';
import { GoldieLessonController } from './goldie-lesson-controller';

export interface GoldieWorkspaceState {
    readonly connected: boolean;
    readonly workspaceUri?: string;
    readonly workspaceName?: string;
    readonly revision?: number;
    readonly pendingRevision?: number;
    readonly error?: string;
    readonly status: string;
}
export interface GoldieWorkspaceEnvironment {
    roots(): Promise<string[]>;
    onOffer?(offerId: string, topics: readonly string[]): void;
    onRootsChanged(callback: () => void): () => void;
    watch(rootUri: string, callback: () => void): () => void;
    storage?: Pick<Storage, 'getItem' | 'setItem'>;
    schedule(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
    clear(timer: ReturnType<typeof setTimeout>): void;
}
interface SavedConnection { enabled: boolean; revision?: number; fingerprint?: string; }

/** One workspace/lesson owner survives widget closure. Watching metadata never creates agent reasoning. */
export class GoldieWorkspaceConnection {
    private current: GoldieWorkspaceState = { connected: false, status: 'Connect this project to learn from Codex updates.' };
    private readonly listeners = new Set<(state: GoldieWorkspaceState) => void>();
    private latest?: GoldieWorkspaceHandoff;
    private saved: SavedConnection = { enabled: false };
    private projectId?: string;
    private promptRevision?: number;
    private promptFinishedPending = false;
    private epoch = 0;
    private readEpoch = 0;
    private notifiedOfferId?: string;
    private started = false;
    private stopped = false;
    private timer?: ReturnType<typeof setTimeout>;
    private unwatch?: () => void;
    private unroots?: () => void;
    private readonly unlesson: () => void;

    constructor(private readonly service: GoldieService, public readonly lesson: GoldieLessonController,
        private readonly environment: GoldieWorkspaceEnvironment) {
        this.unlesson = lesson.subscribe(state => {
            this.publishPending();
            const offerId = state.view === 'offer' ? state.offer?.offerId : undefined;
            if (offerId && this.current.connected && state.context?.projectId === this.projectId && offerId !== this.notifiedOfferId) {
                this.notifiedOfferId = offerId;
                this.environment.onOffer?.(offerId, state.offer!.previewTopics);
            }
        });
    }
    get state(): GoldieWorkspaceState { return this.current; }
    get connectedProjectId(): string | undefined { return this.current.connected ? this.projectId : undefined; }
    subscribe(listener: (state: GoldieWorkspaceState) => void): () => void {
        this.listeners.add(listener); listener(this.current);
        return () => this.listeners.delete(listener);
    }
    async onStart(): Promise<void> {
        if (this.started) { return; }
        this.started = true;
        this.unroots = this.environment.onRootsChanged(() => { this.selectWorkspace(); });
        await this.lesson.restore();
        if (!this.stopped) { await this.selectWorkspace(); }
    }
    onStop(): void {
        this.stopped = true; this.epoch++; this.readEpoch++;
        this.stopWatching(); this.unroots?.(); this.unlesson(); this.lesson.dispose(); this.listeners.clear();
    }
    async connect(): Promise<void> {
        if (this.current.workspaceUri && !this.projectId) { await this.selectWorkspace(); }
        if (!this.current.workspaceUri || !this.projectId) {
            if (!this.current.error) { this.update({ error: 'Open a local project folder first.' }); }
            return;
        }
        this.saved.enabled = true;
        if (!this.persist()) { return; }
        this.update({ connected: true, error: undefined });
        this.startWatching();
        await this.inspect(true, true);
    }
    disconnect(): void {
        this.readEpoch++;
        this.saved.enabled = false; this.persist(); this.stopWatching();
        this.lesson.cancelWorkspaceOffer();
        this.update({ connected: false, error: undefined, status: 'Project disconnected. Codex continues without Goldie handoff instructions.' });
    }
    async learnLatest(): Promise<void> {
        if (!this.current.connected) { return; }
        const root = this.current.workspaceUri;
        const token = this.epoch;
        await this.inspect(false);
        if (!this.stopped && token === this.epoch && root === this.current.workspaceUri && this.current.connected && !this.current.error) {
            await this.evaluateLatest();
        }
    }
    /** The Codex adapter calls this before the real request. Never writes the handoff itself. */
    promptStarted(rootUri: string): void {
        if (!this.current.connected || rootUri !== this.current.workspaceUri) { return; }
        this.promptRevision = this.saved.revision ?? 0;
        this.promptFinishedPending = false;
        this.update({ error: undefined, status: 'Waiting for Codex to update .goldie/HANDOFF.md.' });
    }
    promptFinished(rootUri: string): void {
        if (!this.current.connected || rootUri !== this.current.workspaceUri) { return; }
        this.promptFinishedPending = true;
        this.scheduleInspection();
    }
    private async selectWorkspace(): Promise<void> {
        const token = ++this.epoch;
        this.readEpoch++; this.stopWatching();
        if (this.lesson.state.view === 'question') { this.lesson.cancelVoiceQuestion(); }
        this.lesson.cancelWorkspaceOffer();
        this.promptRevision = undefined; this.promptFinishedPending = false;
        this.latest = undefined; this.projectId = undefined; this.saved = { enabled: false };
        this.update({ connected: false, workspaceUri: undefined, workspaceName: undefined, revision: undefined,
            pendingRevision: undefined, error: undefined, status: 'Open a local project folder to connect Goldie.' });
        const roots = await this.environment.roots();
        if (this.stopped || token !== this.epoch) { return; }
        // Match the upstream Codex service: the first root is its working directory.
        const rootUri = roots[0];
        if (!rootUri) { return; }
        this.update({ workspaceUri: rootUri });
        try {
            const handoff = await this.service.inspectWorkspaceHandoff(rootUri);
            if (this.stopped || token !== this.epoch) { return; }
            this.projectId = handoff.projectId;
            try {
                const raw = this.environment.storage?.getItem(this.storageKey());
                if (raw) {
                    const saved = JSON.parse(raw);
                    if (typeof saved.enabled !== 'boolean' || (saved.revision !== undefined && (!Number.isSafeInteger(saved.revision) || saved.revision < 1))
                        || (saved.fingerprint !== undefined && !/^[a-f0-9]{64}$/.test(saved.fingerprint))) { throw new Error('Invalid saved connection'); }
                    this.saved = saved;
                }
            } catch {
                this.update({ error: 'Saved project connection is invalid. Reconnect this project.' });
                this.saved = { enabled: false };
            }
            this.update({ connected: this.saved.enabled, workspaceName: handoff.name });
            this.acceptInspection(handoff);
            if (this.current.connected) { this.startWatching(); }
            // Restoring connection reads context only. No offer/model/recording/playback here.
        } catch (error) { if (token === this.epoch) { this.report(error); } }
    }
    private startWatching(): void {
        if (this.unwatch || !this.current.workspaceUri) { return; }
        try {
            this.unwatch = this.environment.watch(this.current.workspaceUri, () => this.scheduleInspection());
        } catch { this.update({ error: 'Project watching failed. Reconnect or explicitly learn from the latest build.' }); }
    }
    private stopWatching(): void {
        this.unwatch?.(); this.unwatch = undefined;
        if (this.timer !== undefined) { this.environment.clear(this.timer); this.timer = undefined; }
    }
    private scheduleInspection(): void {
        this.readEpoch++;
        if (this.timer !== undefined) { this.environment.clear(this.timer); }
        this.timer = this.environment.schedule(() => { this.timer = undefined; this.inspect(true); }, 1000);
    }
    private async inspect(automatic: boolean, force = false): Promise<void> {
        const root = this.current.workspaceUri;
        if (!root || !this.current.connected) { return; }
        const token = ++this.readEpoch;
        try {
            const value = await this.service.inspectWorkspaceHandoff(root);
            if (this.stopped || token !== this.readEpoch || root !== this.current.workspaceUri || !this.current.connected) { return; }
            const changed = this.acceptInspection(value);
            if (this.promptFinishedPending && this.promptRevision !== undefined) {
                this.promptFinishedPending = false;
                if ((value.revision ?? 0) <= this.promptRevision && !this.current.error) {
                    this.update({ error: 'Codex finished without a newer handoff. Ask it to update .goldie/HANDOFF.md and increment Revision.' });
                }
            }
            if (automatic && (changed || force) && !this.current.error && this.lesson.state.view === 'idle') { await this.evaluateLatest(); }
        } catch (error) { if (token === this.readEpoch) { this.report(error); } }
    }
    private acceptInspection(value: GoldieWorkspaceHandoff): boolean {
        if (value.projectId !== this.projectId) { throw new Error('The workspace identity changed. Reconnect the project.'); }
        if (value.kind === 'missing') {
            this.latest = undefined;
            this.update({ error: undefined, revision: this.saved.revision, pendingRevision: undefined, status: 'Waiting for Codex to write .goldie/HANDOFF.md.' }); return false;
        }
        if (!value.revision || !value.fingerprint || !value.handoff) { throw new Error('The workspace handoff is incomplete. Ask Codex to repair it.'); }
        if (this.saved.revision !== undefined && (value.revision < this.saved.revision
            || (value.revision === this.saved.revision && value.fingerprint !== this.saved.fingerprint))) {
            this.update({ error: 'Handoff content changed without a newer Revision. Ask Codex to increment it before retrying.' }); return false;
        }
        const changed = value.revision !== this.saved.revision || value.fingerprint !== this.saved.fingerprint;
        this.latest = Object.freeze({ ...value });
        this.saved = { ...this.saved, revision: value.revision, fingerprint: value.fingerprint };
        if (!this.persist()) { return false; }
        this.update({ revision: value.revision, workspaceName: value.name, error: undefined,
            status: this.current.connected ? 'Watching Codex handoff updates.' : 'Connect this project to learn from Codex updates.' });
        this.publishPending(); return changed;
    }
    private async evaluateLatest(): Promise<void> {
        const latest = this.latest;
        if (!latest?.handoff || !latest.revision || !this.current.connected || !this.lesson.canChangeContext) { this.publishPending(); return; }
        try {
            const level = this.lesson.state.context?.profile.level ?? 'beginner';
            this.lesson.setWorkspaceContext(createGoldieContext(latest.handoff, level, latest.revision, latest.name, latest.projectId));
            this.publishPending();
            await this.lesson.checkOffer();
        } catch (error) { this.report(error); }
    }
    private publishPending(): void {
        if (this.stopped) { return; }
        const context = this.lesson.state.context;
        const pending = this.latest?.revision && (context?.projectId !== this.latest.projectId || context.revision !== this.latest.revision)
            ? this.latest.revision : undefined;
        this.update({ pendingRevision: pending });
    }
    private storageKey(): string { return `goldie.workspace-connection.v1.${this.projectId}`; }
    private persist(): boolean {
        try {
            if (!this.environment.storage) { throw new Error('Storage unavailable'); }
            this.environment.storage.setItem(this.storageKey(), JSON.stringify(this.saved)); return true;
        } catch { this.update({ connected: false, error: 'Goldie could not save this project connection. Enable local storage, then reconnect.' }); return false; }
    }
    private report(error: unknown): void { this.update({ error: error instanceof Error ? error.message : 'Goldie could not inspect this project handoff.' }); }
    private update(update: Partial<GoldieWorkspaceState>): void {
        if (this.stopped) { return; }
        this.current = Object.freeze({ ...this.current, ...update });
        for (const listener of this.listeners) { listener(this.current); }
    }
}
