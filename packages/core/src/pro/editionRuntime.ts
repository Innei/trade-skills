import { LegacyEditionRuntimeStatusReader } from "./domain/legacyAdapters.js";
import type { EditionActivation, EditionActivationState } from "./editionLoader.js";

export interface EditionRuntimeStatus {
  state: EditionActivationState;
  bundlePresent: boolean;
  keyId?: string;
}

export interface EditionRuntimeStatusReader {
  readonly status: EditionRuntimeStatus;
}

export class EditionRuntime<TEdition> implements EditionRuntimeStatusReader {
  readonly status: EditionRuntimeStatus;
  readonly edition: TEdition | undefined;

  constructor(activation: EditionActivation<TEdition>) {
    this.status = {
      state: activation.state,
      bundlePresent: activation.bundlePresent,
      keyId: activation.keyId,
    };
    this.edition = activation.edition;
  }
}

let currentStatusReader: EditionRuntimeStatusReader = new LegacyEditionRuntimeStatusReader();

// Composition-root hook: the runtime host (apps/server's runtimeInit.ts,
// shared by the desktop kernel) calls this once the edition activation
// outcome is known, so every reader of pro/edition presence (capabilities
// service, feature gates) observes the same status instead of each falling
// back to the legacy in-process registry independently.
export function configureEditionRuntimeStatus(reader: EditionRuntimeStatusReader): void {
  currentStatusReader = reader;
}

export function resetEditionRuntimeStatusForTests(): void {
  currentStatusReader = new LegacyEditionRuntimeStatusReader();
}

export function currentEditionRuntimeStatus(): EditionRuntimeStatus {
  return currentStatusReader.status;
}
