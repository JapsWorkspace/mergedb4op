const {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_MONETARY,
  getSupportTypesFromRequest,
  hasSupportType,
  normalizeSupportTypes,
} = require("./reliefSupportTypes");

const ROLE_ADMIN = "admin";
const ROLE_DRRMO = "drrmo";
const ROLE_BARANGAY = "barangay";
const ROLE_ACCOUNTANT = "accountant";

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const isAdminRole = (role) => normalizeRole(role) === ROLE_ADMIN;
const isDrrmoRole = (role) => normalizeRole(role) === ROLE_DRRMO;
const isAccountantRole = (role) => normalizeRole(role) === ROLE_ACCOUNTANT;
const isBarangayRole = (role) => normalizeRole(role) === ROLE_BARANGAY;

const isPrivilegedStaffRole = (role) =>
  [ROLE_ADMIN, ROLE_DRRMO, ROLE_ACCOUNTANT].includes(normalizeRole(role));

const canManageInventoryType = (role, type) => {
  const normalizedRole = normalizeRole(role);
  const normalizedType = String(type || "").trim().toLowerCase();

  if (normalizedRole === ROLE_ADMIN || normalizedRole === ROLE_ACCOUNTANT) {
    return normalizedType === "monetary";
  }

  if (normalizedRole === ROLE_DRRMO) {
    return normalizedType === "goods" || normalizedType === "appliance";
  }

  return false;
};

const getInventoryAccessError = (role, type) => {
  if (canManageInventoryType(role, type)) return "";
  if (isAdminRole(role)) {
    return "Admin can only manage monetary inventory records here.";
  }
  if (isAccountantRole(role)) {
    return "Accountant can only manage monetary inventory records here.";
  }
  if (isDrrmoRole(role)) {
    return "DRRMO can only manage goods and appliance inventory records here.";
  }
  return "Inventory access is not allowed for this account.";
};

const canManageDonationType = (role, inventoryType) => {
  const normalizedRole = normalizeRole(role);
  const normalizedType = String(inventoryType || "").trim().toLowerCase();

  if (normalizedRole === ROLE_ADMIN || normalizedRole === ROLE_ACCOUNTANT) {
    return normalizedType === "monetary";
  }

  if (normalizedRole === ROLE_DRRMO) {
    return normalizedType === "goods" || normalizedType === "appliance";
  }

  return false;
};

const getDonationAccessError = (role, inventoryType) => {
  if (canManageDonationType(role, inventoryType)) return "";
  if (isAdminRole(role)) {
    return "Admin can only manage monetary donations in this queue.";
  }
  if (isAccountantRole(role)) {
    return "Accountant can only manage monetary donations in this queue.";
  }
  if (isDrrmoRole(role)) {
    return "DRRMO can only manage goods and appliance donations in this queue.";
  }
  return "Donation queue access is not allowed for this account.";
};

const getNormalizedSupportTypes = (requestOrSupportTypes) => {
  if (Array.isArray(requestOrSupportTypes)) {
    return normalizeSupportTypes(requestOrSupportTypes);
  }

  return normalizeSupportTypes(getSupportTypesFromRequest(requestOrSupportTypes || {}));
};

const isMonetaryOnlySupportTypes = (requestOrSupportTypes) => {
  const supportTypes = getNormalizedSupportTypes(requestOrSupportTypes);

  return (
    hasSupportType(supportTypes, SUPPORT_TYPE_MONETARY) &&
    !hasSupportType(supportTypes, SUPPORT_TYPE_FOODPACKS) &&
    !hasSupportType(supportTypes, SUPPORT_TYPE_APPLIANCE)
  );
};

const canManageReliefRequest = (role, requestOrSupportTypes) => {
  const normalizedRole = normalizeRole(role);
  const supportTypes = getNormalizedSupportTypes(requestOrSupportTypes);

  if (normalizedRole === ROLE_ADMIN) {
    return true;
  }

  if (normalizedRole === ROLE_ACCOUNTANT) {
    return isMonetaryOnlySupportTypes(supportTypes);
  }

  if (normalizedRole === ROLE_DRRMO) {
    return !hasSupportType(supportTypes, SUPPORT_TYPE_MONETARY);
  }

  return false;
};

const getReviewerLabel = (role) => {
  if (isAccountantRole(role)) return "Accountant";
  if (isAdminRole(role)) return "Admin";
  if (isDrrmoRole(role)) return "DRRMO";
  if (isBarangayRole(role)) return "Barangay";
  return "System";
};

module.exports = {
  ROLE_ADMIN,
  ROLE_DRRMO,
  ROLE_BARANGAY,
  ROLE_ACCOUNTANT,
  normalizeRole,
  isAdminRole,
  isDrrmoRole,
  isAccountantRole,
  isBarangayRole,
  isPrivilegedStaffRole,
  canManageInventoryType,
  getInventoryAccessError,
  canManageDonationType,
  getDonationAccessError,
  isMonetaryOnlySupportTypes,
  canManageReliefRequest,
  getReviewerLabel,
};
