const sendTransactionalEmail = require("./sendTransactionalEmail");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const sendAccountUpdateApprovalEmail = ({
  email,
  approvalLink,
  role,
  currentUsername,
  requestedBy,
  changeSummary = [],
}) => {
  const roleLabel =
    role === "barangay"
      ? "Barangay"
      : role === "accountant"
        ? "Accountant"
        : "DRRMO";
  const summaryHtml = changeSummary.length
    ? `<ul style="margin: 12px 0 0; padding-left: 18px;">${changeSummary
        .map(
          (item) =>
            `<li style="margin-bottom: 6px;"><strong>${escapeHtml(
              item.label
            )}:</strong> ${escapeHtml(item.value)}</li>`
        )
        .join("")}</ul>`
    : "<p>No field summary available.</p>";

  return sendTransactionalEmail({
    to: email,
    subject: `Approve updates to your ${roleLabel} SAGIP BAYAN account`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #173122; line-height: 1.6;">
        <h2 style="margin-bottom: 8px;">Account update approval required</h2>
        <p>An administrator requested updates to your ${roleLabel} account in SAGIP BAYAN.</p>
        <p><strong>Current username:</strong> ${escapeHtml(currentUsername)}</p>
        <p><strong>Requested by:</strong> ${escapeHtml(
          requestedBy || "Administrator"
        )}</p>
        <p><strong>Pending changes:</strong></p>
        ${summaryHtml}
        <p>Please confirm these changes by clicking the button below.</p>
        <p style="margin: 24px 0;">
          <a href="${approvalLink}" style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #166534; color: #ffffff; text-decoration: none; font-weight: 700;">
            Approve Account Update
          </a>
        </p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${approvalLink}">${approvalLink}</a></p>
        <p>This approval link will expire in 24 hours.</p>
        <p>If you did not expect this update, you can safely ignore this email.</p>
      </div>
    `,
  });
};

module.exports = sendAccountUpdateApprovalEmail;
