const normalize = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const getStatusPriority = (status) => {
  const normalized = normalize(status);
  if (normalized === "resubmitted") return 4;
  if (normalized === "pending") return 3;
  if (normalized === "received") return 2;
  if (normalized === "not_received") return 1;
  return 0;
};

export function getDonationReferenceKey(donation) {
  const reference = normalize(
    donation?.normalizedReferenceNumber || donation?.referenceNumber
  );
  if (reference) return `ref:${reference}`;
  return `id:${String(donation?._id || "").trim()}`;
}

export function groupDonationRowsByReference(rows = []) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = getDonationReferenceKey(row);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        ...row,
        duplicateCount: 1,
        groupedDonationIds: [row?._id].filter(Boolean),
      });
      return;
    }

    const existingPriority = getStatusPriority(existing?.status);
    const nextPriority = getStatusPriority(row?.status);
    const existingTime = new Date(existing?.updatedAt || existing?.createdAt || 0).getTime();
    const nextTime = new Date(row?.updatedAt || row?.createdAt || 0).getTime();
    const preferred =
      nextPriority > existingPriority
        ? row
        : nextPriority < existingPriority
        ? existing
        : nextTime >= existingTime
        ? row
        : existing;

    groups.set(key, {
      ...preferred,
      duplicateCount: Number(existing.duplicateCount || 1) + 1,
      groupedDonationIds: [
        ...new Set([...existing.groupedDonationIds, row?._id].filter(Boolean)),
      ],
    });
  });

  return Array.from(groups.values());
}
