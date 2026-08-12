const test = require("node:test");
const assert = require("node:assert/strict");

const {
  canManageDonationType,
  canManageInventoryType,
  canManageReliefRequest,
  getDonationAccessError,
  getInventoryAccessError,
  getReviewerLabel,
  isMonetaryOnlySupportTypes,
  isPrivilegedStaffRole,
} = require("./roleAccessUtils");

test("accountant is treated as a privileged staff role", () => {
  assert.equal(isPrivilegedStaffRole("accountant"), true);
  assert.equal(isPrivilegedStaffRole("barangay"), false);
});

test("accountant can manage only monetary inventory and donations", () => {
  assert.equal(canManageInventoryType("accountant", "monetary"), true);
  assert.equal(canManageInventoryType("accountant", "goods"), false);
  assert.equal(
    getInventoryAccessError("accountant", "goods"),
    "Accountant can only manage monetary inventory records here."
  );

  assert.equal(canManageDonationType("accountant", "monetary"), true);
  assert.equal(canManageDonationType("accountant", "appliance"), false);
  assert.equal(
    getDonationAccessError("accountant", "appliance"),
    "Accountant can only manage monetary donations in this queue."
  );
});

test("accountant can manage only monetary-only relief requests", () => {
  const monetaryOnly = ["monetary"];
  const mixedSupport = ["monetary", "foodpacks"];

  assert.equal(isMonetaryOnlySupportTypes(monetaryOnly), true);
  assert.equal(isMonetaryOnlySupportTypes(mixedSupport), false);
  assert.equal(canManageReliefRequest("accountant", monetaryOnly), true);
  assert.equal(canManageReliefRequest("accountant", mixedSupport), false);
  assert.equal(getReviewerLabel("accountant"), "Accountant");
});

test("admin can manage every relief request support type", () => {
  assert.equal(canManageReliefRequest("admin", ["monetary"]), true);
  assert.equal(canManageReliefRequest("admin", ["foodpacks"]), true);
  assert.equal(canManageReliefRequest("admin", ["appliance"]), true);
  assert.equal(canManageReliefRequest("admin", ["monetary", "foodpacks"]), true);
  assert.equal(
    canManageReliefRequest("admin", ["monetary", "foodpacks", "appliance"]),
    true
  );
  assert.equal(getReviewerLabel("admin"), "Admin");
});
