import { promises as fs } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { skillSearchDirs } from "../env.js";
import { loadSkillIndex, readSkill, skillIndexPrompt } from "../services/skills.js";
import { buildBashTool, buildReadFileTool, buildReadSkillTool, type ExecFn, type ExecResult } from "./agentTools.js";
import { textResult } from "./dataTools.js";

export type { ExecFn, ExecResult };

export const DEEP_DIVE_SKILL = "stock-deep-dive";

export function loadDeepDiveSkillText(repoRoot: string): string | null {
  return readSkill(loadSkillIndex(skillSearchDirs(repoRoot)), DEEP_DIVE_SKILL);
}

/**
 * The six-lens flow is preloaded in full rather than left to the model to fetch via read_skill.
 * Asking the model to load its own discipline means a run that silently skips read_skill still
 * counts as a success — the discipline becomes a request instead of a guarantee.
 *
 * Both texts are injected, not read here, so this stays a pure function; the runner owns the
 * fail-closed check.
 */
export function buildSystemPrompt(repoRoot: string, deepDiveSkill: string, disciplineText = ""): string {
  const index = loadSkillIndex(skillSearchDirs(repoRoot));

  const own = [
    "You are an equity research agent maintaining per-stock six-lens notes in this repo.",
    `The full ${DEEP_DIVE_SKILL} skill is appended below — follow its flow and anti-patterns verbatim.`,
    "Available skills (load any of these with read_skill when the flow calls for them):",
    skillIndexPrompt(index),
    "Tool usage rules:",
    "- Use bash to run the longbridge CLI and python scripts under .claude/skills; NEVER write files via bash (no redirection, tee, rm, mv, cp).",
    "- Use read_file to inspect repo-relative files (e.g. an existing stocks/{SYMBOL}.md note).",
    "- write_note is the ONLY way to persist your findings; it always writes stocks/{SYMBOL}.md for the symbol you were asked to research.",
    "- A run that never calls write_note is a FAILED run. Do not finish without calling it.",
    "Note-writing rules:",
    "- Update the existing note incrementally; do not discard prior sections unless they are stale.",
    "- Keep tickers and CLI/API names (e.g. NVDA, longbridge) in English.",
    "",
    "---",
    "",
    deepDiveSkill,
  ].join("\n");

  return disciplineText ? [disciplineText, "", "---", "", own].join("\n") : own;
}

const writeNoteSchema = Type.Object({ content: Type.String() });

export function buildTools(
  repoRoot: string,
  symbol: string,
  exec: ExecFn,
  stocksDir?: string,
  onNoteWritten?: () => void,
): AgentTool[] {
  const skillIndex = loadSkillIndex(skillSearchDirs(repoRoot));
  const notesDir = stocksDir ?? join(repoRoot, "stocks");

  const writeNoteTool: AgentTool<typeof writeNoteSchema> = {
    name: "write_note",
    label: "Write Note",
    description: `Write the updated note for ${symbol} to stocks/${symbol}.md. This is the only way to persist findings.`,
    parameters: writeNoteSchema,
    execute: async (_id, params) => {
      const content = params.content;
      if (!content.trim()) return textResult("rejected: content is empty");
      const path = join(notesDir, `${symbol}.md`);
      await fs.mkdir(notesDir, { recursive: true });
      await fs.writeFile(path, content, "utf8");
      onNoteWritten?.();
      return textResult(`written to stocks/${symbol}.md`);
    },
  };

  return [buildReadSkillTool(skillIndex), buildBashTool(exec), buildReadFileTool(repoRoot), writeNoteTool];
}
