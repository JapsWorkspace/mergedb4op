const sendTransactionalEmail = require("./sendTransactionalEmail");

const sendAccountApprovalEmail = ({
  email,
  approvalLink,
  role,
  username,
  barangayName,
  requestedBy,
}) => {
  const roleLabel =
    role === "barangay"
      ? "Barangay"
      : role === "accountant"
        ? "Accountant"
        : "DRRMO";
  const barangayLine =
    role === "barangay" && barangayName
      ? `<p><strong>Barangay:</strong> ${barangayName}</p>`
      : "";

  return sendTransactionalEmail({
    to: email,
    subject: `Approve your ${roleLabel} SAGIP BAYAN account`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #173122; line-height: 1.6;">
        <h2 style="margin-bottom: 8px;">Account approval required</h2>
        <p>An administrator created a pending ${roleLabel} account for this email in SAGIP BAYAN.</p>
        <p><strong>Username:</strong> ${username}</p>
        ${barangayLine}
        <p><strong>Requested by:</strong> ${requestedBy || "Administrator"}</p>
        <p>Please confirm this account by clicking the button below.</p>
        <p style="margin: 24px 0;">
          <a href="${approvalLink}" style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #166534; color: #ffffff; text-decoration: none; font-weight: 700;">
            Approve Account
          </a>
        </p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${approvalLink}">${approvalLink}</a></p>
        <p>This approval link will expire in 24 hours.</p>
        <p>If you did not expect this account, you can safely ignore this email.</p>
      </div>
    `,
  });
};

module.exports = sendAccountApprovalEmail;
