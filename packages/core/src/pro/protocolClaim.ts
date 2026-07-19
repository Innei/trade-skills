export type ProProtocol = 'legacy' | 'edition';

let claimedProtocol: ProProtocol | null = null;

export function assertProtocolAllowed(protocol: ProProtocol): void {
  if (claimedProtocol !== null && claimedProtocol !== protocol) {
    throw new Error(
      `pro protocol conflict: attempted to load pro via "${protocol}" but this process already claimed "${claimedProtocol}"; loadPro (legacy) and loadEdition may not both run in one process`,
    );
  }
}

export function claimProtocol(protocol: ProProtocol): void {
  claimedProtocol = protocol;
}

export function getClaimedProtocol(): ProProtocol | null {
  return claimedProtocol;
}

export function resetProtocolClaimForTests(): void {
  claimedProtocol = null;
}
