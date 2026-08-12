import {
  deriveImportedSupportTypes,
  shouldShowConfirmReceivedAction,
} from "./reliefImportUtils";
import {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
} from "./supportTypes";

describe("reliefImportUtils", () => {
  test("derives food packs plus appliance when imported rows include appliance data and food packs", () => {
    expect(
      deriveImportedSupportTypes({
        importedRequestType: "",
        derivedFoodPackTotal: 120,
        importedMonetaryAmount: 0,
        importedAppliances: [
          { itemName: "Electric Fan", category: "Cooling Appliances", quantityRequested: "10" },
        ],
        previousSupportTypes: [SUPPORT_TYPE_FOODPACKS],
      })
    ).toEqual([SUPPORT_TYPE_FOODPACKS, SUPPORT_TYPE_APPLIANCE]);
  });

  test("forces imported monetary plus appliance back to standalone monetary", () => {
    expect(
      deriveImportedSupportTypes({
        importedRequestType: "",
        derivedFoodPackTotal: 0,
        importedMonetaryAmount: 1000,
        importedAppliances: [
          { itemName: "Electric Fan", category: "Cooling Appliances", quantityRequested: "10" },
        ],
        previousSupportTypes: [SUPPORT_TYPE_MONETARY],
      })
    ).toEqual([SUPPORT_TYPE_MONETARY]);
  });

  test("forces imported all-support rows back to standalone monetary when cash is present", () => {
    expect(
      deriveImportedSupportTypes({
        importedRequestType: "",
        derivedFoodPackTotal: 110,
        importedMonetaryAmount: 1000,
        importedAppliances: [
          { itemName: "Electric Fan", category: "Cooling Appliances", quantityRequested: "10" },
        ],
        previousSupportTypes: [SUPPORT_TYPE_FOODPACKS, SUPPORT_TYPE_MONETARY],
      })
    ).toEqual([SUPPORT_TYPE_MONETARY]);
  });

  test("shows confirm received for waiting receipt journey even if canReceiveAnyRelease was not provided", () => {
    expect(
      shouldShowConfirmReceivedAction({
        canReceiveAnyRelease: false,
        stage: "released_waiting_receipt",
        requestStatus: "released",
        releaseRecords: [{ releaseStatus: "released" }],
      })
    ).toBe(true);
  });

  test("hides confirm received when there are no pending release records left", () => {
    expect(
      shouldShowConfirmReceivedAction({
        canReceiveAnyRelease: true,
        stage: "completed",
        requestStatus: "received",
        releaseRecords: [{ releaseStatus: "received" }],
        hasReceiptEvidence: true,
      })
    ).toBe(false);
  });

  test("keeps confirm received visible for step 4 requests that still have release history to confirm", () => {
    expect(
      shouldShowConfirmReceivedAction({
        canReceiveAnyRelease: false,
        stage: "released_waiting_receipt",
        requestStatus: "released",
        releaseRecords: [{ releaseStatus: "unknown", items: [{ itemName: "Rice" }] }],
        hasReceiptEvidence: false,
      })
    ).toBe(true);
  });

    test("hides confirm received once receipt evidence already exists", () => {
      expect(
        shouldShowConfirmReceivedAction({
          canReceiveAnyRelease: false,
          stage: "released_waiting_receipt",
          requestStatus: "released",
          releaseRecords: [{ releaseStatus: "received", items: [{ itemName: "Rice" }] }],
          hasReceiptEvidence: true,
        })
      ).toBe(false);
    });
  });
