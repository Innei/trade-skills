import type { BaseServerEdition } from '@kansoku/core/edition/base';

export function registerShutdownHandlers(
  edition: BaseServerEdition,
  proc: NodeJS.Process = process,
): void {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    proc.on(signal, () => {
      void edition.dispose().finally(() => proc.exit(0));
    });
  }
}
