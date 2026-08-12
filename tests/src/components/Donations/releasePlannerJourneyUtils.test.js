import {
  buildReleaseJourneySteps,
  getInitialJourneyStep,
  getJourneyStepMeta,
  getNextJourneyStep,
  isJourneyStepComplete,
} from "./releasePlannerJourneyUtils";

describe("releasePlannerJourneyUtils", () => {
  test("buildReleaseJourneySteps includes only pending support steps plus review", () => {
    expect(
      buildReleaseJourneySteps({
        pendingFood: true,
        pendingMonetary: true,
        pendingAppliance: true,
      })
    ).toEqual(["food", "monetary", "appliance", "review"]);

    expect(
      buildReleaseJourneySteps({
        pendingFood: true,
        pendingMonetary: false,
        pendingAppliance: true,
      })
    ).toEqual(["food", "appliance", "review"]);
  });

  test("getNextJourneyStep stays locked until the current step is completed", () => {
    const steps = ["food", "monetary", "review"];

    expect(
      getNextJourneyStep({
        steps,
        currentStep: "food",
        completedSteps: [],
      })
    ).toBeNull();

    expect(
      getNextJourneyStep({
        steps,
        currentStep: "food",
        completedSteps: ["food"],
      })
    ).toBe("monetary");
  });

  test("returns the first applicable step when planner state resets for a new request", () => {
    expect(getInitialJourneyStep(["food", "monetary", "review"])).toBe("food");
    expect(getInitialJourneyStep(["appliance", "review"])).toBe("appliance");
    expect(getInitialJourneyStep(["review"])).toBe("review");
  });

  test("getJourneyStepMeta returns stable labels for journey rendering", () => {
    expect(getJourneyStepMeta("food")).toMatchObject({
      key: "food",
      shortLabel: "Food Packs",
    });
    expect(getJourneyStepMeta("review")).toMatchObject({
      key: "review",
      shortLabel: "Review",
    });
    expect(getJourneyStepMeta("unknown")).toMatchObject({
      key: "unknown",
      shortLabel: "Step",
    });
  });

  test("isJourneyStepComplete returns true for a valid food step", () => {
    expect(
      isJourneyStepComplete({
        step: "food",
        state: {
          selectedTemplateId: "tpl-1",
          foodPacksToRelease: "110",
          requiredFoodPacks: 110,
          computedTemplateItems: [
            { itemName: "Rice", quantityReleased: 110 },
          ],
        },
      })
    ).toBe(true);
  });

  test("isJourneyStepComplete returns true for valid monetary and appliance steps", () => {
    expect(
      isJourneyStepComplete({
        step: "monetary",
        state: {
          releaseMonetaryAmount: "1000",
          requiredMonetaryAmount: 1000,
        },
      })
    ).toBe(true);

    expect(
      isJourneyStepComplete({
        step: "appliance",
        state: {
          requestedApplianceQuantity: 10,
          applianceSelections: [
            { inventoryItemId: "inv-1", quantityReleased: 6 },
            { inventoryItemId: "inv-2", quantityReleased: 4 },
          ],
        },
      })
    ).toBe(true);
  });
});
