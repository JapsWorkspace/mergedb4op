export const ROLE_ADMIN = "admin";
export const ROLE_DRRMO = "drrmo";
export const ROLE_BARANGAY = "barangay";
export const ROLE_ACCOUNTANT = "accountant";

export const ANALYTICS_TAB_OVERVIEW = "overview";
export const ANALYTICS_TAB_INVENTORY = "inventory";
export const ANALYTICS_TAB_DONATIONS = "donations";
export const ANALYTICS_TAB_RELIEF = "relief";
export const ANALYTICS_TAB_INCIDENTS = "incidents";
export const ANALYTICS_TAB_EVACUATION = "evacuation";

export function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function isAdminRole(role) {
  return normalizeRole(role) === ROLE_ADMIN;
}

export function isDrrmoRole(role) {
  return normalizeRole(role) === ROLE_DRRMO;
}

export function isBarangayRole(role) {
  return normalizeRole(role) === ROLE_BARANGAY;
}

export function isAccountantRole(role) {
  return normalizeRole(role) === ROLE_ACCOUNTANT;
}

export function getHomePathForRole(role) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === ROLE_ADMIN) return "/admin/dashboard";
  if (normalizedRole === ROLE_DRRMO) return "/drrmo/dashboard";
  if (normalizedRole === ROLE_ACCOUNTANT) return "/accountant/dashboard";
  if (normalizedRole === ROLE_BARANGAY) return "/barangay/dashboard";
  return "/Login";
}

export function getDashboardVariantForRole(role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === ROLE_DRRMO) return ROLE_DRRMO;
  if (normalizedRole === ROLE_BARANGAY) return ROLE_BARANGAY;
  if (normalizedRole === ROLE_ACCOUNTANT) return ROLE_ACCOUNTANT;
  return ROLE_ADMIN;
}

export function getAnalyticsTabsForRole(role) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === ROLE_ACCOUNTANT) {
    return [
      { key: ANALYTICS_TAB_OVERVIEW, label: "Overview" },
      { key: ANALYTICS_TAB_INVENTORY, label: "Inventory" },
      { key: ANALYTICS_TAB_DONATIONS, label: "Donations" },
      { key: ANALYTICS_TAB_RELIEF, label: "Relief Requests" },
    ];
  }

  return [
    { key: ANALYTICS_TAB_OVERVIEW, label: "Overview" },
    { key: ANALYTICS_TAB_INVENTORY, label: "Inventory" },
    { key: ANALYTICS_TAB_DONATIONS, label: "Donations" },
    { key: ANALYTICS_TAB_RELIEF, label: "Relief Requests" },
    { key: ANALYTICS_TAB_INCIDENTS, label: "Incident Reports" },
    { key: ANALYTICS_TAB_EVACUATION, label: "Evacuation" },
  ];
}

export function canAccessAnalyticsTab(role, tabKey) {
  return getAnalyticsTabsForRole(role).some((tab) => tab.key === tabKey);
}

export function getAnalyticsPageTitle(role) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === ROLE_DRRMO) return "DRRMO Analytics";
  if (normalizedRole === ROLE_ACCOUNTANT) return "Accountant Analytics";
  return "Admin Analytics";
}

export function getInventoryEditableTypes(role) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === ROLE_ADMIN || normalizedRole === ROLE_ACCOUNTANT) {
    return ["monetary"];
  }

  if (normalizedRole === ROLE_DRRMO) {
    return ["goods", "appliance"];
  }

  return [];
}

export function getInventoryViewTypes(role) {
  const normalizedRole = normalizeRole(role);

  if (normalizedRole === ROLE_ADMIN || normalizedRole === ROLE_ACCOUNTANT) {
    return ["goods", "appliance", "monetary"];
  }

  if (normalizedRole === ROLE_DRRMO) {
    return ["goods", "appliance"];
  }

  return [];
}

export function canEditInventoryType(role, type) {
  return getInventoryEditableTypes(role).includes(String(type || "").toLowerCase());
}

export function canViewInventoryType(role, type) {
  return getInventoryViewTypes(role).includes(String(type || "").toLowerCase());
}

export function getDonationQueueTypeForRole(role) {
  return isDrrmoRole(role) ? "non_monetary" : "monetary";
}

export function getDonationQueueOwnerLabel(role) {
  return isAccountantRole(role)
    ? "Accountant"
    : isAdminRole(role)
    ? "Admin"
    : "DRRMO";
}

export function getReliefBasePathForRole(role) {
  if (isAccountantRole(role)) return "/accountant";
  if (isAdminRole(role)) return "/admin";
  return "/drrmo";
}

export function getReliefReviewerLabel(role) {
  if (isAccountantRole(role)) return "Accountant";
  if (isAdminRole(role)) return "Admin";
  return "DRRMO";
}
