import {
  getInventoryImportModeConfig,
  validateInventoryImportRow,
} from "./inventoryImportUtils";

describe("inventoryImportUtils", () => {
  test("accepts only goods-shaped rows in goods mode", () => {
    const config = getInventoryImportModeConfig("goods");

    expect(
      validateInventoryImportRow(
        {
          itemName: "Rice",
          category: "Food",
          quantity: "100",
          unit: "packs",
        },
        config
      )
    ).toEqual({ isValid: true, issue: "" });

    expect(
      validateInventoryImportRow(
        {
          donorName: "ABC Foundation",
          amount: "1000",
          referenceNumber: "REF-1",
        },
        config
      )
    ).toEqual({
      isValid: false,
      issue: "This row does not match the active Goods import format.",
    });
  });

  test("accepts only monetary-shaped rows in monetary mode", () => {
    const config = getInventoryImportModeConfig("monetary");

    expect(
      validateInventoryImportRow(
        {
          donorName: "ABC Foundation",
          amount: "1000",
          referenceNumber: "REF-1",
        },
        config
      )
    ).toEqual({ isValid: true, issue: "" });

    expect(
      validateInventoryImportRow(
        {
          itemName: "Electric Fan",
          category: "Cooling Appliances",
          quantity: "10",
        },
        config
      )
    ).toEqual({
      isValid: false,
      issue: "This row does not match the active Monetary import format.",
    });
  });

  test("accepts only appliance-shaped rows in appliances mode", () => {
    const config = getInventoryImportModeConfig("appliance");

    expect(
      validateInventoryImportRow(
        {
          itemName: "Electric Fan",
          category: "Cooling Appliances",
          quantity: "10",
          condition: "brand_new",
        },
        config
      )
    ).toEqual({ isValid: true, issue: "" });

    expect(
      validateInventoryImportRow(
        {
          itemName: "Rice",
          category: "Food",
          quantity: "100",
          unit: "packs",
        },
        config
      )
    ).toEqual({
      isValid: false,
      issue: "This row does not match the active Appliances import format.",
    });
  });
});
