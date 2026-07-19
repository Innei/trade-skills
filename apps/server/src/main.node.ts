import { HOST_MODE, KERNEL_PORT, PORT } from '@kansoku/core/env';
import { startHost } from './host.js';
import { initServerRuntime } from './runtimeInit.js';
import { registerShutdownHandlers } from './shutdown.js';

const { edition } = await initServerRuntime();
await edition.initialize();

const isDevKernel = HOST_MODE === 'dev';
const bindPort = isDevKernel ? KERNEL_PORT : PORT;

await startHost(bindPort, isDevKernel, edition);
await edition.start();

registerShutdownHandlers(edition);
