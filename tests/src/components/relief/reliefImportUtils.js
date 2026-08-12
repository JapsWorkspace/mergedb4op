import {
  isMonetaryMixedWithOtherSupport,
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  normalizeSupportTypes,
} from "./supportTypes";
import { normalizeHeader } from "../shared/spreadsheetImportUtils";

export const RELIEF_IMPORT_HEADER_ALIASES = {
  requestType: [
    "requesttype",
    "request type",
    "supporttype",
    "support type",
    "assistance type",
    "relief type",
  ],
  requestedMonetaryAmount: [
    "requestedmonetaryamount",
    "requested monetary amount",
    "monetaryamount",
    "monetary amount",
    "requestedcashsupport",
    "requested cash support",
    "cashsupport",
    "cash support",
    "amount",
  ],
  applianceItemName: [
    "applianceitemname",
    "appliance item name",
    "applianceitem",
    "appliance item",
    "appliancename",
    "appliance name",
    "requested appliance",
    "requestedappliance",
  ],
  applianceCategory: [
    "appliancecategory",
    "appliance category",
    "requested appliance category",
    "requestedappliancecategory",
  ],
  requestedApplianceQuantity: [
    "requestedappliancequantity",
    "requested appliance quantity",
    "appliancequantity",
    "appliance quantity",
    "applianceqty",
    "appliance qty",
    "appliance units",
    "applianceunits",
  ],
  applianceRemarks: [
    "applianceremarks",
    "appliance remarks",
    "appliance notes",
    "appliancenotes",
  ],
  evacuationCenterName: [
    "evacuationcentername",
    "evacuation center name",
    "evacuation center",
    "evacuationcenter",
    "centername",
    "center name",
    "evacuation site",
    "evacuationsite",
    "evac name",
    "name",
  ],
  households: ["households", "household"],
  families: ["families", "family"],
  male: ["male", "males"],
  female: ["female", "females"],
  lgbtq: ["lgbtq", "lgbt", "lgbtqia", "lgbtqia+"],
  pwd: ["pwd", "pwds", "personswithdisability", "personwithdisability"],
  pregnant: ["pregnant", "pregnantwomen", "pregnant woman", "pregnant women"],
  senior: ["senior", "seniors", "seniorcitizen", "senior citizen", "seniorcitizens"],
  requestedFoodPacks: [
    "requestedfoodpacks",
    "requested food packs",
    "foodpacks",
    "food packs",
    "requestedpacks",
    "packsrequested",
    "packs",
  ],
  rowRemarks: ["rowremarks", "row remarks", "remarks", "notes", "comment", "comments"],
};

export const normalizeImportedRequestType = (value) => {
  const normalized = normalizeHeader(value);
  if (!normalized) return "";
  if (["foodpacks", "food packs", "foodpack", "food", "packs"].includes(normalized)) {
    return SUPPORT_TYPE_FOODPACKS;
  }
  if (["monetary", "cash", "cash support", "money"].includes(normalized)) {
    return SUPPORT_TYPE_MONETARY;
  }
  if (["appliance", "appliances"].includes(normalized)) {
    return SUPPORT_TYPE_APPLIANCE;
  }
  if (
    [
      "both",
      "foodpacks+monetary",
      "food packs + monetary",
      "food packs and monetary",
      "food and monetary",
      "goods and monetary",
    ].includes(normalized)
  ) {
    return "both";
  }
  if (
    ["foodpacks+appliance", "food packs + appliance", "food packs and appliance"].includes(
      normalized
    )
  ) {
    return "foodpacks_appliance";
  }
  if (
    ["monetary+appliance", "monetary + appliance", "monetary and appliance"].includes(
      normalized
    )
  ) {
    return "monetary_appliance";
  }
  if (["all", "all support", "food packs + monetary + appliance"].includes(normalized)) {
    return "all";
  }
  return "";
};

export const buildImportSummaryText = (summary, formatMoney) => {
  if (!summary) return "";
  const supportTypeText = summary.requestType ? ` - ${summary.requestType}` : "";
  const monetaryText =
    summary.requestedMonetaryAmount > 0
      ? ` - PHP ${formatMoney(summary.requestedMonetaryAmount)} monetary`
      : "";
  const applianceText =
    summary.requestedApplianceQuantity > 0
      ? ` - ${summary.requestedApplianceQuantity} appliance unit(s)`
      : "";
  return `${summary.totalRows} row${summary.totalRows === 1 ? "" : "s"} imported - ${summary.matchedRows} matched - ${summary.unmatchedRows} unmatched${supportTypeText}${monetaryText}${applianceText}`;
};

export const deriveImportedSupportTypes = ({
  importedRequestType = "",
  derivedFoodPackTotal = 0,
  importedMonetaryAmount = 0,
  importedAppliances = [],
  previousSupportTypes = [],
}) => {
  const normalizedImportedSupportTypes = importedRequestType
    ? normalizeSupportTypes([], importedRequestType)
    : [];

  if (normalizedImportedSupportTypes.length > 0) {
    if (isMonetaryMixedWithOtherSupport(normalizedImportedSupportTypes)) {
      return [SUPPORT_TYPE_MONETARY];
    }
    return normalizedImportedSupportTypes;
  }

  const inferredSupportTypes = [];
  if (Number(derivedFoodPackTotal || 0) > 0) {
    inferredSupportTypes.push(SUPPORT_TYPE_FOODPACKS);
  }
  if (Number(importedMonetaryAmount || 0) > 0) {
    inferredSupportTypes.push(SUPPORT_TYPE_MONETARY);
  }
  if (Array.isArray(importedAppliances) && importedAppliances.length > 0) {
    inferredSupportTypes.push(SUPPORT_TYPE_APPLIANCE);
  }

  const normalizedPreviousSupportTypes = normalizeSupportTypes(previousSupportTypes);
  const shouldPreserveManualSupportTypes =
    normalizedPreviousSupportTypes.length > 1 ||
    normalizedPreviousSupportTypes.includes(SUPPORT_TYPE_MONETARY) ||
    normalizedPreviousSupportTypes.includes(SUPPORT_TYPE_APPLIANCE);

  if (!shouldPreserveManualSupportTypes) {
    if (inferredSupportTypes.length > 0) {
      const normalizedInferred = normalizeSupportTypes(inferredSupportTypes);
      if (isMonetaryMixedWithOtherSupport(normalizedInferred)) {
        return [SUPPORT_TYPE_MONETARY];
      }
      return normalizedInferred;
    }
    return normalizeSupportTypes([SUPPORT_TYPE_FOODPACKS]);
  }

  const normalizedMerged = normalizeSupportTypes([
    ...normalizedPreviousSupportTypes,
    ...inferredSupportTypes,
  ]);

  if (isMonetaryMixedWithOtherSupport(normalizedMerged)) {
    return [SUPPORT_TYPE_MONETARY];
  }

  return normalizedMerged;
};

export const shouldShowConfirmReceivedAction = ({
  canReceiveAnyRelease = false,
  stage = "",
  requestStatus = "",
  releaseRecords = [],
  hasReceiptEvidence = false,
}) => {
  const normalizedStage = String(stage || "").trim().toLowerCase();
  const normalizedStatus = String(requestStatus || "").trim().toLowerCase();

  if (normalizedStage === "completed" || normalizedStatus === "completed") {
    return false;
  }

   if (hasReceiptEvidence) {
    return false;
  }

  const normalizedPendingReleases = Array.isArray(releaseRecords)
    ? releaseRecords.filter((release) => {
        const status = String(
          release?.status ||
            release?.releaseStatus ||
            release?.receiveStatus ||
            release?.receiptStatus ||
            release?.acknowledgementStatus ||
            ""
        )
          .trim()
          .toLowerCase();

        return status !== "received" && status !== "completed" && status !== "cancelled";
      })
    : [];

  if (normalizedPendingReleases.length > 0) {
    return true;
  }

  if (canReceiveAnyRelease) return true;

  if (["released_waiting_receipt", "partially_released"].includes(normalizedStage)) {
    return Array.isArray(releaseRecords) && releaseRecords.length > 0;
  }

  if (["released", "partially_released"].includes(normalizedStatus)) {
    return Array.isArray(releaseRecords) && releaseRecords.length > 0;
  }

  return false;
};
