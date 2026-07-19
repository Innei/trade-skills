import { createCipheriv, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { loadEdition } from "../src/pro/editionLoader.js";
import { loadPro } from "../src/pro/loader.js";
import { getClaimedProtocol, resetProtocolClaimForTests } from "../src/pro/protocolClaim.js";
import { unregisterProModuleForTests } from "../src/pro/registry.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const TSX_LOADER = createRequire(import.meta.url).resolve("tsx", { paths: [join(REPO_ROOT, "apps", "desktop")] });

const KEY_HEX = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

function stagePlaintextPro(): { appDir: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "kansoku-protocol-legacy-"));
  const appDir = join(root, "appRoot");
  const proSrcDir = join(root, "pro", "src");
  mkdirSync(appDir, { recursive: true });
  mkdirSync(proSrcDir, { recursive: true });
  writeFileSync(
    join(proSrcDir, "index.js"),
    "export default { hooks: { requestImmediateFollow() {}, startDeepDiveForNote() { return { started: false, reason: 'disabled' }; }, deepDiveStatus() { return { running: false }; } } };\n",
  );
  return { appDir, root };
}

function absentEditionOptions(root: string) {
  return {
    encPath: join(root, "definitely-missing", "pro.enc"),
    virtualDir: join(root, "vdir-absent"),
    runtime: "server" as const,
    keyHex: KEY_HEX,
    host: {},
  };
}

describe("pro protocol mutual exclusion (in-process)", () => {
  const roots: string[] = [];

  afterEach(() => {
    unregisterProModuleForTests();
    resetProtocolClaimForTests();
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  it("legacy-then-edition throws naming both protocols", async () => {
    const { appDir, root } = stagePlaintextPro();
    roots.push(root);

    const loaded = await loadPro(appDir);
    expect(loaded).toBe(true);
    expect(getClaimedProtocol()).toBe("legacy");

    await expect(loadEdition(absentEditionOptions(root))).rejects.toThrow(/legacy/);
    await expect(loadEdition(absentEditionOptions(root))).rejects.toThrow(/edition/);
  });

  it("free-mode loadPro does not block a later loadEdition", async () => {
    const root = mkdtempSync(join(tmpdir(), "kansoku-protocol-free-"));
    roots.push(root);

    const loaded = await loadPro(join(root, "appRoot-without-pro-slot"));
    expect(loaded).toBe(false);
    expect(getClaimedProtocol()).toBeNull();

    const activation = await loadEdition(absentEditionOptions(root));
    expect(activation.state).toBe("absent");
  });

  it("edition absent does not block a later loadPro", async () => {
    const { appDir, root } = stagePlaintextPro();
    roots.push(root);

    const activation = await loadEdition(absentEditionOptions(root));
    expect(activation.state).toBe("absent");
    expect(getClaimedProtocol()).toBeNull();

    const loaded = await loadPro(appDir);
    expect(loaded).toBe(true);
  });

  it("edition locked (enc present, no key) does not block a later loadPro", async () => {
    const { appDir, root } = stagePlaintextPro();
    roots.push(root);
    const encRoot = mkdtempSync(join(tmpdir(), "kansoku-protocol-locked-"));
    roots.push(encRoot);
    writeFileSync(join(encRoot, "pro.enc"), Buffer.from("not a real bundle"));

    const activation = await loadEdition({
      encPath: join(encRoot, "pro.enc"),
      virtualDir: join(encRoot, "vdir"),
      runtime: "server",
      host: {},
    });
    expect(activation.state).toBe("locked");
    expect(getClaimedProtocol()).toBeNull();

    const loaded = await loadPro(appDir);
    expect(loaded).toBe(true);
  });

  it("reset hook clears the claim", async () => {
    const { appDir, root } = stagePlaintextPro();
    roots.push(root);

    await loadPro(appDir);
    expect(getClaimedProtocol()).toBe("legacy");

    resetProtocolClaimForTests();
    expect(getClaimedProtocol()).toBeNull();

    const activation = await loadEdition(absentEditionOptions(root));
    expect(activation.state).toBe("absent");
  });

  it("unregisterProModuleForTests also clears the protocol claim", async () => {
    const { appDir, root } = stagePlaintextPro();
    roots.push(root);

    await loadPro(appDir);
    expect(getClaimedProtocol()).toBe("legacy");

    unregisterProModuleForTests();
    expect(getClaimedProtocol()).toBeNull();
  });
});

const PUBLIC_COMMIT = "a".repeat(40);
const PRO_COMMIT = "b".repeat(40);

function bundleJson(): string {
  return JSON.stringify({
    formatVersion: 1,
    editionAbiVersion: 1,
    entries: { server: "server/index.mjs", desktop: "desktop/index.mjs" },
    buildId: "test-v1",
    publicCommit: PUBLIC_COMMIT,
    proCommit: PRO_COMMIT,
  });
}

const SERVER_ENTRY = [
  "export const abiVersion = 1;",
  'export const runtime = "server";',
  "export function createEdition(host) {",
  '  return { kind: "server", name: host.name };',
  "}",
  "",
].join("\n");

const DESKTOP_ENTRY = [
  "export const abiVersion = 1;",
  'export const runtime = "desktop";',
  "export function createEdition(host) {",
  '  return { kind: "desktop", name: host.name };',
  "}",
  "",
].join("\n");

const FIXTURE_FILES: Record<string, string> = {
  "bundle.json": bundleJson(),
  "server/index.mjs": SERVER_ENTRY,
  "desktop/index.mjs": DESKTOP_ENTRY,
};

function packBundle(files: Record<string, string>, keyId: string, keyHex: string): Buffer {
  const manifest = {
    keyId,
    files: Object.fromEntries(Object.entries(files).map(([rel, src]) => [rel, Buffer.from(src).toString("base64")])),
  };
  const gz = gzipSync(Buffer.from(JSON.stringify(manifest)));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const ct = Buffer.concat([cipher.update(gz), cipher.final()]);
  return Buffer.concat([Buffer.from("KPRO1", "utf8"), iv, cipher.getAuthTag(), ct]);
}

function stageEditionEnc(): { encPath: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "kansoku-protocol-active-"));
  const encPath = join(root, "pro.enc");
  writeFileSync(encPath, packBundle(FIXTURE_FILES, "test", KEY_HEX));
  return { encPath, root };
}

const RUNNER_SOURCE = [
  "const { loadEdition } = await import(process.env.EDITION_LOADER_URL);",
  "const { loadPro } = await import(process.env.LOADER_URL);",
  "const activation = await loadEdition({",
  "  encPath: process.env.ENC_PATH,",
  "  virtualDir: process.env.VIRTUAL_DIR,",
  '  runtime: "server",',
  "  keyHex: process.env.KEY_HEX,",
  "  host: { name: \"alice\" },",
  "});",
  "let legacyError = null;",
  "try {",
  "  await loadPro(process.env.APP_DIR_WITHOUT_PRO);",
  "} catch (cause) {",
  "  legacyError = cause.message;",
  "}",
  "process.stdout.write(JSON.stringify({ editionState: activation.state, legacyError }));",
].join("\n");

function runEditionThenLegacy(encPath: string, root: string): { editionState: string; legacyError: string | null } {
  const url = (p: string) => `file://${join(HERE, "..", "src", "pro", p)}`;
  const out = execFileSync(process.execPath, ["--import", TSX_LOADER, "--input-type=module", "-e", RUNNER_SOURCE], {
    env: {
      ...process.env,
      EDITION_LOADER_URL: url("editionLoader.ts"),
      LOADER_URL: url("loader.ts"),
      ENC_PATH: encPath,
      VIRTUAL_DIR: join(root, "vdir"),
      KEY_HEX,
      APP_DIR_WITHOUT_PRO: join(root, "appRoot-without-pro-slot"),
    },
    encoding: "utf8",
  });
  return JSON.parse(out);
}

describe("pro protocol mutual exclusion (spawned Node process, real dynamic import)", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
  });

  it("edition(active)-then-legacy throws naming both protocols", () => {
    const { encPath, root } = stageEditionEnc();
    roots.push(root);

    const result = runEditionThenLegacy(encPath, root);

    expect(result.editionState).toBe("active");
    expect(result.legacyError).not.toBeNull();
    expect(result.legacyError).toMatch(/legacy/);
    expect(result.legacyError).toMatch(/edition/);
  });
});
