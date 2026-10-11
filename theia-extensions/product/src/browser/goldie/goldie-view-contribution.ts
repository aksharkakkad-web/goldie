/********************************************************************************
 * Copyright (C) 2026 Goldie contributors.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { GoldieWidget } from './goldie-widget';

@injectable()
export class GoldieViewContribution extends AbstractViewContribution<GoldieWidget> implements FrontendApplicationContribution {
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
            execute: () => this.openView({ activate: true, reveal: true })
        });
    }
}
