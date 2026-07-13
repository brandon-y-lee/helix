import { describe, expect, it } from "vitest";
import {
  productRoutineForSlug,
  productRoutinePresentationBySlug,
} from "@/lib/catalog/product-routine";

describe("commerce routine presentation", () => {
  it("maps the core products to visible Core steps 01-03", () => {
    expect(productRoutineForSlug("cleanse-01-calming-gel-cleanser")).toMatchObject(
      {
        routineGroup: "core",
        routineGroupLabel: "The Core",
        routineStepNumber: 1,
        routineStepName: "Cleanse",
        routineDisplayLabel: "01 — The Core",
        routineSort: 10,
      },
    );
    expect(productRoutineForSlug("treat-03-pdrn-5-ampoule")).toMatchObject({
      routineStepNumber: 2,
      routineStepName: "Treat",
      routineDisplayLabel: "02 — The Core",
      routineSort: 20,
    });
    expect(productRoutineForSlug("seal-05-green-collagen-cream")).toMatchObject({
      routineStepNumber: 3,
      routineStepName: "Seal",
      routineDisplayLabel: "03 — The Core",
      routineSort: 30,
    });
  });

  it("maps beyond-core products without visible step numbers", () => {
    for (const slug of [
      "refine-02-pore-treatment-pads",
      "frame-04-pdrn-eye-cream",
      "lift-06-pdrn-mask-system",
    ]) {
      expect(productRoutineForSlug(slug)).toMatchObject({
        routineGroup: "beyond_core",
        routineGroupLabel: "Beyond The Core",
        routineStepNumber: null,
        routineStepName: null,
        routineDisplayLabel: "Beyond The Core",
      });
    }
  });

  it("does not create a commerce routine mapping for PROTECT", () => {
    expect(productRoutineForSlug("protect")).toBeNull();
    expect(Object.keys(productRoutinePresentationBySlug)).not.toContain("protect");
  });
});
