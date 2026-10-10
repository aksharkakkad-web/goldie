/********************************************************************************
 * Copyright (C) 2026 Goldie contributors.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon, Message } from '@theia/core/lib/browser/widgets';
import { GoldieService } from '../../common/goldie-service';

@injectable()
export class GoldieWidget extends ReactWidget {
    static readonly ID = 'goldie:panel';
    @inject(GoldieService) protected readonly service: GoldieService;
    protected state: 'Connecting' | 'Connected' | 'Unavailable' = 'Connecting';
    protected detail = '';
    protected requestRevision = 0;
    protected connectionTimer: ReturnType<typeof setTimeout> | undefined;

    @postConstruct()
    protected init(): void {
        this.id = GoldieWidget.ID;
        this.title.label = 'Goldie';
        this.title.caption = 'Goldie — learn as you build';
        this.title.closable = true;
        this.title.iconClass = codicon('lightbulb');
        this.addClass('goldie-widget');
        this.node.tabIndex = -1;
        this.update();
        this.checkConnection();
    }

    protected async checkConnection(): Promise<void> {
        const revision = ++this.requestRevision;
        this.state = 'Connecting';
        this.detail = 'Checking the local teaching service…';
        this.update();
        try {
            const result = await Promise.race([
                this.service.checkHealth(),
                new Promise<never>((_, reject) => {
                    this.connectionTimer = setTimeout(() => reject(new Error('Connection timeout')), 6000);
                })
            ]);
            if (this.isDisposed || revision !== this.requestRevision) { return; }
            this.state = result.connected ? 'Connected' : 'Unavailable';
            this.detail = result.message;
        } catch {
            if (this.isDisposed || revision !== this.requestRevision) { return; }
            this.state = 'Unavailable';
            this.detail = "Can't reach Goldie yet. Your editor still works. Try again.";
        }
        finally {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = undefined;
        }
        this.update();
    }

    dispose(): void {
        clearTimeout(this.connectionTimer);
        super.dispose();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.node.querySelector<HTMLButtonElement>('button')?.focus();
    }

    protected render(): React.ReactNode {
        return <section className='goldie-panel' aria-label='Goldie learning panel'>
            <header className='goldie-panel-header'>
                <span className='goldie-mark' aria-hidden='true'>g</span>
                <strong>Goldie</strong>
                <button className='goldie-close' aria-label='Close Goldie panel' title='Close Goldie panel'
                    onClick={() => this.close()}>×</button>
            </header>
            <div className={`goldie-status goldie-status-${this.state.toLowerCase()}`} role='status' aria-live='polite'>
                <span aria-hidden='true'>●</span> {this.state}
            </div>
            <h2>Learn as you build.</h2>
            <p className='goldie-intro'>Keep coding. Goldie will explain the ideas behind your build when you choose to learn.</p>
            <div className='goldie-connection-card' aria-live='polite'>
                <strong>{this.state === 'Connected' ? 'Ready when you are.' : this.state === 'Connecting' ? 'Connecting to Goldie…' : "Can't reach Goldie yet."}</strong>
                <p>{this.detail}</p>
                <button className='theia-button goldie-retry' disabled={this.state === 'Connecting'}
                    onClick={() => { this.checkConnection(); }}>
                    {this.state === 'Connecting' ? 'Checking connection…' : this.state === 'Connected' ? 'Check connection' : 'Retry connection'}
                </button>
            </div>
            <p className='goldie-note'>Learning is opt-in. Nothing plays automatically.</p>
            <footer className='goldie-panel-footer'>Stage 0 · Teaching service connection<br />Lessons and voice are not connected yet.</footer>
        </section>;
    }
}
