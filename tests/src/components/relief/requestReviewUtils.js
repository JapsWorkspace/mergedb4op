export const isConfirmationSubmitDisabled = ({
  action = "",
  rejectReason = "",
  submittingAction = false,
} = {}) => {
  if (submittingAction) return true;
  if (String(action).trim().toLowerCase() !== "reject") return false;
  return !String(rejectReason || "").trim();
};
