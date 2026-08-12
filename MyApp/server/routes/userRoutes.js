const express = require("express");
const router = express.Router();
const path = require("path");
const { uploadAvatar } = require("../middleware/upload");


// ✅ CONTROLLERS
const userController = require("../controllers/userController");

// ✅ MODEL
const UserModel = require("../models/User");

/* =========================
   USER ROUTES
========================= */

router.get("/users", userController.getUsers);
router.post("/register", userController.registerUser);
router.put("/update/:id", userController.updateUser);
router.post("/login", userController.loginUser);
router.post("/verify-email", userController.verifyEmailForReset);
router.post("/forgot-password/lookup", userController.forgotPasswordLookup);
router.post("/forgot-password/send-otp", userController.forgotPasswordSendOtp);
router.post("/forgot-password/verify-otp", userController.forgotPasswordVerifyOtp);
router.post("/forgot-password/reset-password", userController.forgotPasswordResetPassword);
router.post("/forgot-password/skip-reset", userController.forgotPasswordSkipReset);
router.get("/:id/verification-status", userController.getVerificationStatus);
router.post("/:id/resend-verification-email", userController.resendVerificationEmail);

router.put("/archive/:id", userController.archiveUser);
router.put("/restore/:id", userController.restoreUser);

router.get("/verify/:token", userController.verifyEmail);

router.post("/send-otp", userController.sendOtp);
router.post("/verify-otp", userController.verifyOtp);

// ✅ ✅ ✅ FIXED LOCATION ROUTE
router.put("/location/:id", userController.updateLocation);
router.patch("/:id/share-safety-location", userController.updateShareSafetyLocation);

router.put("/twofactor/:id", userController.toggleTwoFactor);
router.post("/:id/notification-token/debug", userController.logNotificationTokenDebug);
router.post("/:id/notification-token", userController.registerNotificationToken);
router.get("/:id/notifications", userController.getUserNotifications);
router.put("/:id/notifications/read-all", userController.markNotificationsRead);
router.delete("/:id/notifications", userController.clearNotifications);

router.get("/:id", userController.getUserById);


router.put(
  "/avatar/:id",
  (req, res, next) => {
    uploadAvatar.single("avatar")(req, res, (err) => {
      if (err) {
        console.error("AVATAR MULTER ERROR:", {
          message: err.message,
          code: err.code,
          field: err.field,
          name: err.name,
        });

        return res.status(400).json({
          message: err.message || "Avatar upload failed.",
          code: err.code || null,
          field: err.field || null,
        });
      }

      next();
    });
  },
  userController.uploadAvatar
);

module.exports = router;
