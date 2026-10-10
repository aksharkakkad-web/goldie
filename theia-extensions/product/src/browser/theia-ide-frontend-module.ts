/********************************************************************************
 * Copyright (C) 2020 TypeFox, EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import '../../src/browser/style/index.css';

import { AIRegistryConfiguration } from '@theia/ai-registry/lib/common/ai-registry-configuration';
import { WidgetFactory, bindViewContribution, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { GoldieService, GOLDIE_SERVICE_PATH } from '../common/goldie-service';
import { GoldieWidget } from './goldie/goldie-widget';
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

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    applyBranding();

    bind(GoldieService).toDynamicValue(context =>
        ServiceConnectionProvider.createLocalProxy<GoldieService>(context.container, GOLDIE_SERVICE_PATH)
    ).inSingletonScope();
    bind(GoldieWidget).toSelf();
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
