const assert = require("assert");
const {
  buildRequestDistributionCaps,
} = require("./reliefDistributionMath");
const {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
} = require("./reliefSupportTypes");

const test = (name, fn) => {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

test("buildRequestDistributionCaps uses received fulfillment fallback for mixed foodpack and appliance requests", () => {
  const caps = buildRequestDistributionCaps({
    supportTypes: [SUPPORT_TYPE_FOODPACKS, SUPPORT_TYPE_APPLIANCE],
    releases: [
      {
        releaseStatus: "received",
        foodPacksReleased: 0,
        items: [
          {
            itemType: "goods",
            itemName: "Bottled Water",
            category: "drinks",
            quantityReleased: 120,
            unit: "cases",
          },
          {
            itemType: "goods",
            itemName: "Rice Cooker",
            category: "cooling appliances",
            quantityReleased: 10,
            unit: "pcs",
          },
        ],
      },
    ],
    request: {
      fulfillment: {
        receivedFoodPacks: 120,
        receivedApplianceQuantity: 10,
      },
    },
  });

  assert.deepStrictEqual(caps, {
    foodPacks: 120,
    monetaryAmount: 0,
    applianceUnits: 10,
    allowsFood: true,
    allowsMonetary: false,
    allowsAppliance: true,
  });
});

console.log("reliefDistributionMath tests passed");
