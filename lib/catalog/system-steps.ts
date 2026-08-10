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

export function isSystemStepName(value: unknown): value is SystemStepName {
  return SYSTEM_STEPS.some((step) => step.name === value);
}

export function systemStepByName(value: unknown): SystemStep | null {
  return SYSTEM_STEPS.find((step) => step.name === value) ?? null;
}
