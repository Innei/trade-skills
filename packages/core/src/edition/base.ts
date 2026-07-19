import type { CoreEditionHost, DesktopEditionHost, ServerEditionHost } from './host.js';

export abstract class BaseEdition<THost extends CoreEditionHost> {
  private initialized = false;
  private initializing = false;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(protected readonly host: THost) {}

  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) {
      throw new Error(`${this.constructor.name}: already initialized`);
    }
    this.initializing = true;
    try {
      await this.onInitialize();
      this.initialized = true;
    } finally {
      this.initializing = false;
    }
  }

  async start(): Promise<void> {
    if (this.disposed) {
      throw new Error(`${this.constructor.name}: cannot start after dispose`);
    }
    if (!this.initialized) {
      throw new Error(`${this.constructor.name}: must initialize before start`);
    }
    if (this.started) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      try {
        await this.onStart();
        this.started = true;
      } finally {
        this.startPromise = null;
      }
    })();
    return this.startPromise;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.onDispose();
  }

  protected onInitialize(): Promise<void> | void {}
  protected onStart(): Promise<void> | void {}
  protected onDispose(): Promise<void> | void {}
}

export abstract class BaseServerEdition extends BaseEdition<ServerEditionHost> {}
export abstract class BaseDesktopEdition extends BaseEdition<DesktopEditionHost> {}
