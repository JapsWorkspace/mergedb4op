const nodemailer = require("nodemailer");

const smtpTransporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 30000,
});

function getConfiguredSender() {
  const explicitSender = String(process.env.EMAIL_FROM || "").trim();
  const emailUser = String(process.env.EMAIL_USER || "").trim();

  if (explicitSender) return explicitSender;
  if (emailUser) return emailUser;

  const error = new Error(
    "No email sender configured. Set EMAIL_FROM or EMAIL_USER on the deployed backend."
  );
  error.code = "EMAIL_CONFIG_MISSING";
  throw error;
}

function getConfiguredSmtpUser() {
  return String(process.env.EMAIL_USER || "").trim();
}

function getConfiguredSmtpPass() {
  return String(process.env.EMAIL_PASS || "").trim();
}

function buildResendFromAddress(sender) {
  return `SAGIP BAYAN <${sender}>`;
}

async function sendViaResend({ from, to, subject, html, text }) {
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();

  if (!resendApiKey) {
    const error = new Error("RESEND_API_KEY is not configured.");
    error.code = "RESEND_CONFIG_MISSING";
    throw error;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      `Resend request failed with status ${response.status}`;
    const error = new Error(message);
    error.code = "RESEND_SEND_FAILED";
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function sendViaSmtp({ from, to, subject, html, text }) {
  const smtpUser = getConfiguredSmtpUser();
  const smtpPass = getConfiguredSmtpPass();

  if (!smtpUser || !smtpPass) {
    const error = new Error(
      "SMTP email is not configured. Set EMAIL_USER and EMAIL_PASS on the deployed backend."
    );
    error.code = "SMTP_CONFIG_MISSING";
    throw error;
  }

  return smtpTransporter.sendMail({
    from,
    to,
    subject,
    html,
    text,
  });
}

async function sendTransactionalEmail({ to, subject, html, text = "" }) {
  const sender = getConfiguredSender();
  const from = buildResendFromAddress(sender);
  const preferResend = String(process.env.RESEND_API_KEY || "").trim();

  if (preferResend) {
    return sendViaResend({ from, to, subject, html, text });
  }

  return sendViaSmtp({ from, to, subject, html, text });
}

module.exports = sendTransactionalEmail;
