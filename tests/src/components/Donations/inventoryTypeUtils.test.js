import { resolveInventoryType } from "./inventoryTypeUtils";

describe("resolveInventoryType", () => {
  test("keeps explicit valid types", () => {
    expect(resolveInventoryType({ type: "goods" })).toBe("goods");
    expect(resolveInventoryType({ type: "appliance" })).toBe("appliance");
    expect(resolveInventoryType({ type: "monetary" })).toBe("monetary");
  });

  test("derives appliance from appliance-specific fields", () => {
    expect(resolveInventoryType({ condition: "brand_new", quantity: 2 })).toBe(
      "appliance"
    );
  });

  test("derives monetary from amount or reference number", () => {
    expect(resolveInventoryType({ amount: 5200 })).toBe("monetary");
    expect(resolveInventoryType({ referenceNumber: "ABC-123" })).toBe("monetary");
  });

  test("falls back to goods", () => {
    expect(resolveInventoryType({ name: "Rice", quantity: 10, unit: "packs" })).toBe(
      "goods"
    );
  });
});
