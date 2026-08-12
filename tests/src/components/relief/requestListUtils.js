const normalize = (value) => String(value || "").trim().toLowerCase();

export const getVisibleRows = (request = {}) =>
  (Array.isArray(request?.rows) ? request.rows : []).filter(
    (row) => row && row.isActiveRow !== false
  );

export const getVisibleCenterCount = (request = {}) => getVisibleRows(request).length;

export const getVisibleRowTotals = (request = {}) => {
  const rows = getVisibleRows(request);

  return rows.reduce(
    (totals, row) => ({
      households: totals.households + Number(row?.households || 0),
      families: totals.families + Number(row?.families || 0),
      male: totals.male + Number(row?.male || 0),
      female: totals.female + Number(row?.female || 0),
      lgbtq: totals.lgbtq + Number(row?.lgbtq || 0),
      pwd: totals.pwd + Number(row?.pwd || 0),
      pregnant: totals.pregnant + Number(row?.pregnant || 0),
      senior: totals.senior + Number(row?.senior || 0),
      requestedFoodPacks:
        totals.requestedFoodPacks + Number(row?.requestedFoodPacks || 0),
    }),
    {
      households: 0,
      families: 0,
      male: 0,
      female: 0,
      lgbtq: 0,
      pwd: 0,
      pregnant: 0,
      senior: 0,
      requestedFoodPacks: 0,
    }
  );
};

export const getRequestEditBadgeLabel = (request = {}) => {
  if (!request?.isEditedAfterSubmit) return "";

  const action = normalize(request?.lastEditAction);
  if (action === "resubmitted") return "Resubmitted";
  return "Edited";
};
