import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_ROOT, skillSearchDirs } from "../src/env.js";
import {
  DISCIPLINE_SKILL,
  DisciplineMissingError,
  disciplineFor,
  loadSharedDiscipline,
  withDiscipline,
} from "../src/ai/promptPolicy.js";

const discipline = loadSharedDiscipline(PROJECT_ROOT);

describe("shared discipline", () => {
  it("loads from the skill tree", () => {
    expect(discipline).toBeTruthy();
    expect(discipline).toContain("TD-VERIFY-01");
    expect(discipline).toContain("TD-GAAP-01");
    expect(discipline).toContain("TD-UNIT-01");
  });
});

describe("disciplineFor", () => {
  it("gives judgment agents the full discipline", () => {
    const text = disciplineFor("judgment", PROJECT_ROOT);
    expect(text).toContain("TD-GAAP-01");
    expect(text).toContain("supported / partial / contradicted / insufficient");
  });

  it("gives the observer a compact contract, not the data-trap rules", () => {
    const text = disciplineFor("observer", PROJECT_ROOT);
    expect(text).toContain("只描述输入里能观察到的变化");
    // The observer never reads a financial statement; these rules would be pure cost.
    expect(text).not.toContain("TD-GAAP-01");
    expect(text).not.toContain("TD-QOQ-01");
  });

  it("gives mechanical agents nothing", () => {
    expect(disciplineFor("mechanical", PROJECT_ROOT)).toBe("");
  });

  it("fails closed for judgment agents when the discipline is unreachable", () => {
    expect(() => disciplineFor("judgment", "/nonexistent-repo-root")).toThrow(DisciplineMissingError);
  });

  it("leaves a mechanical prompt untouched", () => {
    expect(withDiscipline("mechanical", PROJECT_ROOT, "own prompt")).toBe("own prompt");
  });

  it("prepends the discipline for judgment agents", () => {
    const merged = withDiscipline("judgment", PROJECT_ROOT, "OWN_PROMPT_MARKER");
    expect(merged).toContain("TD-VERIFY-01");
    expect(merged.indexOf("TD-VERIFY-01")).toBeLessThan(merged.indexOf("OWN_PROMPT_MARKER"));
  });
});

// The whole point of a single source is that no other skill restates it. A copied rule silently
// diverges — capital-rotation once told the model to convert capital-flow units while CLAUDE.md
// forbade exactly that. Cite the rule ID; never paste the prose.
describe("no discipline text is duplicated into other skills", () => {
  const FINGERPRINTS = [
    "supported / partial / contradicted / insufficient",
    "用户的判断是一项待检验假设",
    "强制平仓不含信息",
    "记录原始数值 + 你推断的单位",
  ];

  const skillFiles: { name: string; text: string }[] = [];
  for (const dir of skillSearchDirs(PROJECT_ROOT)) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry === DISCIPLINE_SKILL) continue;
      try {
        skillFiles.push({ name: entry, text: readFileSync(join(dir, entry, "SKILL.md"), "utf8") });
      } catch {
        // not a skill dir
      }
    }
  }

  it.each(FINGERPRINTS)("no skill copies %j", (fingerprint) => {
    const offenders = skillFiles.filter((s) => s.text.includes(fingerprint)).map((s) => s.name);
    expect(offenders).toEqual([]);
  });
});
