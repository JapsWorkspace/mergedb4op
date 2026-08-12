function sanitizeReferenceLike(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDonationReferenceNumber(value) {
  return sanitizeReferenceLike(value).toLowerCase();
}

function hasNormalizedDonationReference(value) {
  return Boolean(normalizeDonationReferenceNumber(value));
}

module.exports = {
  normalizeDonationReferenceNumber,
  hasNormalizedDonationReference,
};
