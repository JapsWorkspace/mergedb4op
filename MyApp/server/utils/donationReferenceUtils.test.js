const assert = require("assert");
const {
  normalizeDonationReferenceNumber,
  hasNormalizedDonationReference,
} = require("./donationReferenceUtils");

assert.strictEqual(
  normalizeDonationReferenceNumber(" REF-123  "),
  "ref-123"
);

assert.strictEqual(
  normalizeDonationReferenceNumber(""),
  ""
);

assert.strictEqual(hasNormalizedDonationReference("REF-123"), true);
assert.strictEqual(hasNormalizedDonationReference("   "), false);

console.log("donationReferenceUtils tests passed");
