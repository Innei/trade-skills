import type { ProChannel } from '@kansoku/pro-api';

export interface RealtimeChannelRegistry {
  register(...channels: ProChannel[]): void;
  list(): readonly ProChannel[];
}

export class DefaultRealtimeChannelRegistry implements RealtimeChannelRegistry {
  private channels: ProChannel[] = [];

  register(...channels: ProChannel[]): void {
    this.channels.push(...channels);
  }

  list(): readonly ProChannel[] {
    return this.channels;
  }
}
