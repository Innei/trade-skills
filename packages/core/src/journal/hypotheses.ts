import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Hypothesis, HypothesisRunCard, HypothesisStatus } from '@kansoku/shared/types';
import { JOURNAL_DIR } from '../platform/env.js';
import { ClientError } from '../platform/errors.js';
import { nextSnowflake } from '../db/snowflake.js';

function defaultDir(): string {
  return join(JOURNAL_DIR, 'hypotheses');
}

function fileOf(dir: string, id: string): string {
  if (!/^[\w-]+$/.test(id)) throw new ClientError('invalid hypothesis id');
  return join(dir, `${id}.json`);
}

async function readOne(dir: string, id: string): Promise<Hypothesis | null> {
  try {
    return JSON.parse(await fs.readFile(fileOf(dir, id), 'utf8')) as Hypothesis;
  } catch {
    return null;
  }
}

async function writeOne(dir: string, hypothesis: Hypothesis): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(fileOf(dir, hypothesis.id), `${JSON.stringify(hypothesis, null, 2)}\n`, 'utf8');
}

export async function listHypotheses(dir: string = defaultDir()): Promise<Hypothesis[]> {
  let files: string[];
  try {
    files = await fs.readdir(dir);
  } catch {
    return [];
  }
  const rows: Hypothesis[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const row = await readOne(dir, file.slice(0, -5));
    if (row) rows.push(row);
  }
  return rows.sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || b.id.localeCompare(a.id),
  );
}

export function getHypothesis(id: string, dir: string = defaultDir()): Promise<Hypothesis | null> {
  return readOne(dir, id);
}

export async function createHypothesis(
  input: { thesis: string; symbol?: string; invalidation_notes: string[] },
  dir: string = defaultDir(),
): Promise<Hypothesis> {
  const thesis = input.thesis.trim();
  if (!thesis) throw new ClientError('thesis is required');
  const notes = input.invalidation_notes.map((note) => note.trim()).filter(Boolean);
  if (notes.length === 0)
    throw new ClientError('invalidation_notes is required', '没有证伪条件的论点无法对账');
  const now = new Date().toISOString();
  const hypothesis: Hypothesis = {
    id: `h-${nextSnowflake()}`,
    thesis,
    ...(input.symbol ? { symbol: input.symbol } : {}),
    status: 'active',
    invalidation_notes: notes,
    run_cards: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeOne(dir, hypothesis);
  return hypothesis;
}

async function requireHypothesis(id: string, dir: string): Promise<Hypothesis> {
  const hypothesis = await readOne(dir, id);
  if (!hypothesis) throw new ClientError('hypothesis not found', undefined, 404);
  return hypothesis;
}

export async function appendRunCard(
  id: string,
  card: Omit<HypothesisRunCard, 'at'> & { at?: string },
  dir: string = defaultDir(),
): Promise<Hypothesis> {
  const hypothesis = await requireHypothesis(id, dir);
  const summary = card.summary.trim();
  if (!summary) throw new ClientError('run card summary is required');
  const now = new Date().toISOString();
  hypothesis.run_cards.push({ ...card, summary, at: card.at ?? now });
  hypothesis.updatedAt = now;
  await writeOne(dir, hypothesis);
  return hypothesis;
}

export async function updateHypothesisStatus(
  id: string,
  status: HypothesisStatus,
  dir: string = defaultDir(),
): Promise<Hypothesis> {
  const hypothesis = await requireHypothesis(id, dir);
  if (hypothesis.status !== 'active' && status !== hypothesis.status) {
    throw new ClientError(
      `hypothesis is already ${hypothesis.status}`,
      '状态只能从 active 流转一次；要重启论点请新建一条并引用旧的',
    );
  }
  hypothesis.status = status;
  hypothesis.updatedAt = new Date().toISOString();
  await writeOne(dir, hypothesis);
  return hypothesis;
}
