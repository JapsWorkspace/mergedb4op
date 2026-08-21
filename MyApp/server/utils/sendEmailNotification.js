const nodemailer = require("nodemailer");

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "y"].includes(String(value || "").trim().toLowerCase());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(message) {
  const paragraphs = String(message || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return [
    '<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.55">',
    paragraphs || "<p>SagipBayan notification</p>",
    "</div>",
  ].join("");
}

function buildFromAddress(sender) {
  const cleanSender = String(sender || "").trim();
  if (!cleanSender) return "";
  return cleanSender.includes("<") ? cleanSender : `SAGIP BAYAN <${cleanSender}>`;
}

function getResendSender() {
  const sender = String(process.env.EMAIL_FROM || process.env.RESEND_FROM || "").trim();
  if (sender) return buildFromAddress(sender);

  const error = new Error(
    "Resend requires EMAIL_FROM or RESEND_FROM using a sender/domain verified in Resend."
  );
  error.code = "RESEND_CONFIG_MISSING";
  throw error;
}

function getSmtpSender() {
  const smtpUser = String(process.env.SMTP_USER || process.env.EMAIL_USER || "").trim();
  const smtpFrom = String(process.env.SMTP_FROM || "").trim();

  // Gmail SMTP must send from the authenticated Gmail account (or an alias
  // configured in that Gmail account). EMAIL_FROM may point to a custom
  // domain intended for Resend, so it must not override the SMTP identity.
  const sender = smtpFrom || smtpUser;
  if (sender) return buildFromAddress(sender);

  const error = new Error(
    "No SMTP sender configured. Set SMTP_USER/EMAIL_USER and SMTP_PASS/EMAIL_PASS on the deployed backend."
  );
  error.code = "SMTP_CONFIG_MISSING";
  throw error;
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
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (!host || !port || !from || !user || !pass) {
    const error = new Error(
      "SMTP email is not configured. Set SMTP/EMAIL host, port, user, pass, and from settings on the deployed backend."
    );
    error.code = "SMTP_CONFIG_MISSING";
    throw error;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: toBoolean(process.env.SMTP_SECURE || process.env.EMAIL_SECURE),
    auth: { user, pass },
  });

  return transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

async function sendEmailNotification({ to, subject, message, html }) {
  if (!to) {
    console.log("[email skipped missing recipient]");
    return { ok: false, skipped: true, reason: "missing_email" };
  }

  const text = String(message || "");
  const resolvedHtml = html || buildHtml(text);

  try {
    console.log("[email sending]", { to, subject });

    const preferResend = String(process.env.RESEND_API_KEY || "").trim();

    const info = preferResend
      ? await sendViaResend({
          from: getResendSender(),
          to,
          subject,
          html: resolvedHtml,
          text,
        })
      : await sendViaSmtp({
          from: getSmtpSender(),
          to,
          subject,
          html: resolvedHtml,
          text,
        });

    console.log("[email sent]", {
      to,
      messageId: info?.messageId || info?.id || "",
    });

    return {
      ok: true,
      skipped: false,
      messageId: info?.messageId || info?.id || "",
    };
  } catch (err) {
    const missingConfig =
      err?.code === "EMAIL_CONFIG_MISSING" ||
      err?.code === "SMTP_CONFIG_MISSING" ||
      err?.code === "RESEND_CONFIG_MISSING";

    if (missingConfig) {
      console.log("[email skipped missing email config]", {
        to,
        subject,
        code: err.code,
      });
      return {
        ok: false,
        skipped: true,
        reason: "missing_email_config",
        errorMessage: err.message,
      };
    }

    console.log("[email failed]", {
      to,
      subject,
      message: err?.message || String(err),
    });
    return {
      ok: false,
      skipped: false,
      reason: "send_failed",
      errorMessage: err?.message || String(err),
    };
  }
}

module.exports = sendEmailNotification;
module.exports.buildHtml = buildHtml;
module.exports.escapeHtml = escapeHtml;
module.exports.toBoolean = toBoolean;
