import { describe, expect, it } from 'vitest';
import { findElectronImports, SERVER_BUNDLE_SCAN_ROOTS } from '../src/noElectronScan.js';

describe('findElectronImports', () => {
  it('finds no electron imports across the server bundle roots', () => {
    expect(findElectronImports(SERVER_BUNDLE_SCAN_ROOTS)).toEqual([]);
  });
});
