const path = require("path");

const {
  FAMILY_SHEET_NAME,
  MEMBER_SHEET_NAME,
  FAMILY_HEADERS,
  MEMBER_HEADERS,
} = require("./reliefDistributionTemplate");

const MISSING_COLUMN = Symbol("missing_column");

const normalize = (value) => String(value ?? "").trim();

const isBlank = (value) =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "");

const normalizeCellValue = (value) => (value === MISSING_COLUMN ? "" : normalize(value));

const pushInvalidCellIssue = ({ value, rowLabel, rowNumber, columnName, issues, valueType }) => {
  issues.push(
    `${rowLabel} row ${rowNumber} has an invalid ${valueType} value for ${columnName}: "${normalize(value)}".`
  );
};

const parseNumericCell = ({ value, rowLabel, rowNumber, columnName, issues }) => {
  if (value === MISSING_COLUMN) {
    return null;
  }

  if (isBlank(value)) {
    return 0;
  }

  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  pushInvalidCellIssue({ value, rowLabel, rowNumber, columnName, issues, valueType: "numeric" });
  return null;
};

const BOOLEAN_TRUE_VALUES = new Set(["true", "yes", "y", "1"]);
const BOOLEAN_FALSE_VALUES = new Set(["false", "no", "n", "0"]);

const parseBooleanCell = ({ value, rowLabel, rowNumber, columnName, issues }) => {
  if (value === MISSING_COLUMN) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  if (isBlank(value)) {
    return false;
  }

  const normalized = normalize(value).toLowerCase();
  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return true;
  }

  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    return false;
  }

  pushInvalidCellIssue({ value, rowLabel, rowNumber, columnName, issues, valueType: "boolean" });
  return null;
};

const buildUtcDate = (year, month, day) => {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
};

const parseExcelDateSerial = (value) => {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const excelEpoch = Date.UTC(1899, 11, 30);
  return new Date(excelEpoch + Math.round(value * 24 * 60 * 60 * 1000));
};

const toDate = ({ value, rowLabel, rowNumber, columnName, issues }) => {
  if (value === MISSING_COLUMN) {
    return null;
  }

  if (isBlank(value)) {
    return null;
  }

  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) {
      return new Date(value.getTime());
    }

    pushInvalidCellIssue({ value, rowLabel, rowNumber, columnName, issues, valueType: "date" });
    return null;
  }

  if (typeof value === "number") {
    if (value === 0) {
      return null;
    }

    const parsedDate = parseExcelDateSerial(value);
    if (parsedDate) {
      return parsedDate;
    }

    pushInvalidCellIssue({ value, rowLabel, rowNumber, columnName, issues, valueType: "date" });
    return null;
  }

  const normalized = normalize(value);

  if (normalized === "0") {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    const parsedDate = parseExcelDateSerial(Number(normalized));
    if (parsedDate) {
      return parsedDate;
    }

    pushInvalidCellIssue({ value, rowLabel, rowNumber, columnName, issues, valueType: "date" });
    return null;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const parsedDate = buildUtcDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    if (parsedDate) {
      return parsedDate;
    }

    pushInvalidCellIssue({ value, rowLabel, rowNumber, columnName, issues, valueType: "date" });
    return null;
  }

  const slashMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const parsedDate = buildUtcDate(Number(slashMatch[3]), Number(slashMatch[1]), Number(slashMatch[2]));
    if (parsedDate) {
      return parsedDate;
    }

    pushInvalidCellIssue({ value, rowLabel, rowNumber, columnName, issues, valueType: "date" });
    return null;
  }

  pushInvalidCellIssue({ value, rowLabel, rowNumber, columnName, issues, valueType: "date" });
  return null;
};

const tokenizeHeader = (header) =>
  normalize(header)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const findSimilarHeader = (expectedHeader, candidateHeaders) => {
  const expectedTokens = tokenizeHeader(expectedHeader);
  let bestMatch = null;

  candidateHeaders.forEach((candidateHeader) => {
    const candidateTokens = tokenizeHeader(candidateHeader);
    const sharedTokenCount = expectedTokens.filter((token) => candidateTokens.includes(token)).length;
    const shortestLength = Math.min(expectedTokens.length, candidateTokens.length);
    const lengthDifference = Math.abs(expectedTokens.length - candidateTokens.length);
    const isSimilar =
      sharedTokenCount >= 2 || (sharedTokenCount > 0 && sharedTokenCount === shortestLength);

    if (!isSimilar) {
      return;
    }

    if (
      !bestMatch ||
      sharedTokenCount > bestMatch.sharedTokenCount ||
      (sharedTokenCount === bestMatch.sharedTokenCount &&
        lengthDifference < bestMatch.lengthDifference)
    ) {
      bestMatch = {
        header: candidateHeader,
        sharedTokenCount,
        lengthDifference,
      };
    }
  });

  return bestMatch?.header ?? null;
};

const collectRowHeaders = (rows = []) =>
  Array.from(
    new Set(
      rows.flatMap((row) => {
        if (!row || typeof row !== "object") {
          return [];
        }

        return Object.keys(row);
      })
    )
  );

const buildMissingHeaderSet = ({ sheetName, rows, expectedHeaders, issues, providedHeaders = [] }) => {
  const rowHeaders = collectRowHeaders(rows);
  const declaredHeaders =
    Array.isArray(providedHeaders) && providedHeaders.length > 0
      ? providedHeaders.filter((header) => typeof header === "string" && header.trim() !== "")
      : rowHeaders;
  const expectedHeaderSet = new Set(expectedHeaders);
  const unexpectedDeclaredHeaders = declaredHeaders.filter((header) => !expectedHeaderSet.has(header));
  const unexpectedRowHeaders = rowHeaders.filter((header) => !expectedHeaderSet.has(header));
  const missingHeaders = new Set();
  const usedUnexpectedDeclaredHeaders = new Set();
  const usedUnexpectedRowHeaders = new Set();

  expectedHeaders.forEach((expectedHeader) => {
    const declaredHasExpectedHeader = declaredHeaders.includes(expectedHeader);
    const rowHasExpectedHeader = rowHeaders.includes(expectedHeader);

    if (!declaredHasExpectedHeader) {
      const similarDeclaredHeader = findSimilarHeader(
        expectedHeader,
        unexpectedDeclaredHeaders.filter((header) => !usedUnexpectedDeclaredHeaders.has(header))
      );

      if (!similarDeclaredHeader) {
        if (Array.isArray(providedHeaders) && providedHeaders.length > 0) {
          missingHeaders.add(expectedHeader);
          issues.push(`${sheetName} sheet is missing expected column "${expectedHeader}".`);
        }
        return;
      }

      usedUnexpectedDeclaredHeaders.add(similarDeclaredHeader);
      missingHeaders.add(expectedHeader);
      issues.push(
        `${sheetName} sheet is missing expected column "${expectedHeader}". Found similar column "${similarDeclaredHeader}".`
      );
      return;
    }

    if (rowHasExpectedHeader) {
      return;
    }

    const similarRowHeader = findSimilarHeader(
      expectedHeader,
      unexpectedRowHeaders.filter((header) => !usedUnexpectedRowHeaders.has(header))
    );

    if (similarRowHeader) {
      usedUnexpectedRowHeaders.add(similarRowHeader);
      missingHeaders.add(expectedHeader);
      issues.push(
        `${sheetName} sheet rows are missing expected key "${expectedHeader}". Found similar key "${similarRowHeader}".`
      );
      return;
    }

    if (Array.isArray(providedHeaders) && providedHeaders.length > 0 && rowHeaders.length === 0) {
        missingHeaders.add(expectedHeader);
        issues.push(`${sheetName} sheet has no parsed row values for expected column "${expectedHeader}".`);
    }
  });

  return missingHeaders;
};

const getCellValue = (row, columnName, missingHeaders) =>
  missingHeaders.has(columnName) ? MISSING_COLUMN : row[columnName];

const buildApplianceUnitsReceived = (row, issues, rowNumber, missingHeaders) => {
  const directValue = getCellValue(row, "Appliance Units Received", missingHeaders);
  const legacyValue = getCellValue(row, "Appliance 1 Quantity", missingHeaders);
  const selectedValue =
    directValue !== MISSING_COLUMN && directValue !== "" ? directValue : legacyValue;

  return parseNumericCell({
    value: selectedValue,
    rowLabel: "Families",
    rowNumber,
    columnName:
      directValue !== MISSING_COLUMN && directValue !== ""
        ? "Appliance Units Received"
        : "Appliance 1 Quantity",
    issues,
  });
};

const resolveXlsx = (providedXlsx) => {
  if (providedXlsx) {
    return providedXlsx;
  }

  const fallbackPaths = [
    "xlsx",
    path.join(__dirname, "../../../tests/node_modules/xlsx"),
    path.join(__dirname, "../../../../../tests/node_modules/xlsx"),
  ];

  for (const modulePath of fallbackPaths) {
    try {
      return require(modulePath);
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") {
        throw error;
      }
    }
  }

  throw new Error(
    'XLSX dependency is unavailable. Install "xlsx" for workbook import and template download support.'
  );
};

const parseDistributionWorkbookRows = ({
  families = [],
  members = [],
  familyHeaders = [],
  memberHeaders = [],
} = {}) => {
  const familyMap = new Map();
  const duplicateFamilyImportIds = new Set();
  const issues = [];
  const missingFamilyHeaders = buildMissingHeaderSet({
    sheetName: FAMILY_SHEET_NAME,
    rows: families,
    expectedHeaders: FAMILY_HEADERS,
    issues,
    providedHeaders: familyHeaders,
  });
  const missingMemberHeaders = buildMissingHeaderSet({
    sheetName: MEMBER_SHEET_NAME,
    rows: members,
    expectedHeaders: MEMBER_HEADERS,
    issues,
    providedHeaders: memberHeaders,
  });

  families.forEach((row, index) => {
    const rowNumber = index + 2;
    const importId = normalizeCellValue(getCellValue(row, "Family Import ID", missingFamilyHeaders));
    if (!importId) {
      issues.push(`Families row ${rowNumber} is missing Family Import ID.`);
      return;
    }

    if (familyMap.has(importId)) {
      issues.push(`Families row ${rowNumber} has a duplicate Family Import ID "${importId}".`);
      duplicateFamilyImportIds.add(importId);
      return;
    }

    familyMap.set(importId, {
      serialNo: normalizeCellValue(getCellValue(row, "Serial No", missingFamilyHeaders)),
      evacuationCenterName: normalizeCellValue(
        getCellValue(row, "Evacuation Center", missingFamilyHeaders)
      ),
      siteLabel: normalizeCellValue(getCellValue(row, "Site Label", missingFamilyHeaders)),
      distributionDate: toDate({
        value: getCellValue(row, "Distribution Date", missingFamilyHeaders),
        rowLabel: "Families",
        rowNumber,
        columnName: "Distribution Date",
        issues,
      }),
      headOfFamily: {
        surname: normalizeCellValue(getCellValue(row, "Surname", missingFamilyHeaders)),
        firstName: normalizeCellValue(getCellValue(row, "First Name", missingFamilyHeaders)),
        middleName: normalizeCellValue(getCellValue(row, "Middle Name", missingFamilyHeaders)),
        sex: normalizeCellValue(getCellValue(row, "Sex", missingFamilyHeaders)),
        age: parseNumericCell({
          value: getCellValue(row, "Age", missingFamilyHeaders),
          rowLabel: "Families",
          rowNumber,
          columnName: "Age",
          issues,
        }),
        birthDate: toDate({
          value: getCellValue(row, "Birth Date", missingFamilyHeaders),
          rowLabel: "Families",
          rowNumber,
          columnName: "Birth Date",
          issues,
        }),
        occupation: normalizeCellValue(getCellValue(row, "Occupation", missingFamilyHeaders)),
        monthlyIncome: parseNumericCell({
          value: getCellValue(row, "Monthly Income", missingFamilyHeaders),
          rowLabel: "Families",
          rowNumber,
          columnName: "Monthly Income",
          issues,
        }),
      },
      familyProfile: {
        is4PsBeneficiary: parseBooleanCell({
          value: getCellValue(row, "4Ps Beneficiary", missingFamilyHeaders),
          rowLabel: "Families",
          rowNumber,
          columnName: "4Ps Beneficiary",
          issues,
        }),
        isIpBeneficiary: parseBooleanCell({
          value: getCellValue(row, "IP Beneficiary", missingFamilyHeaders),
          rowLabel: "Families",
          rowNumber,
          columnName: "IP Beneficiary",
          issues,
        }),
        ipEthnicity: normalizeCellValue(getCellValue(row, "IP Ethnicity", missingFamilyHeaders)),
      },
      housingProfile: {
        tenureStatus: normalizeCellValue(getCellValue(row, "Tenure Status", missingFamilyHeaders)),
        housingCondition: normalizeCellValue(
          getCellValue(row, "Housing Condition", missingFamilyHeaders)
        ),
      },
      healthProfile: {
        healthCondition: normalizeCellValue(
          getCellValue(row, "Health Condition", missingFamilyHeaders)
        ),
      },
      familyMembers: [],
      distribution: {
        foodPacksReceived: parseNumericCell({
          value: getCellValue(row, "Food Packs Received", missingFamilyHeaders),
          rowLabel: "Families",
          rowNumber,
          columnName: "Food Packs Received",
          issues,
        }),
        monetaryAmountReceived: parseNumericCell({
          value: getCellValue(row, "Monetary Amount Received", missingFamilyHeaders),
          rowLabel: "Families",
          rowNumber,
          columnName: "Monetary Amount Received",
          issues,
        }),
        applianceUnitsReceived: buildApplianceUnitsReceived(
          row,
          issues,
          rowNumber,
          missingFamilyHeaders
        ),
      },
      signOff: {
        familyHeadPrintedName: normalizeCellValue(
          getCellValue(row, "Family Head Printed Name", missingFamilyHeaders)
        ),
        barangayOfficerPrintedName: normalizeCellValue(
          getCellValue(row, "Barangay Officer Printed Name", missingFamilyHeaders)
        ),
        lswdoPrintedName: normalizeCellValue(
          getCellValue(row, "LSWDO Printed Name", missingFamilyHeaders)
        ),
      },
      remarks: normalizeCellValue(getCellValue(row, "Remarks", missingFamilyHeaders)),
    });
  });

  members.forEach((row, index) => {
    const importId = normalizeCellValue(getCellValue(row, "Family Import ID", missingMemberHeaders));
    const rowNumber = index + 2;

    if (!importId) {
      issues.push(`Family Members row ${rowNumber} is missing Family Import ID.`);
      return;
    }

    if (duplicateFamilyImportIds.has(importId)) {
      throw new Error(
        `Found ambiguous family member rows starting at row ${
          rowNumber
        } for duplicate Family Import ID "${importId}".`
      );
    }

    const parent = familyMap.get(importId);

    if (!parent) {
      throw new Error(`Found orphan family member rows starting at row ${rowNumber}.`);
    }

    parent.familyMembers.push({
      fullName: normalizeCellValue(getCellValue(row, "Member Full Name", missingMemberHeaders)),
      relationshipToHead: normalizeCellValue(
        getCellValue(row, "Relationship To Head", missingMemberHeaders)
      ),
      age: parseNumericCell({
        value: getCellValue(row, "Age", missingMemberHeaders),
        rowLabel: "Family Members",
        rowNumber,
        columnName: "Age",
        issues,
      }),
      sex: normalizeCellValue(getCellValue(row, "Sex", missingMemberHeaders)),
      education: normalizeCellValue(getCellValue(row, "Education", missingMemberHeaders)),
      occupationalSkills: normalizeCellValue(
        getCellValue(row, "Occupational Skills", missingMemberHeaders)
      ),
      remarks: normalizeCellValue(getCellValue(row, "Remarks", missingMemberHeaders)),
    });
  });

  return {
    records: Array.from(familyMap.values()),
    issues,
    templateHeaders: {
      families: [...FAMILY_HEADERS],
      members: [...MEMBER_HEADERS],
    },
  };
};

const parseSheetRows = (xlsx, sheet, expectedHeaders) => {
  if (!sheet) {
    return {
      headers: [...expectedHeaders],
      rows: [],
    };
  }

  const headers = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: true,
  })[0] || [];
  const rows = xlsx.utils.sheet_to_json(sheet, {
    defval: "",
    raw: true,
  });

  return {
    headers,
    rows,
  };
};

const parseDistributionWorkbookBuffer = ({ buffer, xlsx } = {}) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("A non-empty workbook buffer is required.");
  }

  const resolvedXlsx = resolveXlsx(xlsx);
  const workbook = resolvedXlsx.read(buffer, {
    type: "buffer",
    cellDates: true,
  });
  const familySheet = workbook?.Sheets?.[FAMILY_SHEET_NAME];
  const memberSheet = workbook?.Sheets?.[MEMBER_SHEET_NAME];

  if (!familySheet || !memberSheet) {
    throw new Error(
      `Workbook must contain "${FAMILY_SHEET_NAME}" and "${MEMBER_SHEET_NAME}" sheets.`
    );
  }

  const familyData = parseSheetRows(resolvedXlsx, familySheet, FAMILY_HEADERS);
  const memberData = parseSheetRows(resolvedXlsx, memberSheet, MEMBER_HEADERS);

  return parseDistributionWorkbookRows({
    families: familyData.rows,
    members: memberData.rows,
    familyHeaders: familyData.headers,
    memberHeaders: memberData.headers,
  });
};

module.exports = {
  parseDistributionWorkbookRows,
  parseDistributionWorkbookBuffer,
};
