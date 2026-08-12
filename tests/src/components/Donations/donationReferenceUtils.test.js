import {
  getDonationReferenceKey,
  groupDonationRowsByReference,
} from "./donationReferenceUtils";

describe("donationReferenceUtils", () => {
  test("uses normalized reference number as group key when present", () => {
    expect(
      getDonationReferenceKey({ _id: "1", referenceNumber: " REF-123 " })
    ).toBe("ref:ref-123");
  });

  test("falls back to id when reference number is missing", () => {
    expect(getDonationReferenceKey({ _id: "abc" })).toBe("id:abc");
  });

  test("groups duplicate donations by reference number", () => {
    const result = groupDonationRowsByReference([
      {
        _id: "1",
        referenceNumber: "REF-123",
        status: "pending",
        createdAt: "2026-05-11T01:00:00.000Z",
      },
      {
        _id: "2",
        referenceNumber: "ref-123",
        status: "pending",
        createdAt: "2026-05-11T02:00:00.000Z",
      },
      {
        _id: "3",
        referenceNumber: "",
        status: "pending",
        createdAt: "2026-05-11T03:00:00.000Z",
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].duplicateCount || result[1].duplicateCount).toBeGreaterThan(1);
    expect(
      result.find((item) => item.referenceNumber)?.groupedDonationIds.sort()
    ).toEqual(["1", "2"]);
  });
});
