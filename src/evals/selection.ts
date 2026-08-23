import { assertValidEvalCase, type EvalCase } from "./schema.js";

function skillName(value: string): string {
  return value.trim().toLowerCase();
}

/** Select cases for changed skills, including cases that declare those skills as dependencies. */
export function selectEvalCases(
  changedSkills: readonly string[],
  cases: readonly EvalCase[],
): EvalCase[] {
  const changed = new Set(changedSkills.map(skillName));
  for (const item of cases) assertValidEvalCase(item);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const item of cases) {
      const target = skillName(item.targetSkill);
      if (
        changed.has(target) ||
        item.dependencySkills.some((dependency) => changed.has(skillName(dependency)))
      ) {
        if (!changed.has(target)) {
          changed.add(target);
          expanded = true;
        }
      }
    }
  }
  return cases.filter((item) => changed.has(skillName(item.targetSkill)));
}

export const selectCasesForChangedSkills = selectEvalCases;
export const selectCases = selectEvalCases;
