import { promises as fs } from 'node:fs';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { textResult } from '../dataTools.js';
import {
  buildMounts,
  collectFiles,
  type FsReadMount,
  FS_RESULT_DEFAULT_LIMIT,
  FS_RESULT_MAX_LIMIT,
  isAllowedMountFile,
  isExcludedMountPath,
  isSymlinkSafe,
  matchesGlob,
  mountRelativePath,
  resolveMountedPath,
} from './fsMounts.js';

const READ_FILE_MAX_CHARS = 100_000;

const readFileSchema = Type.Object({
  path: Type.String({ minLength: 1, maxLength: 2_000 }),
  mount: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
});

const listFilesSchema = Type.Object({
  mount: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  path: Type.Optional(Type.String({ maxLength: 2_000 })),
  glob: Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  head_limit: Type.Optional(Type.Integer({ minimum: 1, maximum: FS_RESULT_MAX_LIMIT })),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
});

export function buildReadFileTool(
  repoRoot: string,
  readMounts: readonly FsReadMount[] = [],
): AgentTool<typeof readFileSchema> {
  const mounts = buildMounts(repoRoot, readMounts);
  return {
    name: 'read_file',
    label: 'Read File',
    description:
      'Read a UTF-8 file from an available filesystem mount. Paths are relative to the selected mount.',
    parameters: readFileSchema,
    execute: async (_id, params) => {
      const rawPath = params.path;
      const resolved = resolveMountedPath(mounts, params.mount, rawPath);
      if (!resolved) {
        return textResult(`rejected: invalid mount or path outside mount root: ${rawPath}`);
      }
      if (!isAllowedMountFile(resolved.mount, resolved.path)) {
        return textResult(
          `rejected: path is not readable from mount ${resolved.mount.name}: ${rawPath}`,
        );
      }
      try {
        if (!(await isSymlinkSafe(resolved.mount, resolved.path))) {
          return textResult(`rejected: path resolves outside mount root: ${rawPath}`);
        }
        const stat = await fs.stat(resolved.path);
        if (!stat.isFile()) return textResult(`read failed: not a file: ${rawPath}`);
        const content = await fs.readFile(resolved.path, 'utf8');
        return textResult(
          content.length > READ_FILE_MAX_CHARS ? content.slice(0, READ_FILE_MAX_CHARS) : content,
        );
      } catch (err) {
        return textResult(`read failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

export function buildListFilesTool(
  repoRoot: string,
  readMounts: readonly FsReadMount[],
): AgentTool<typeof listFilesSchema> {
  const mounts = buildMounts(repoRoot, readMounts);
  return {
    name: 'list_files',
    label: 'List Files',
    description:
      'List files under a filesystem mount. Paths are relative to the selected mount and may be filtered with a glob.',
    parameters: listFilesSchema,
    execute: async (_id, params) => {
      const resolved = resolveMountedPath(mounts, params.mount, params.path);
      if (!resolved) return textResult('rejected: invalid mount or path outside mount root');
      if (isExcludedMountPath(resolved.mount, resolved.path)) {
        return textResult(`rejected: path is excluded from mount ${resolved.mount.name}`);
      }
      try {
        if (!(await isSymlinkSafe(resolved.mount, resolved.path))) {
          return textResult('rejected: path resolves outside mount root');
        }
        let paths = await collectFiles(resolved.mount, resolved.path);
        paths = paths.map((path) => mountRelativePath(resolved.mount, path) ?? '').filter(Boolean);
        if (params.glob) paths = paths.filter((path) => matchesGlob(path, params.glob!));
        const offset = params.offset ?? 0;
        const limit = params.head_limit ?? FS_RESULT_DEFAULT_LIMIT;
        const page = paths.slice(offset, offset + limit);
        const suffix =
          offset + page.length < paths.length
            ? `\n...[${paths.length - offset - page.length} more files]`
            : '';
        return textResult(page.length > 0 ? `${page.join('\n')}${suffix}` : 'No files found.');
      } catch (err) {
        return textResult(`list failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
