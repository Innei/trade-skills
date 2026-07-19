import { join } from 'node:path';
import { KANSOKU_HOME } from '@kansoku/core/env';

export function serverEncLayout(appDir?: string): { encPath: string; virtualDir: string } {
  const base = appDir ?? KANSOKU_HOME;
  return { encPath: join(base, 'pro', 'pro.enc'), virtualDir: join(base, 'pro', '__enc__') };
}
