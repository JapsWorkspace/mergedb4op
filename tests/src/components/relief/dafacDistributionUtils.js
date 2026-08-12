const SUPPORT_TYPE_FOODPACKS = "foodpacks";
const SUPPORT_TYPE_MONETARY = "monetary";
const SUPPORT_TYPE_APPLIANCE = "appliance";
const DEFAULT_PAGE_SIZE = 3;

const normalizeText = (value) => String(value || "").trim();
const normalizeKey = (value) => normalizeText(value).toLowerCase();
const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toWholeNumber = (value) => Math.max(0, Math.trunc(toNumber(value)));

const normalizeSupportTypes = (supportTypes = []) => {
  const values = Array.isArray(supportTypes) ? supportTypes : [];
  const seen = new Set();

  return values
    .map(normalizeKey)
    .filter((value) => {
      const isSupported = [
        SUPPORT_TYPE_FOODPACKS,
        SUPPORT_TYPE_MONETARY,
        SUPPORT_TYPE_APPLIANCE,
      ].includes(value);

      if (!isSupported || seen.has(value)) {
        return false;
      }

      seen.add(value);
      return true;
    });
};

const buildFamilyName = (record = {}) => {
  const surname = normalizeText(record?.headOfFamily?.surname);
  const firstName = normalizeText(record?.headOfFamily?.firstName);
  const middleName = normalizeText(record?.headOfFamily?.middleName);
  const givenNames = [firstName, middleName].filter(Boolean).join(" ");

  if (surname && givenNames) {
    return `${surname}, ${givenNames}`;
  }

  return surname || givenNames || normalizeText(record?.signOff?.familyHeadPrintedName) || "-";
};

const getDafacAidVisibility = ({ supportTypes = [], caps = {} } = {}) => {
  const normalizedSupportTypes = new Set(normalizeSupportTypes(supportTypes));
  const allowsFood =
    normalizedSupportTypes.has(SUPPORT_TYPE_FOODPACKS) || Boolean(caps?.allowsFood);
  const allowsMonetary =
    normalizedSupportTypes.has(SUPPORT_TYPE_MONETARY) || Boolean(caps?.allowsMonetary);
  const allowsAppliances =
    normalizedSupportTypes.has(SUPPORT_TYPE_APPLIANCE) || Boolean(caps?.allowsAppliance);

  return {
    showsFoodPacks: allowsFood,
    showsMonetary: allowsMonetary,
    showsAppliances: allowsAppliances,
  };
};

const createEmptyDafacRecord = ({
  defaultEvacuationCenterName = "",
  visibility = {},
} = {}) => ({
  _id: "",
  serialNo: "",
  evacuationCenterName: normalizeText(defaultEvacuationCenterName),
  siteLabel: "",
  distributionDate: new Date().toISOString().slice(0, 10),
  distributionStatus: "completed",
  headOfFamily: {
    surname: "",
    firstName: "",
    middleName: "",
  },
  distribution: {
    foodPacksReceived: visibility.showsFoodPacks ? "0" : "",
    monetaryAmountReceived: visibility.showsMonetary ? "0" : "",
    applianceUnitsReceived: visibility.showsAppliances ? "0" : "",
  },
  remarks: "",
});

const normalizeApplianceUnits = (record = {}) =>
  toWholeNumber(
    record?.distribution?.applianceUnitsReceived ??
      (Array.isArray(record?.distribution?.applianceItems)
        ? record.distribution.applianceItems.reduce(
            (sum, item) => sum + toWholeNumber(item?.quantityReceived),
            0
          )
        : 0)
  );

const normalizeDafacRecord = (record = {}) => ({
  _id: normalizeText(record?._id),
  serialNo: normalizeText(record?.serialNo),
  evacuationCenterName: normalizeText(record?.evacuationCenterName),
  siteLabel: normalizeText(record?.siteLabel),
  distributionDate: normalizeText(record?.distributionDate).slice(0, 10),
  distributionStatus:
    normalizeKey(record?.distributionStatus) === "draft" ? "draft" : "completed",
  headOfFamily: {
    surname: normalizeText(record?.headOfFamily?.surname),
    firstName: normalizeText(record?.headOfFamily?.firstName),
    middleName: normalizeText(record?.headOfFamily?.middleName),
  },
  distribution: {
    foodPacksReceived:
      record?.distribution?.foodPacksReceived === ""
        ? ""
        : String(toWholeNumber(record?.distribution?.foodPacksReceived)),
    monetaryAmountReceived:
      record?.distribution?.monetaryAmountReceived === ""
        ? ""
        : String(toNumber(record?.distribution?.monetaryAmountReceived)),
    applianceUnitsReceived:
      record?.distribution?.applianceUnitsReceived === ""
        ? ""
        : String(normalizeApplianceUnits(record)),
  },
  remarks: normalizeText(record?.remarks),
});

const validateDafacRecord = (record = {}, { visibility = {} } = {}) => {
  if (!normalizeText(record?.serialNo)) {
    return "Serial number is required.";
  }

  if (!normalizeText(record?.evacuationCenterName)) {
    return "Evacuation center is required.";
  }

  if (!normalizeText(record?.distributionDate)) {
    return "Distribution date is required.";
  }

  if (
    !normalizeText(record?.headOfFamily?.surname) &&
    !normalizeText(record?.headOfFamily?.firstName)
  ) {
    return "Family head name is required.";
  }

  const hasAnyAid =
    (visibility.showsFoodPacks && toWholeNumber(record?.distribution?.foodPacksReceived) > 0) ||
    (visibility.showsMonetary && toNumber(record?.distribution?.monetaryAmountReceived) > 0) ||
    (visibility.showsAppliances && toWholeNumber(record?.distribution?.applianceUnitsReceived) > 0);

  if (!hasAnyAid) {
    return "Enter at least one released aid value for this family.";
  }

  return "";
};

const buildDafacRecordPayload = (record = {}) => ({
  serialNo: normalizeText(record?.serialNo),
  evacuationCenterName: normalizeText(record?.evacuationCenterName),
  siteLabel: normalizeText(record?.siteLabel),
  distributionDate: normalizeText(record?.distributionDate),
  distributionStatus: "completed",
  headOfFamily: {
    surname: normalizeText(record?.headOfFamily?.surname),
    firstName: normalizeText(record?.headOfFamily?.firstName),
    middleName: normalizeText(record?.headOfFamily?.middleName),
    sex: "",
    age: 0,
    birthDate: null,
    occupation: "",
    monthlyIncome: 0,
  },
  familyProfile: {
    is4PsBeneficiary: false,
    isIpBeneficiary: false,
    ipEthnicity: "",
  },
  housingProfile: {
    tenureStatus: "",
    housingCondition: "",
  },
  healthProfile: {
    healthCondition: "",
  },
  familyMembers: [],
  distribution: {
    foodPacksReceived: toWholeNumber(record?.distribution?.foodPacksReceived),
    monetaryAmountReceived: toNumber(record?.distribution?.monetaryAmountReceived),
    applianceUnitsReceived: toWholeNumber(record?.distribution?.applianceUnitsReceived),
  },
  signOff: {
    familyHeadPrintedName: buildFamilyName(record),
    familyHeadSignatureImage: "",
    barangayOfficerPrintedName: "",
    barangayOfficerSignatureImage: "",
    lswdoPrintedName: "",
    lswdoSignatureImage: "",
  },
  remarks: normalizeText(record?.remarks),
});

const paginateDafacRecords = (records = [], options = {}) => {
  const normalizedRecords = Array.isArray(records) ? records : [];
  const pageSize = Math.max(1, toWholeNumber(options.pageSize) || DEFAULT_PAGE_SIZE);
  const totalItems = normalizedRecords.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const requestedPage = Math.max(1, toWholeNumber(options.page) || 1);
  const page = Math.min(requestedPage, totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    items: normalizedRecords.slice(startIndex, startIndex + pageSize),
  };
};

const buildAccomplishedDistributionSummary = ({
  supportTypes = [],
  caps = {},
  records = [],
} = {}) => {
  const normalizedRecords = Array.isArray(records) ? records : [];
  const completedRecords = normalizedRecords.filter(
    (record) => normalizeKey(record?.distributionStatus) === "completed"
  );
  const visibility = getDafacAidVisibility({ supportTypes, caps });

  const totals = completedRecords.reduce(
    (summary, record) => ({
      foodPacksUsed:
        summary.foodPacksUsed + toWholeNumber(record?.distribution?.foodPacksReceived),
      monetaryUsed: summary.monetaryUsed + toNumber(record?.distribution?.monetaryAmountReceived),
      applianceUnitsUsed:
        summary.applianceUnitsUsed + normalizeApplianceUnits(record),
    }),
    {
      foodPacksUsed: 0,
      monetaryUsed: 0,
      applianceUnitsUsed: 0,
    }
  );

  const foodPacksCap = toWholeNumber(caps?.foodPacks);
  const monetaryCap = toNumber(caps?.monetaryAmount);
  const applianceUnitsCap = toWholeNumber(caps?.applianceUnits);
  const latestCompletedAt = completedRecords.reduce((latestValue, record) => {
    const candidate = record?.distributionDate || record?.updatedAt || record?.createdAt || null;
    if (!candidate) return latestValue;
    if (!latestValue) return candidate;
    return new Date(candidate).getTime() > new Date(latestValue).getTime()
      ? candidate
      : latestValue;
  }, null);

  return {
    visibility,
    completedCount: completedRecords.length,
    totals: {
      foodPacksUsed: totals.foodPacksUsed,
      monetaryUsed: totals.monetaryUsed,
      applianceUnitsUsed: totals.applianceUnitsUsed,
      foodPacksCap,
      foodPacksRemaining: Math.max(0, foodPacksCap - totals.foodPacksUsed),
      monetaryCap,
      monetaryRemaining: Math.max(0, monetaryCap - totals.monetaryUsed),
      applianceUnitsCap,
      applianceUnitsRemaining: Math.max(0, applianceUnitsCap - totals.applianceUnitsUsed),
    },
    completedRecords,
    latestCompletedAt,
    perFamilyFoodPackRows: completedRecords.map((record) => ({
      recordId: normalizeText(record?._id),
      serialNo: normalizeText(record?.serialNo) || "-",
      familyName: buildFamilyName(record),
      distributionDate: record?.distributionDate || null,
      foodPacksReceived: toWholeNumber(record?.distribution?.foodPacksReceived),
      monetaryAmountReceived: toNumber(record?.distribution?.monetaryAmountReceived),
      applianceUnitsReceived: normalizeApplianceUnits(record),
    })),
  };
};

module.exports = {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  buildAccomplishedDistributionSummary,
  buildDafacRecordPayload,
  buildFamilyName,
  createEmptyDafacRecord,
  getDafacAidVisibility,
  normalizeDafacRecord,
  paginateDafacRecords,
  validateDafacRecord,
};
