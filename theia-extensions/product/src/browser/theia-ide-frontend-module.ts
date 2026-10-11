/********************************************************************************
 * Copyright (C) 2020 TypeFox, EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';
import { GoldieMidnightTheme } from './goldie-midnight-theme';

import { AIRegistryConfiguration } from '@theia/ai-registry/lib/common/ai-registry-configuration';
import { WidgetFactory, bindViewContribution, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { GoldieService, GOLDIE_SERVICE_PATH } from '../common/goldie-service';
import { GoldieWidget, GOLDIE_HANDOFF_DIALOG } from './goldie/goldie-widget';
import { DefaultFileDialogService } from '@theia/filesystem/lib/browser/file-dialog/file-dialog-service';
import { GoldieViewContribution } from './goldie/goldie-view-contribution';
import { AboutDialog } from '@theia/core/lib/browser/about-dialog';
import { applyBranding } from './theia-ide-config';
import { CommandContribution } from '@theia/core/lib/common/command';
import { ContainerModule } from '@theia/core/shared/inversify';
import { GettingStartedWidget } from '@theia/getting-started/lib/browser/getting-started-widget';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { TheiaIDEAboutDialog } from './theia-ide-about-dialog';
import { TheiaIDEAIRegistryConfiguration } from './theia-ide-ai-registry-configuration';
import { TheiaIDEContribution } from './theia-ide-contribution';
import { TheiaIDEGettingStartedWidget } from './theia-ide-getting-started-widget';

import { PreferenceContribution } from '@theia/core/lib/common/preferences';
import { MessageService } from '@theia/core/lib/common/message-service';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { CodexFrontendService } from '@theia/ai-codex/lib/browser/codex-frontend-service';
import { GoldieCodexFrontendService } from './goldie/goldie-codex-frontend-service';
import { GoldieWorkspaceConnection } from './goldie/goldie-workspace-connection';
import { GoldieLessonController } from './goldie/goldie-lesson-controller';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    applyBranding();
    bind(PreferenceContribution).toConstantValue({ schema: { type: 'object', properties: {
        'goldie.codexModel': { type: 'string', default: '',
            description: 'Optional Codex model for connected Goldie projects. Choose a model available to your signed-in account.' }
    } } });

    bind(GoldieMidnightTheme).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(GoldieMidnightTheme);

    bind(GoldieService).toDynamicValue(context =>
        ServiceConnectionProvider.createLocalProxy<GoldieService>(context.container, GOLDIE_SERVICE_PATH)
    ).inSingletonScope();
    bind(GoldieWorkspaceConnection).toDynamicValue(context => {
        const service = context.container.get<GoldieService>(GoldieService);
        const workspace = context.container.get<WorkspaceService>(WorkspaceService);
        const files = context.container.get<FileService>(FileService);
        const messages = context.container.get<MessageService>(MessageService);
        const lesson = new GoldieLessonController(service);
        let storage: Storage | undefined;
        try { storage = globalThis.localStorage; } catch { /* Connection reports unavailable storage. */ }
        return new GoldieWorkspaceConnection(service, lesson, {
            onOffer: (offerId, topics) => {
                messages.info(`Want to understand the engineering behind this? ${topics.join(', ')}`, 'View lesson', 'Not now').then(action => {
                    if (lesson.state.view !== 'offer' || lesson.state.offer?.offerId !== offerId) { return; }
                    if (action === 'View lesson') {
                        context.container.get<GoldieViewContribution>(GoldieViewContribution).openView({ activate: true });
                    } else if (action === 'Not now') { lesson.declineOffer(); }
                });
            },
            roots: async () => (await workspace.roots).map(root => root.resource.toString()),
            onRootsChanged: callback => {
                const listener = workspace.onWorkspaceChanged(callback); return () => listener.dispose();
            },
            watch: (rootUri, callback) => {
                const root = new URI(rootUri);
                const canonical = root.resolve('.goldie/HANDOFF.md');
                const watcher = files.watch(root, { recursive: true, excludes: ['**/node_modules/**', '**/.git/**', '**/.next/**'] });
                const listener = files.onDidFilesChange(event => {
                    if (event.contains(canonical) || event.contains(root.resolve('.goldie'))) { callback(); }
                });
                return () => { listener.dispose(); watcher.dispose(); };
            },
            storage,
            schedule: (callback, ms) => setTimeout(callback, ms), clear: timer => clearTimeout(timer)
        });
    }).inSingletonScope();
    bind(FrontendApplicationContribution).toService(GoldieWorkspaceConnection);
    rebind(CodexFrontendService).to(GoldieCodexFrontendService).inSingletonScope();
    bind(GoldieWidget).toSelf();
    // Use Theia's regular picker for Goldie; the native Mac picker can disable valid Markdown selections.
    bind(GOLDIE_HANDOFF_DIALOG).to(DefaultFileDialogService).inSingletonScope();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: GoldieWidget.ID,
        createWidget: () => context.container.get(GoldieWidget)
    })).inSingletonScope();
    bindViewContribution(bind, GoldieViewContribution);
    bind(FrontendApplicationContribution).toService(GoldieViewContribution);

    bind(TheiaIDEGettingStartedWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: GettingStartedWidget.ID,
        createWidget: () => context.container.get<TheiaIDEGettingStartedWidget>(TheiaIDEGettingStartedWidget),
    })).inSingletonScope();
    if (isBound(AboutDialog)) {
        rebind(AboutDialog).to(TheiaIDEAboutDialog).inSingletonScope();
    } else {
        bind(AboutDialog).to(TheiaIDEAboutDialog).inSingletonScope();
    }

    bind(TheiaIDEContribution).toSelf().inSingletonScope();
    [CommandContribution, MenuContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(TheiaIDEContribution)
    );

    if (isBound(AIRegistryConfiguration)) {
        rebind(AIRegistryConfiguration).to(TheiaIDEAIRegistryConfiguration).inSingletonScope();
    } else {
        bind(AIRegistryConfiguration).to(TheiaIDEAIRegistryConfiguration).inSingletonScope();
    }
});
