import { describe, expect, it } from "vitest";
import {
  SYSTEM_STEPS,
  isSystemStepName,
  systemStepByName,
} from "@/lib/catalog/system-steps";

describe("The System", () => {
  it("exposes the governed seven-step order and Routine Groups", () => {
    expect(SYSTEM_STEPS).toEqual([
      { name: "CLEANSE", position: 1, routineGroup: "core" },
      { name: "REFINE", position: 2, routineGroup: "beyond_core" },
      { name: "TREAT", position: 3, routineGroup: "core" },
      { name: "FRAME", position: 4, routineGroup: "beyond_core" },
      { name: "SEAL", position: 5, routineGroup: "core" },
      { name: "PROTECT", position: 6, routineGroup: "beyond_core" },
      { name: "LIFT", position: 7, routineGroup: "beyond_core" },
    ]);
  });

  it("resolves only canonical uppercase System Step Names", () => {
    expect(systemStepByName("TREAT")).toEqual({
      name: "TREAT",
      position: 3,
      routineGroup: "core",
    });
    expect(isSystemStepName("PROTECT")).toBe(true);
    expect(isSystemStepName("Protect")).toBe(false);
    expect(systemStepByName("UNKNOWN")).toBeNull();
  });
});
