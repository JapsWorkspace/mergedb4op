import {
  buildInventoryItemLookup,
  getTemplateItemHealth,
  getTemplateExpiryStatus,
  isLowStockQuantity,
  summarizeTemplateHealth,
} from "./foodPackTemplateHealthUtils";

describe("foodPackTemplateHealthUtils", () => {
  test("flags low, expiring, and expired template items separately", () => {
    const today = new Date();
    const soonDate = new Date(today);
    soonDate.setDate(soonDate.getDate() + 10);
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 60);
    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 2);

    const inventoryLookup = buildInventoryItemLookup([
      { _id: "rice", quantity: 12, expirationDate: soonDate.toISOString() },
      { _id: "water", quantity: 120, expirationDate: futureDate.toISOString() },
      { _id: "sardines", quantity: 55, expirationDate: pastDate.toISOString() },
    ]);

    const summary = summarizeTemplateHealth(
      {
        items: [
          { inventoryItemId: "rice", itemName: "Rice" },
          { inventoryItemId: "water", itemName: "Water" },
          { inventoryItemId: "sardines", itemName: "Sardines" },
        ],
      },
      inventoryLookup
    );

    expect(summary.unavailableCount).toBe(0);
    expect(summary.lowCount).toBe(1);
    expect(summary.expiringCount).toBe(1);
    expect(summary.expiredCount).toBe(1);
  });

  test("treats missing inventory items as unavailable", () => {
    const summary = summarizeTemplateHealth({
      items: [{ inventoryItemId: "missing", itemName: "Missing Item" }],
    });

    expect(summary.unavailableCount).toBe(1);
    expect(summary.lowCount).toBe(0);
    expect(summary.expiringCount).toBe(0);
    expect(summary.expiredCount).toBe(0);
    expect(summary.hasBlockedItems).toBe(true);
  });

  test("uses the same low-stock threshold as inventory", () => {
    expect(isLowStockQuantity(0)).toBe(true);
    expect(isLowStockQuantity(19)).toBe(true);
    expect(isLowStockQuantity(20)).toBe(false);
  });

  test("separates expiring from expired dates", () => {
    const today = new Date();
    const soonDate = new Date(today);
    soonDate.setDate(soonDate.getDate() + 5);
    const pastDate = new Date(today);
    pastDate.setDate(pastDate.getDate() - 1);

    expect(getTemplateExpiryStatus(soonDate.toISOString())).toBe("soon");
    expect(getTemplateExpiryStatus(pastDate.toISOString())).toBe("expired");
  });

  test("uses the earliest matching inventory batch for merged items", () => {
    const today = new Date();
    const soonDate = new Date(today);
    soonDate.setDate(soonDate.getDate() + 3);
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + 20);

    const lookup = buildInventoryItemLookup([
      {
        _id: "chicken-late",
        name: "Chicken",
        itemName: "Chicken",
        category: "food",
        unit: "pcs",
        quantity: 8,
        expirationDate: futureDate.toISOString(),
        createdAt: today.toISOString(),
      },
      {
        _id: "chicken-soon",
        name: "Chicken",
        itemName: "Chicken",
        category: "food",
        unit: "pcs",
        quantity: 2,
        expirationDate: soonDate.toISOString(),
        createdAt: today.toISOString(),
      },
    ]);

    const health = getTemplateItemHealth(
      {
        inventoryItemId: "chicken-late",
        itemName: "Chicken",
        category: "food",
        unit: "pcs",
      },
      lookup
    );

    expect(health.inventoryItem?._id).toBe("chicken-soon");
    expect(health.availableQuantity).toBe(2);
    expect(health.expiryStatus).toBe("soon");
  });
});

