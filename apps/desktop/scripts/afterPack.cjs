'use strict';

const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const EXPECTED_BETTER_SQLITE3_FILES = ['build/Release/better_sqlite3.node'];
const ALLOWED_PRO_ENTRY = 'pro/pro.enc';
// pro's entries embed this marker (apps/pro src/entries/canary.ts); pro.enc
// stores it only under AES-GCM + gzip, so the marker appearing in the raw
// asar bytes means plaintext pro code got packaged. Joined from parts so this
// script can never trip the scan on itself.
const PRO_CANARY = ['KANSOKU', 'PRO', 'CANARY', '9d4f2b7e1c'].join('-');

function listFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(root, path) : [relative(root, path)];
  });
}

function verifyBetterSqlite3Payload(context) {
  const resourcesDir = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
  );
  const unpackedModuleDir = join(
    resourcesDir,
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
  );
  const files = listFiles(unpackedModuleDir).sort();

  if (files.join('\n') !== EXPECTED_BETTER_SQLITE3_FILES.join('\n')) {
    throw new Error(
      `Unexpected better-sqlite3 unpacked payload:\n${files.map((file) => `- ${file}`).join('\n')}`,
    );
  }

  const nativeBinary = join(unpackedModuleDir, EXPECTED_BETTER_SQLITE3_FILES[0]);
  if (statSync(nativeBinary).size === 0) {
    throw new Error('Packaged better_sqlite3.node is empty');
  }
}

async function scanAppAsarForPlaintextLeaks(context) {
  const { listPackage } = await import('@electron/asar');
  const resourcesDir = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
  );
  const asarPath = join(resourcesDir, 'app.asar');
  const entries = listPackage(asarPath).map((entry) => entry.replace(/^\/+/, ''));

  const mapFiles = entries.filter((entry) => entry.endsWith('.map'));
  if (mapFiles.length > 0) {
    throw new Error(`app.asar contains source maps:\n${mapFiles.map((f) => `- ${f}`).join('\n')}`);
  }

  const proEntries = entries.filter(
    (entry) => entry === 'pro' || entry.startsWith('pro/') || entry.includes('/pro/'),
  );
  const strayProEntries = proEntries.filter((entry) => entry !== ALLOWED_PRO_ENTRY && entry !== 'pro');
  if (strayProEntries.length > 0) {
    throw new Error(
      `app.asar contains unexpected pro-namespaced entries (only ${ALLOWED_PRO_ENTRY} is allowed):\n${strayProEntries.map((f) => `- ${f}`).join('\n')}`,
    );
  }

  if (readFileSync(asarPath).includes(PRO_CANARY)) {
    throw new Error('pro canary found in app.asar — plaintext pro code leaked into the package');
  }
}

module.exports = async function afterPack(context) {
  verifyBetterSqlite3Payload(context);
  await scanAppAsarForPlaintextLeaks(context);
  // CSC_LINK present + `identity: null` dropped from electron-builder.yml
  // (the CI signing step does both together) means electron-builder will
  // Developer-ID-sign and notarize right after this hook — an ad-hoc --deep
  // sign here would only be thrown away by that re-sign. Both conditions are
  // required: a stray local CSC_LINK with identity still null must keep the
  // ad-hoc path, or the app ships with no signature at all.
  if (process.env.CSC_LINK && context.packager.platformSpecificBuildOptions.identity !== null) {
    return;
  }
  const { adHocSignAfterPack } = await import('electron-sparkle-updater/builder');
  return adHocSignAfterPack(context);
};

module.exports.scanAppAsarForPlaintextLeaks = scanAppAsarForPlaintextLeaks;
