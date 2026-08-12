const express = require("express");
const {
  checkUniSmsBalance,
  sendUniSms,
  trimSmsMessage,
} = require("../utils/sendUniSms");

const router = express.Router();

function requireNonProduction(req, res, next) {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ message: "Not found" });
  }
  return next();
}

router.post("/test", requireNonProduction, async (req, res) => {
  try {
    const maxLength = Number(process.env.SMS_MAX_LENGTH || 150);
    const message = trimSmsMessage(
      req.body?.message || "SagipBayan: SMS test from SagipBayan.",
      Number.isFinite(maxLength) && maxLength > 0 ? maxLength : 150
    );

    const result = await sendUniSms({
      to: req.body?.phone,
      message,
    });

    return res.status(result.ok ? 200 : 400).json({
      ok: result.ok,
      skipped: Boolean(result.skipped),
      reason: result.reason || "",
      status: result.status || null,
      to: result.to || "",
      providerTo: result.providerTo || "",
      message: result.message || message,
      length: (result.message || message).length,
      errorMessage: result.errorMessage || "",
      providerResponse: result.data || null,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "SMS test failed",
    });
  }
});

router.get("/balance", requireNonProduction, async (req, res) => {
  try {
    const result = await checkUniSmsBalance();

    return res.status(result.ok ? 200 : 400).json({
      ok: result.ok,
      skipped: Boolean(result.skipped),
      reason: result.reason || "",
      status: result.status || null,
      errorMessage: result.errorMessage || "",
      providerResponse: result.data || null,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "SMS balance check failed",
    });
  }
});

module.exports = router;
