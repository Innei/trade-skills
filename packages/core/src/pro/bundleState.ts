import { setEncBundlePresent as setRegistryEncBundlePresent } from './registry.js';

// Delegates to the old ABI's registry flag rather than holding separate state:
// apps/desktop/src/boot/proActivationWatch.ts still reads presence through
// registry.hasEncBundle() to decide when to prompt for a relaunch, and that
// caller is out of scope for this task.
export function setEncBundlePresent(present: boolean): void {
  setRegistryEncBundlePresent(present);
}
