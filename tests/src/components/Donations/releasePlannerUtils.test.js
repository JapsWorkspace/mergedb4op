import {
  buildReleasePreviewSummary,
  buildReleaseRequestPayload,
} from "./releasePlannerUtils";

describe("releasePlannerUtils", () => {
  test("builds a combined payload for food, monetary, and appliance releases", () => {
    expect(
      buildReleaseRequestPayload({
        reliefRequestId: "req-1",
        remarks: "Ready for dispatch",
        needsFood: true,
        needsMonetary: true,
        needsAppliance: true,
        selectedTemplateId: "template-1",
        foodPacksToRelease: "12",
        releaseMonetaryAmount: "5000",
        applianceSelections: [
          {
            inventoryItemId: "inv-app-1",
            itemName: "Rice Cooker",
            category: "kitchen",
            quantityReleased: "2",
            unit: "unit",
            remarks: "Priority evac center",
          },
          {
            inventoryItemId: "inv-app-2",
            itemName: "Electric Fan",
            category: "cooling",
            quantityReleased: "0",
            unit: "unit",
            remarks: "",
          },
        ],
      })
    ).toEqual({
      reliefRequestId: "req-1",
      remarks: "Ready for dispatch",
      releaseMode: "template",
      foodPackTemplateId: "template-1",
      foodPacksToRelease: 12,
      releasedMonetaryAmount: 5000,
      items: [
        {
          inventoryItemId: "inv-app-1",
          itemType: "appliance",
          itemName: "Rice Cooker",
          category: "kitchen",
          quantityReleased: 2,
          unit: "unit",
          remarks: "Priority evac center",
        },
      ],
    });
  });

  test("includes appliance quantities in release preview totals", () => {
    expect(
      buildReleasePreviewSummary({
        needsFood: true,
        needsMonetary: true,
        computedTemplateItems: [
          { quantityReleased: 10 },
          { quantityReleased: 20 },
        ],
        foodPacksToRelease: "5",
        releaseMonetaryAmount: "1500",
        applianceSelections: [
          { quantityReleased: "2" },
          { quantityReleased: "1" },
          { quantityReleased: "0" },
        ],
      })
    ).toEqual({
      lineItems: 4,
      totalQuantity: 33,
      packCount: 5,
      totalMonetary: 1500,
      applianceUnits: 3,
    });
  });

  test("builds review summary totals that stay consistent when zero-quantity appliance noise is present", () => {
    const baseSummary = buildReleasePreviewSummary({
      needsFood: true,
      needsMonetary: true,
      computedTemplateItems: [
        { quantityReleased: 55 },
        { quantityReleased: 55 },
      ],
      foodPacksToRelease: "110",
      releaseMonetaryAmount: "1000",
      applianceSelections: [{ quantityReleased: "10" }],
    });

    const noisySummary = buildReleasePreviewSummary({
      needsFood: true,
      needsMonetary: true,
      computedTemplateItems: [
        { quantityReleased: 55 },
        { quantityReleased: 55 },
      ],
      foodPacksToRelease: "110",
      releaseMonetaryAmount: "1000",
      applianceSelections: [
        { quantityReleased: "10" },
        { quantityReleased: "0" },
        { quantityReleased: 0 },
      ],
    });

    expect(noisySummary).toEqual(baseSummary);
    expect(baseSummary).toEqual({
      lineItems: 3,
      totalQuantity: 120,
      packCount: 110,
      totalMonetary: 1000,
      applianceUnits: 10,
    });
  });
});
