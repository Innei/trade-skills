import { afterEach, describe, expect, it } from 'vitest';
import type { ProChannel } from '@kansoku/pro-api';
import type { DesktopEditionHost } from '@kansoku/core/edition/host';
import { DefaultIpcRegistry } from '@kansoku/core/edition/ipcRegistry';
import { DefaultRealtimeChannelRegistry } from '@kansoku/core/edition/realtimeRegistry';
import { freeHooks, registerProModule, unregisterProModuleForTests } from '@kansoku/core/pro/registry';
import { LegacyCompatDesktopEdition } from '../../src/boot/legacyDesktopEdition.js';

function fakeDesktopHost(): DesktopEditionHost {
  return {
    db: {} as unknown as DesktopEditionHost['db'],
    license: { isLicensed: () => true },
    aiSettings: {} as unknown as DesktopEditionHost['aiSettings'],
    watchedMarkets: {} as unknown as DesktopEditionHost['watchedMarkets'],
    paths: { kansokuHome: '/tmp/kansoku-home' },
    production: false,
    logger: {
      log: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    ipc: new DefaultIpcRegistry(),
    realtime: new DefaultRealtimeChannelRegistry(),
  };
}

class DummyIpcService {
  static groupName = 'dummy';
}

const dummyChannel: ProChannel = {
  kind: 'dummy-channel',
  parse: () => null,
  attach: () => () => {},
};

afterEach(() => {
  unregisterProModuleForTests();
});

describe('LegacyCompatDesktopEdition', () => {
  it('merges the registered pro module ipc classes and channels into the registries', () => {
    registerProModule({
      hooks: freeHooks,
      ipcServiceClasses: [DummyIpcService],
      channels: [dummyChannel],
    });

    const edition = new LegacyCompatDesktopEdition(fakeDesktopHost());
    const ipc = new DefaultIpcRegistry();
    const realtime = new DefaultRealtimeChannelRegistry();

    edition.configureIpc(ipc);
    edition.configureRealtime(realtime);

    expect(ipc.build()).toEqual([DummyIpcService]);
    expect(realtime.list()).toEqual([dummyChannel]);
  });

  it('leaves both registries empty when no pro module is registered', () => {
    unregisterProModuleForTests();

    const edition = new LegacyCompatDesktopEdition(fakeDesktopHost());
    const ipc = new DefaultIpcRegistry();
    const realtime = new DefaultRealtimeChannelRegistry();

    edition.configureIpc(ipc);
    edition.configureRealtime(realtime);

    expect(ipc.build()).toEqual([]);
    expect(realtime.list()).toEqual([]);
  });
});
