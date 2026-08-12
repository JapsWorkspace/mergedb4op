import {
  getTodayInputDate,
  validateFutureOrTodayInventoryDate,
} from "./inventoryExpiryUtils";

describe("inventoryExpiryUtils", () => {
  test("formats today's date for date inputs", () => {
    expect(getTodayInputDate(new Date("2026-05-11T15:30:00Z"))).toBe("2026-05-11");
  });

  test("rejects past expiration dates", () => {
    expect(
      validateFutureOrTodayInventoryDate(
        "2026-05-10",
        new Date("2026-05-11T08:00:00Z")
      )
    ).toBe("Expiration date cannot be in the past.");
  });

  test("accepts today and future expiration dates", () => {
    expect(
      validateFutureOrTodayInventoryDate(
        "2026-05-11",
        new Date("2026-05-11T08:00:00Z")
      )
    ).toBe("");

    expect(
      validateFutureOrTodayInventoryDate(
        "2026-05-12",
        new Date("2026-05-11T08:00:00Z")
      )
    ).toBe("");
  });

  test("rejects invalid expiration dates", () => {
    expect(validateFutureOrTodayInventoryDate("not-a-date")).toBe(
      "Expiration date is invalid."
    );
  });
});
