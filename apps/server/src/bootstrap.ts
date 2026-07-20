import 'reflect-metadata';
import { createApplication, type HonoHttpApplication } from '@tsuki-hono/core';
import type { BaseServerEdition } from '@kansoku/core/edition/base';
import { createDefaultServerEditionHost } from '@kansoku/core/edition/host';
import { ServerBuilder } from '@kansoku/core/edition/serverBuilder';
import { ServerEdition } from '@kansoku/core/edition/serverEdition';
import { AppExceptionFilter } from './filters/app-exception.filter.js';
import { buildAppModule, SERVER_PUBLIC_MODULES } from './modules/app.module.js';

export interface Kernel {
  app: HonoHttpApplication;
}

// globalPrefix "/api" lets controllers use bare paths (e.g. @Controller("health"))
// for "/api/health".
export async function createKernel(
  edition: BaseServerEdition = new ServerEdition(createDefaultServerEditionHost()),
): Promise<Kernel> {
  const builder = new ServerBuilder(SERVER_PUBLIC_MODULES);
  edition.configureServer(builder);
  const RootModule = buildAppModule(builder.build());
  const app = await createApplication(RootModule, { globalPrefix: '/api' });
  app.useGlobalFilters(new AppExceptionFilter());
  return { app };
}
