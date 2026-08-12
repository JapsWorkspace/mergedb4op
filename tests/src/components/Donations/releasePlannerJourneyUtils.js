const toNumber = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const JOURNEY_STEP_META = {
  food: {
    key: "food",
    shortLabel: "Food Packs",
    title: "Plan food pack release",
    description:
      "Choose a food pack template and match the exact approved pack count before continuing.",
  },
  monetary: {
    key: "monetary",
    shortLabel: "Monetary",
    title: "Plan monetary release",
    description:
      "Prepare the approved cash support and confirm the full remaining amount for this request.",
  },
  appliance: {
    key: "appliance",
    shortLabel: "Appliances",
    title: "Plan appliance release",
    description:
      "Match the requested appliance quantity using available stock before moving to review.",
  },
  review: {
    key: "review",
    shortLabel: "Review",
    title: "Review release plan",
    description:
      "Check the combined release summary, add final remarks, and submit the release.",
  },
};

export const buildReleaseJourneySteps = ({
  pendingFood = false,
  pendingMonetary = false,
  pendingAppliance = false,
} = {}) => {
  const steps = [];

  if (pendingFood) steps.push("food");
  if (pendingMonetary) steps.push("monetary");
  if (pendingAppliance) steps.push("appliance");

  steps.push("review");
  return steps;
};

export const getInitialJourneyStep = (steps = []) => steps[0] || "review";

export const getJourneyStepMeta = (step = "") =>
  JOURNEY_STEP_META[step] || {
    key: step,
    shortLabel: "Step",
    title: "Release step",
    description: "Complete the required release details to continue.",
  };

export const getNextJourneyStep = ({
  steps = [],
  currentStep = "",
  completedSteps = [],
} = {}) => {
  const currentIndex = steps.indexOf(currentStep);
  if (currentIndex === -1) return null;
  if (!completedSteps.includes(currentStep)) return null;

  return steps[currentIndex + 1] || null;
};

export const isJourneyStepComplete = ({ step = "", state = {} } = {}) => {
  if (step === "food") {
    return (
      String(state.selectedTemplateId || "").trim() !== "" &&
      toNumber(state.foodPacksToRelease) === toNumber(state.requiredFoodPacks) &&
      Array.isArray(state.computedTemplateItems) &&
      state.computedTemplateItems.length > 0
    );
  }

  if (step === "monetary") {
    return (
      toNumber(state.releaseMonetaryAmount) > 0 &&
      toNumber(state.releaseMonetaryAmount) === toNumber(state.requiredMonetaryAmount)
    );
  }

  if (step === "appliance") {
    const totalReleased = (Array.isArray(state.applianceSelections)
      ? state.applianceSelections
      : []
    ).reduce((sum, item) => sum + toNumber(item?.quantityReleased), 0);

    return totalReleased === toNumber(state.requestedApplianceQuantity);
  }

  if (step === "review") return true;
  return false;
};
