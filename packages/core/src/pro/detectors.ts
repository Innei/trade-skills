import type { ProDetectors } from '@kansoku/pro-api';

let activeDetectors: Partial<ProDetectors> = {};

export function registerProDetectors(d: ProDetectors): void {
  activeDetectors = d;
}

export function resetProDetectorsForTests(): void {
  activeDetectors = {};
}

export function currentProDetectors(): Partial<ProDetectors> {
  return activeDetectors;
}
