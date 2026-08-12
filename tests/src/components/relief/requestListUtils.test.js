import {
  getRequestEditBadgeLabel,
  getVisibleCenterCount,
  getVisibleRowTotals,
  getVisibleRows,
} from "./requestListUtils";

describe("requestListUtils", () => {
  test("ignores turned-off evacuation rows in visible center counts", () => {
    const request = {
      rows: [
        {
          evacuationCenterName: "Bank",
          isActiveRow: true,
          male: 20,
          female: 22,
          requestedFoodPacks: 60,
        },
        {
          evacuationCenterName: "OldChurch",
          isActiveRow: true,
          male: 68,
          female: 43,
          requestedFoodPacks: 60,
        },
        {
          evacuationCenterName: "trynotif",
          isActiveRow: false,
          male: 99,
          female: 101,
          requestedFoodPacks: 50,
        },
      ],
    };

    expect(getVisibleRows(request)).toEqual([
      {
        evacuationCenterName: "Bank",
        isActiveRow: true,
        male: 20,
        female: 22,
        requestedFoodPacks: 60,
      },
      {
        evacuationCenterName: "OldChurch",
        isActiveRow: true,
        male: 68,
        female: 43,
        requestedFoodPacks: 60,
      },
    ]);
    expect(getVisibleCenterCount(request)).toBe(2);
    expect(getVisibleRowTotals(request)).toEqual({
      households: 0,
      families: 0,
      male: 88,
      female: 65,
      lgbtq: 0,
      pwd: 0,
      pregnant: 0,
      senior: 0,
      requestedFoodPacks: 120,
    });
  });

  test("labels rejected request follow-up as resubmitted instead of edited", () => {
    expect(
      getRequestEditBadgeLabel({
        isEditedAfterSubmit: true,
        lastEditAction: "resubmitted",
      })
    ).toBe("Resubmitted");

    expect(
      getRequestEditBadgeLabel({
        isEditedAfterSubmit: true,
        lastEditAction: "updated",
      })
    ).toBe("Edited");
  });
});
