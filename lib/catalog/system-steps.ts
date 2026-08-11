export const SYSTEM_STEPS = [
  { name: "CLEANSE", position: 1, routineGroup: "core" },
  { name: "REFINE", position: 2, routineGroup: "beyond_core" },
  { name: "TREAT", position: 3, routineGroup: "core" },
  { name: "FRAME", position: 4, routineGroup: "beyond_core" },
  { name: "SEAL", position: 5, routineGroup: "core" },
  { name: "PROTECT", position: 6, routineGroup: "beyond_core" },
  { name: "LIFT", position: 7, routineGroup: "beyond_core" },
] as const;

export type SystemStep = (typeof SYSTEM_STEPS)[number];
export type SystemStepName = SystemStep["name"];
export type SystemStepRoutineGroup = SystemStep["routineGroup"];
export type GovernedSystemStep = {
  name: SystemStepName;
  position: number;
  routineGroup: SystemStepRoutineGroup;
};
export type SystemStepDatabaseRow = {
  name: string;
  position: number;
  routine_group: string;
};
export type SystemStepDatabaseRelation =
  | SystemStepDatabaseRow
  | SystemStepDatabaseRow[]
  | null;

export const SYSTEM_STEP_NAMES = SYSTEM_STEPS.map((step) => step.name);
export const CORE_SYSTEM_STEPS = [
  SYSTEM_STEPS[0],
  SYSTEM_STEPS[2],
  SYSTEM_STEPS[4],
] as const;

export type CoreSystemStep = (typeof CORE_SYSTEM_STEPS)[number];

export function isSystemStepName(value: unknown): value is SystemStepName {
  return SYSTEM_STEPS.some((step) => step.name === value);
}

export function systemStepByName(value: unknown): SystemStep | null {
  return SYSTEM_STEPS.find((step) => step.name === value) ?? null;
}

export function systemStepFromDatabaseRelation(
  relation: SystemStepDatabaseRelation,
): GovernedSystemStep | null {
  const row = Array.isArray(relation) ? relation[0] : relation;
  if (
    !row ||
    !isSystemStepName(row.name) ||
    !Number.isSafeInteger(row.position) ||
    row.position < 1 ||
    row.position > 7 ||
    (row.routine_group !== "core" && row.routine_group !== "beyond_core")
  ) {
    return null;
  }
  return {
    name: row.name,
    position: row.position,
    routineGroup: row.routine_group,
  };
}

export function isCoreSystemStep(
  step: GovernedSystemStep,
): step is CoreSystemStep {
  return CORE_SYSTEM_STEPS.some(
    (candidate) =>
      candidate.name === step.name &&
      candidate.position === step.position &&
      candidate.routineGroup === step.routineGroup,
  );
}
