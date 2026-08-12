const express = require("express");
const sendEmailNotification = require("../utils/sendEmailNotification");

const router = express.Router();

router.post("/test", async (req, res) => {
  try {
    const result = await sendEmailNotification({
      to: req.body?.email,
      subject: req.body?.subject || "SagipBayan Test Email",
      message: req.body?.message || "This is a test email from SagipBayan.",
      html: req.body?.html,
    });

    return res.status(result.ok ? 200 : 400).json({
      ok: result.ok,
      skipped: Boolean(result.skipped),
      reason: result.reason || "",
      messageId: result.messageId || "",
      errorMessage: result.errorMessage || "",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Email test failed",
    });
  }
});

module.exports = router;
