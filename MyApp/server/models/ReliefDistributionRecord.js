const mongoose = require("mongoose");

const finiteNonNegativeNumberField = (defaultValue = 0) => ({
  type: Number,
  default: defaultValue,
  min: 0,
  validate: {
    validator: Number.isFinite,
    message: "Value must be a finite number.",
  },
});

const familyMemberSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: "", trim: true },
    relationshipToHead: { type: String, default: "", trim: true },
    age: finiteNonNegativeNumberField(),
    sex: { type: String, default: "", trim: true },
    education: { type: String, default: "", trim: true },
    occupationalSkills: { type: String, default: "", trim: true },
    remarks: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const applianceDistributionSchema = new mongoose.Schema(
  {
    itemName: { type: String, required: true, trim: true },
    category: { type: String, default: "", trim: true },
    quantityReceived: finiteNonNegativeNumberField(),
    unit: { type: String, default: "", trim: true },
    remarks: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const reliefDistributionRecordSchema = new mongoose.Schema(
  {
    reliefRequestId: { type: mongoose.Schema.Types.ObjectId, ref: "ReliefRequest", required: true },
    reliefRequestNo: { type: String, required: true, trim: true },
    barangayId: { type: mongoose.Schema.Types.ObjectId, ref: "Barangay", required: true },
    barangayName: { type: String, required: true, trim: true },
    releaseIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ReliefRelease" }],
    distributionStatus: { type: String, enum: ["draft", "completed"], default: "draft" },
    serialNo: { type: String, required: true, trim: true },
    importBatchId: { type: String, default: "", trim: true },
    entryMode: { type: String, enum: ["manual", "excel_import"], default: "manual" },
    evacuationCenterName: { type: String, default: "", trim: true },
    siteLabel: { type: String, default: "", trim: true },
    distributionDate: { type: Date, default: null },
    headOfFamily: {
      surname: { type: String, default: "", trim: true },
      firstName: { type: String, default: "", trim: true },
      middleName: { type: String, default: "", trim: true },
      sex: { type: String, default: "", trim: true },
      age: finiteNonNegativeNumberField(),
      birthDate: { type: Date, default: null },
      occupation: { type: String, default: "", trim: true },
      monthlyIncome: finiteNonNegativeNumberField(),
    },
    familyProfile: {
      is4PsBeneficiary: { type: Boolean, default: false },
      isIpBeneficiary: { type: Boolean, default: false },
      ipEthnicity: { type: String, default: "", trim: true },
    },
    housingProfile: {
      tenureStatus: { type: String, default: "", trim: true },
      housingCondition: { type: String, default: "", trim: true },
    },
    healthProfile: {
      healthCondition: { type: String, default: "", trim: true },
    },
    familyMembers: { type: [familyMemberSchema], default: [] },
    distribution: {
      foodPacksReceived: finiteNonNegativeNumberField(),
      monetaryAmountReceived: finiteNonNegativeNumberField(),
      applianceUnitsReceived: finiteNonNegativeNumberField(),
      applianceItems: { type: [applianceDistributionSchema], default: [] },
    },
    signOff: {
      familyHeadPrintedName: { type: String, default: "", trim: true },
      familyHeadSignatureImage: { type: String, default: "", trim: true },
      barangayOfficerPrintedName: { type: String, default: "", trim: true },
      barangayOfficerSignatureImage: { type: String, default: "", trim: true },
      lswdoPrintedName: { type: String, default: "", trim: true },
      lswdoSignatureImage: { type: String, default: "", trim: true },
    },
    remarks: { type: String, default: "", trim: true },
    encodedBy: { type: String, default: "", trim: true },
    encodedAt: { type: Date, default: null },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reliefDistributionRecordSchema.index(
  { reliefRequestId: 1, serialNo: 1, isArchived: 1 },
  { unique: true, partialFilterExpression: { isArchived: false } }
);

module.exports = mongoose.model("ReliefDistributionRecord", reliefDistributionRecordSchema);
