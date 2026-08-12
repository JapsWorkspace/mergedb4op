import { isConfirmationSubmitDisabled } from "./requestReviewUtils";

describe("requestReviewUtils", () => {
  test("requires a non-empty rejection reason before confirm is enabled", () => {
    expect(
      isConfirmationSubmitDisabled({
        action: "reject",
        rejectReason: "",
        submittingAction: false,
      })
    ).toBe(true);

    expect(
      isConfirmationSubmitDisabled({
        action: "reject",
        rejectReason: "   ",
        submittingAction: false,
      })
    ).toBe(true);

    expect(
      isConfirmationSubmitDisabled({
        action: "reject",
        rejectReason: "Insufficient supporting details.",
        submittingAction: false,
      })
    ).toBe(false);
  });

  test("keeps non-reject confirmations enabled unless currently submitting", () => {
    expect(
      isConfirmationSubmitDisabled({
        action: "approve",
        rejectReason: "",
        submittingAction: false,
      })
    ).toBe(false);

    expect(
      isConfirmationSubmitDisabled({
        action: "approve",
        rejectReason: "",
        submittingAction: true,
      })
    ).toBe(true);
  });
});
