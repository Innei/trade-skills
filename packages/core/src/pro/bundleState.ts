let encBundlePresent = false;

export function setEncBundlePresent(present: boolean): void {
  encBundlePresent = present;
}

export function hasEncBundle(): boolean {
  return encBundlePresent;
}

export function resetEncBundleStateForTests(): void {
  encBundlePresent = false;
}
