const fs = require("fs");
const path = require("path");
const sendEmailNotification = require("./sendEmailNotification");

const sendVerificationEmail = async (
  email,
  verificationLink,
  firstName = "there"
) => {
  const templatePath = path.join(__dirname, "../emails/verifyEmail.html");

  let html = fs.readFileSync(templatePath, "utf8");

  html = html
    .replace(/{{VERIFY_LINK}}/g, verificationLink)
    .replace(/{{FIRST_NAME}}/g, firstName)
    .replace(
      /{{LOGO_URL}}/g,
      "https://gaganadapat.onrender.com/uploads/logo/sagipbayanlogo.png"
    );

  console.log("[verification email html loaded]", { length: html.length });

  const result = await sendEmailNotification({
    to: email,
    subject: "Verify Your Email",
    message: `Hi ${firstName || "there"}, please verify your SagipBayan account: ${verificationLink}`,
    html,
  });

  if (!result?.ok) {
    const error = new Error(result?.errorMessage || "Unable to send verification email.");
    error.reason = result?.reason || "send_failed";
    error.skipped = result?.skipped === true;
    throw error;
  }

  return result;
};

module.exports = sendVerificationEmail;
