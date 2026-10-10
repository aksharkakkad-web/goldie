/********************************************************************************
 * Copyright (C) 2026 Goldie contributors.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import { ContainerModule } from '@theia/core/shared/inversify';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { GOLDIE_SERVICE_PATH, GoldieService } from '../common/goldie-service';
import { checkGoldieHealth } from './goldie-health';

export default new ContainerModule(bind => {
    const address = process.env.GOLDIE_BACKEND_URL || 'http://127.0.0.1:8787';
    bind(GoldieService).toConstantValue({ checkHealth: () => checkGoldieHealth(address) });
    bind(ConnectionHandler).toDynamicValue(context =>
        new RpcConnectionHandler<GoldieService>(GOLDIE_SERVICE_PATH, () => context.container.get(GoldieService))
    ).inSingletonScope();
});
