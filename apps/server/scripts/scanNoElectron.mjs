import { findElectronImports, SERVER_BUNDLE_SCAN_ROOTS } from '../src/noElectronScan.ts';

const hits = findElectronImports(SERVER_BUNDLE_SCAN_ROOTS);
if (hits.length) {
  console.error(hits);
  process.exit(1);
}
console.log('no electron imports found');
