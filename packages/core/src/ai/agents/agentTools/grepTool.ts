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
  isExcludedMountPath,
  isSymlinkSafe,
  matchesGlob,
  mountRelativePath,
  resolveMountedPath,
} from './fsMounts.js';

const GREP_FILE_MAX_CHARS = 512_000;

const grepSchema = Type.Object({
  'pattern': Type.String({ minLength: 1, maxLength: 2_000 }),
  'mount': Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  'path': Type.Optional(Type.String({ maxLength: 2_000 })),
  'glob': Type.Optional(Type.String({ minLength: 1, maxLength: 500 })),
  'type': Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  'output_mode': Type.Optional(
    Type.Union([
      Type.Literal('content'),
      Type.Literal('files_with_matches'),
      Type.Literal('count'),
    ]),
  ),
  '-B': Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })),
  '-A': Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })),
  '-C': Type.Optional(Type.Integer({ minimum: 0, maximum: 20 })),
  '-n': Type.Optional(Type.Boolean()),
  '-i': Type.Optional(Type.Boolean()),
  'head_limit': Type.Optional(Type.Integer({ minimum: 1, maximum: FS_RESULT_MAX_LIMIT })),
  'offset': Type.Optional(Type.Integer({ minimum: 0 })),
  'multiline': Type.Optional(Type.Boolean()),
});

const FILE_TYPE_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  c: ['.c', '.h'],
  cpp: ['.cc', '.cpp', '.cxx', '.hh', '.hpp', '.hxx'],
  css: ['.css'],
  go: ['.go'],
  html: ['.htm', '.html'],
  java: ['.java'],
  md: ['.md', '.mdx'],
  markdown: ['.md', '.mdx'],
  js: ['.js', '.jsx', '.mjs', '.cjs'],
  json: ['.json', '.jsonc'],
  jsx: ['.jsx'],
  kotlin: ['.kt', '.kts'],
  py: ['.py', '.pyi'],
  python: ['.py', '.pyi'],
  ruby: ['.rb'],
  rust: ['.rs'],
  scss: ['.scss'],
  shell: ['.bash', '.sh', '.zsh'],
  sql: ['.sql'],
  swift: ['.swift'],
  toml: ['.toml'],
  ts: ['.ts', '.tsx'],
  tsx: ['.tsx'],
  txt: ['.txt'],
  xml: ['.xml'],
  yaml: ['.yaml', '.yml'],
  yml: ['.yaml', '.yml'],
};

function matchesFileType(path: string, type: string | undefined): boolean {
  if (!type) return true;
  const extensions = FILE_TYPE_EXTENSIONS[type.toLowerCase()];
  if (!extensions) return false;
  const lower = path.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension));
}

function compileGrepPattern(pattern: string, ignoreCase: boolean, multiline: boolean): RegExp {
  return new RegExp(pattern, `g${ignoreCase ? 'i' : ''}${multiline ? 'ms' : ''}`);
}

function matchingLineIndexes(lines: readonly string[], pattern: RegExp): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    pattern.lastIndex = 0;
    if (pattern.test(lines[index])) indexes.push(index);
  }
  return indexes;
}

function contentRows(
  relativePath: string,
  lines: readonly string[],
  matches: readonly number[],
  before: number,
  after: number,
  lineNumbers: boolean,
): string[] {
  const matchSet = new Set(matches);
  const visible = new Set<number>();
  for (const index of matches) {
    for (
      let current = Math.max(0, index - before);
      current <= Math.min(lines.length - 1, index + after);
      current++
    ) {
      visible.add(current);
    }
  }
  return [...visible]
    .sort((a, b) => a - b)
    .map((index) => {
      const separator = matchSet.has(index) ? ':' : '-';
      return lineNumbers
        ? `${relativePath}${separator}${index + 1}${separator}${lines[index]}`
        : `${relativePath}${separator}${lines[index]}`;
    });
}

export function buildGrepTool(
  repoRoot: string,
  readMounts: readonly FsReadMount[],
): AgentTool<typeof grepSchema> {
  const mounts = buildMounts(repoRoot, readMounts);
  return {
    name: 'grep',
    label: 'Grep',
    description:
      'Search files with a regular expression. Defaults to files_with_matches; supports content, count, glob, type, context, pagination, and multiline modes.',
    parameters: grepSchema,
    execute: async (_id, params) => {
      const resolved = resolveMountedPath(mounts, params.mount, params.path);
      if (!resolved) return textResult('rejected: invalid mount or path outside mount root');
      if (isExcludedMountPath(resolved.mount, resolved.path)) {
        return textResult(`rejected: path is excluded from mount ${resolved.mount.name}`);
      }

      let pattern: RegExp;
      try {
        pattern = compileGrepPattern(
          params.pattern,
          params['-i'] ?? false,
          params.multiline ?? false,
        );
      } catch (err) {
        return textResult(
          `invalid regular expression: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (params.type && !FILE_TYPE_EXTENSIONS[params.type.toLowerCase()]) {
        return textResult(`unsupported file type: ${params.type}`);
      }

      try {
        if (!(await isSymlinkSafe(resolved.mount, resolved.path))) {
          return textResult('rejected: path resolves outside mount root');
        }
        let files = await collectFiles(resolved.mount, resolved.path);
        files = files.filter((path) => {
          const rel = mountRelativePath(resolved.mount, path);
          return Boolean(
            rel &&
            (!params.glob || matchesGlob(rel, params.glob)) &&
            matchesFileType(rel, params.type),
          );
        });

        const mode = params.output_mode ?? 'files_with_matches';
        const before = params['-C'] ?? params['-B'] ?? 0;
        const after = params['-C'] ?? params['-A'] ?? 0;
        const rows: string[] = [];
        let totalMatches = 0;

        for (const file of files) {
          const stat = await fs.stat(file);
          if (stat.size > GREP_FILE_MAX_CHARS) continue;
          const content = await fs.readFile(file, 'utf8');
          if (content.includes('\0')) continue;
          const rel = mountRelativePath(resolved.mount, file);
          if (!rel) continue;

          if (params.multiline) {
            pattern.lastIndex = 0;
            const matches = [...content.matchAll(pattern)];
            if (matches.length === 0) continue;
            totalMatches += matches.length;
            if (mode === 'files_with_matches') rows.push(rel);
            else if (mode === 'count') rows.push(`${rel}:${matches.length}`);
            else {
              for (const match of matches) {
                const line = content.slice(0, match.index).split('\n').length;
                const value = match[0].replaceAll('\n', '\\n');
                rows.push(params['-n'] === false ? `${rel}:${value}` : `${rel}:${line}:${value}`);
              }
            }
            continue;
          }

          const lines = content.split(/\r?\n/);
          const matches = matchingLineIndexes(lines, pattern);
          if (matches.length === 0) continue;
          totalMatches += matches.length;
          if (mode === 'files_with_matches') rows.push(rel);
          else if (mode === 'count') rows.push(`${rel}:${matches.length}`);
          else {
            rows.push(...contentRows(rel, lines, matches, before, after, params['-n'] !== false));
          }
        }

        if (mode === 'count' && rows.length > 0) rows.push(`total:${totalMatches}`);
        const offset = params.offset ?? 0;
        const limit = params.head_limit ?? FS_RESULT_DEFAULT_LIMIT;
        const page = rows.slice(offset, offset + limit);
        const suffix =
          offset + page.length < rows.length
            ? `\n...[${rows.length - offset - page.length} more results]`
            : '';
        return textResult(page.length > 0 ? `${page.join('\n')}${suffix}` : 'No matches found.');
      } catch (err) {
        return textResult(`grep failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
