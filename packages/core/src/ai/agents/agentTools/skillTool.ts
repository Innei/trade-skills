import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { textResult } from '../dataTools.js';
import { readSkill, type SkillMeta } from '../skills.js';

const readSkillSchema = Type.Object({ name: Type.String() });

export function buildReadSkillTool(
  skillIndex: SkillMeta[],
  onRead?: (name: string) => void,
): AgentTool<typeof readSkillSchema> {
  return {
    name: 'read_skill',
    label: 'Read Skill',
    description: 'Load the full SKILL.md text for a named skill.',
    parameters: readSkillSchema,
    execute: async (_id, params) => {
      const text = readSkill(skillIndex, params.name);
      if (text) onRead?.(params.name);
      return textResult(text ?? `unknown skill: ${params.name}`);
    },
  };
}
