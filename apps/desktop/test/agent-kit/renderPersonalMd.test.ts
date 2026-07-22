import { describe, expect, it } from 'vitest';
import { createDb } from '@kansoku/core/db/index';
import { watchedMarketsSettings } from '@kansoku/core/db/schema';
import { renderPersonalMd, PERSONAL_MD_RENDER_VERSION } from '@desktop/agent-kit/renderPersonalMd.js';

describe('renderPersonalMd', () => {
  it('includes the watched markets from the settings table', () => {
    const db = createDb(':memory:');
    db.insert(watchedMarketsSettings)
      .values({ id: 1, markets: ['US', 'HK'], updatedAt: '2026-07-22T00:00:00.000Z' })
      .run();

    const md = renderPersonalMd(db);
    expect(md).toContain('US, HK');
    expect(md).toContain('# 个人研究配置');
  });

  it('falls back to the default watched market when no settings row exists', () => {
    const db = createDb(':memory:');
    const md = renderPersonalMd(db);
    expect(md).toContain('关注市场：US');
  });

  it('exposes a stable render-version constant matching the manifest app-config sentinel', () => {
    expect(PERSONAL_MD_RENDER_VERSION).toBe('app-config-v1');
  });
});
