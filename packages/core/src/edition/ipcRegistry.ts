export interface IpcRegistry<TCtor = unknown> {
  register(...ctors: TCtor[]): void;
  build(): readonly TCtor[];
}

export class DefaultIpcRegistry<TCtor = unknown> implements IpcRegistry<TCtor> {
  private classes: TCtor[] = [];

  register(...ctors: TCtor[]): void {
    this.classes.push(...ctors);
  }

  build(): readonly TCtor[] {
    return this.classes;
  }
}
