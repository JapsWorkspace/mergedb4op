const assert = require("assert");
const {
  validateInventoryExpirationDate,
} = require("./inventoryExpiryValidation");

assert.strictEqual(
  validateInventoryExpirationDate("2026-05-10", new Date("2026-05-11T08:00:00Z")),
  "Expiration date cannot be in the past."
);

assert.strictEqual(
  validateInventoryExpirationDate("2026-05-11", new Date("2026-05-11T08:00:00Z")),
  ""
);

assert.strictEqual(
  validateInventoryExpirationDate("2026-05-12", new Date("2026-05-11T08:00:00Z")),
  ""
);

assert.strictEqual(
  validateInventoryExpirationDate("bad-date"),
  "Invalid expiration date."
);

console.log("inventoryExpiryValidation tests passed");
