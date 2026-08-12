const assert = require("assert");
const {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  buildAccomplishedDistributionSummary,
  buildDafacRecordPayload,
  createEmptyDafacRecord,
  getDafacAidVisibility,
  paginateDafacRecords,
} = require("./dafacDistributionUtils");

const test = (name, fn) => {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
};

test("paginates family cards in groups of three and clamps the requested page", () => {
  const records = Array.from({ length: 7 }, (_, index) => ({
    _id: `record-${index + 1}`,
    serialNo: `DAFAC-${index + 1}`,
  }));

  assert.deepStrictEqual(paginateDafacRecords(records, { page: 5, pageSize: 3 }), {
    page: 3,
    pageSize: 3,
    totalItems: 7,
    totalPages: 3,
    items: [records[6]],
  });
});

test("shows request-aware support sections for the relief type being distributed", () => {
  assert.deepStrictEqual(
    getDafacAidVisibility({
      supportTypes: [
        SUPPORT_TYPE_FOODPACKS,
        SUPPORT_TYPE_MONETARY,
        SUPPORT_TYPE_APPLIANCE,
      ],
      caps: {
        foodPacks: 25,
        monetaryAmount: 0,
        applianceUnits: 4,
      },
    }),
    {
      showsFoodPacks: true,
      showsMonetary: true,
      showsAppliances: true,
    }
  );
});

test("builds accomplished totals from completed records and includes per-family food pack counts", () => {
  const summary = buildAccomplishedDistributionSummary({
    supportTypes: [SUPPORT_TYPE_FOODPACKS, SUPPORT_TYPE_MONETARY],
    caps: {
      foodPacks: 20,
      monetaryAmount: 5000,
      applianceUnits: 0,
    },
    records: [
      {
        _id: "completed-1",
        distributionStatus: "completed",
        serialNo: "DAFAC-001",
        headOfFamily: { surname: "Cruz", firstName: "Ana" },
        distributionDate: "2026-05-12T00:00:00.000Z",
        distribution: {
          foodPacksReceived: 4,
          monetaryAmountReceived: 1000,
          applianceUnitsReceived: 0,
        },
      },
      {
        _id: "draft-1",
        distributionStatus: "draft",
        serialNo: "DAFAC-002",
        headOfFamily: { surname: "Lopez", firstName: "Ben" },
        distribution: {
          foodPacksReceived: 9,
          monetaryAmountReceived: 900,
          applianceUnitsReceived: 0,
        },
      },
      {
        _id: "completed-2",
        distributionStatus: "completed",
        serialNo: "DAFAC-003",
        headOfFamily: { surname: "Santos", firstName: "Cara" },
        distributionDate: "2026-05-13T00:00:00.000Z",
        distribution: {
          foodPacksReceived: 6,
          monetaryAmountReceived: 1500,
          applianceUnitsReceived: 0,
        },
      },
    ],
  });

  assert.deepStrictEqual(summary.visibility, {
    showsFoodPacks: true,
    showsMonetary: true,
    showsAppliances: false,
  });
  assert.equal(summary.completedCount, 2);
  assert.deepStrictEqual(summary.totals, {
    foodPacksUsed: 10,
    monetaryUsed: 2500,
    applianceUnitsUsed: 0,
    foodPacksCap: 20,
    foodPacksRemaining: 10,
    monetaryCap: 5000,
    monetaryRemaining: 2500,
    applianceUnitsCap: 0,
    applianceUnitsRemaining: 0,
  });
  assert.equal(summary.latestCompletedAt, "2026-05-13T00:00:00.000Z");
  assert.equal(summary.completedRecords.length, 2);
  assert.deepStrictEqual(summary.perFamilyFoodPackRows, [
    {
      recordId: "completed-1",
      serialNo: "DAFAC-001",
      familyName: "Cruz, Ana",
      distributionDate: "2026-05-12T00:00:00.000Z",
      foodPacksReceived: 4,
      monetaryAmountReceived: 1000,
      applianceUnitsReceived: 0,
    },
    {
      recordId: "completed-2",
      serialNo: "DAFAC-003",
      familyName: "Santos, Cara",
      distributionDate: "2026-05-13T00:00:00.000Z",
      foodPacksReceived: 6,
      monetaryAmountReceived: 1500,
      applianceUnitsReceived: 0,
    },
  ]);
});

test("creates a compact family draft and shapes a completed payload for save", () => {
  const record = createEmptyDafacRecord({
    defaultEvacuationCenterName: "San Roque Gym",
    visibility: {
      showsFoodPacks: true,
      showsMonetary: true,
      showsAppliances: true,
    },
  });

  const payload = buildDafacRecordPayload({
    ...record,
    serialNo: "DAFAC-010",
    siteLabel: "Cluster A",
    distributionDate: "2026-05-14",
    headOfFamily: {
      surname: "Rivera",
      firstName: "Mila",
      middleName: "C",
    },
    distribution: {
      foodPacksReceived: "3",
      monetaryAmountReceived: "1500",
      applianceUnitsReceived: "2",
    },
    remarks: "Family transferred to safe area.",
  });

  assert.deepStrictEqual(payload, {
    serialNo: "DAFAC-010",
    evacuationCenterName: "San Roque Gym",
    siteLabel: "Cluster A",
    distributionDate: "2026-05-14",
    distributionStatus: "completed",
    headOfFamily: {
      surname: "Rivera",
      firstName: "Mila",
      middleName: "C",
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
      foodPacksReceived: 3,
      monetaryAmountReceived: 1500,
      applianceUnitsReceived: 2,
    },
    signOff: {
      familyHeadPrintedName: "Rivera, Mila C",
      familyHeadSignatureImage: "",
      barangayOfficerPrintedName: "",
      barangayOfficerSignatureImage: "",
      lswdoPrintedName: "",
      lswdoSignatureImage: "",
    },
    remarks: "Family transferred to safe area.",
  });
});

console.log("dafacDistributionUtils tests passed");
