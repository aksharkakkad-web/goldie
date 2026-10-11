/********************************************************************************
 * Copyright (C) 2026 Goldie contributors.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { GoldieWidget } from './goldie-widget';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';

@injectable()
export class GoldieViewContribution extends AbstractViewContribution<GoldieWidget> implements FrontendApplicationContribution {
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    protected visibilityBound = new WeakSet<GoldieWidget>();
    constructor() {
        super({
            widgetId: GoldieWidget.ID,
            widgetName: 'Goldie',
            defaultWidgetOptions: { area: 'right', rank: 100 },
            toggleCommandId: 'goldie:toggle-panel'
        });
    }

    async onDidInitializeLayout(): Promise<void> {
        const restored = this.tryGetWidget()?.isAttached;
        const widget = await this.openView({ reveal: true, activate: false });
        if (!restored && widget.node.getBoundingClientRect().width < 300) {
            this.shell.resize(304, 'right');
        }
        this.trackVisibility(widget);
    }

    protected trackVisibility(widget: GoldieWidget): void {
        if (!this.visibilityBound.has(widget)) {
            this.visibilityBound.add(widget);
            widget.onDidChangeVisibility(() => this.updateToggle());
            widget.onDidDispose(() => this.updateToggle());
        }
        this.updateToggle();
    }
    protected updateToggle(): void {
        const visible = this.tryGetWidget()?.isVisible;
        this.statusBar.setElement('goldie:voice-toggle', {
            text: `$(lightbulb) ${visible ? 'Hide Goldie' : 'Show Goldie'}`,
            name: 'Goldie voice panel', alignment: StatusBarAlignment.RIGHT, priority: 100,
            command: 'goldie:show-hide', tooltip: `${visible ? 'Hide' : 'Show'} the Goldie voice orb`,
            accessibilityInformation: { label: visible ? 'Hide Goldie' : 'Show Goldie' }
        });
    }

    registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand({ id: 'goldie:load-sample-handoff', category: 'Goldie', label: 'Load sample handoff' }, {
            execute: async () => {
                const widget = await this.openView({ activate: true, reveal: true });
                await widget.loadSampleHandoff();
            }
        });
        commands.registerCommand({ id: 'goldie:open-panel', category: 'Goldie', label: 'Open Panel' }, {
            execute: async () => { const widget = await this.openView({ activate: true, reveal: true }); this.trackVisibility(widget); }
        });
        commands.registerCommand({ id: 'goldie:show-hide', category: 'Goldie', label: 'Show / Hide voice orb' }, {
            execute: async () => {
                if (this.tryGetWidget()?.isVisible) { await this.closeView(); } else {
                    this.trackVisibility(await this.openView({ activate: true, reveal: true }));
                }
                this.updateToggle();
            }
        });
        commands.registerCommand({ id: 'goldie:details', category: 'Goldie', label: 'Setup and lesson details' }, {
            execute: async () => {
                const widget = await this.openView({ activate: true, reveal: true });
                this.trackVisibility(widget); await widget.openDetails();
            }
        });
        commands.registerCommand({ id: 'goldie:end-session', category: 'Goldie', label: 'End lesson' }, {
            execute: async () => { const widget = await this.openView({ activate: true }); await widget.finishLesson(); }
        });
    }
}
