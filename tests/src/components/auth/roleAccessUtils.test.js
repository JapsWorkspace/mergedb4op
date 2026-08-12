import {
  ANALYTICS_TAB_DONATIONS,
  ANALYTICS_TAB_EVACUATION,
  ANALYTICS_TAB_INCIDENTS,
  ANALYTICS_TAB_INVENTORY,
  ANALYTICS_TAB_OVERVIEW,
  ANALYTICS_TAB_RELIEF,
  canAccessAnalyticsTab,
  canEditInventoryType,
  canViewInventoryType,
  getAnalyticsPageTitle,
  getAnalyticsTabsForRole,
  getDashboardVariantForRole,
  getDonationQueueOwnerLabel,
  getDonationQueueTypeForRole,
  getHomePathForRole,
  getInventoryEditableTypes,
  getInventoryViewTypes,
  getReliefBasePathForRole,
  getReliefReviewerLabel,
} from "./roleAccessUtils";

describe("roleAccessUtils", () => {
  it("maps accountant to its own home path and dashboard variant", () => {
    expect(getHomePathForRole("accountant")).toBe("/accountant/dashboard");
    expect(getDashboardVariantForRole("accountant")).toBe("accountant");
  });

  it("limits accountant analytics tabs to overview, inventory, donations, and relief", () => {
    expect(getAnalyticsTabsForRole("accountant")).toEqual([
      { key: ANALYTICS_TAB_OVERVIEW, label: "Overview" },
      { key: ANALYTICS_TAB_INVENTORY, label: "Inventory" },
      { key: ANALYTICS_TAB_DONATIONS, label: "Donations" },
      { key: ANALYTICS_TAB_RELIEF, label: "Relief Requests" },
    ]);
    expect(canAccessAnalyticsTab("accountant", ANALYTICS_TAB_INCIDENTS)).toBe(false);
    expect(canAccessAnalyticsTab("accountant", ANALYTICS_TAB_EVACUATION)).toBe(false);
    expect(getAnalyticsPageTitle("accountant")).toBe("Accountant Analytics");
  });

  it("gives accountant view access to all inventory types but edit access only to monetary", () => {
    expect(getInventoryViewTypes("accountant")).toEqual([
      "goods",
      "appliance",
      "monetary",
    ]);
    expect(getInventoryEditableTypes("accountant")).toEqual(["monetary"]);
    expect(canViewInventoryType("accountant", "goods")).toBe(true);
    expect(canViewInventoryType("accountant", "appliance")).toBe(true);
    expect(canEditInventoryType("accountant", "monetary")).toBe(true);
    expect(canEditInventoryType("accountant", "goods")).toBe(false);
  });

  it("treats accountant like the monetary queue owner for donation and relief flows", () => {
    expect(getDonationQueueTypeForRole("accountant")).toBe("monetary");
    expect(getDonationQueueOwnerLabel("accountant")).toBe("Accountant");
    expect(getReliefBasePathForRole("accountant")).toBe("/accountant");
    expect(getReliefReviewerLabel("accountant")).toBe("Accountant");
  });
});
