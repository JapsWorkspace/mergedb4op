const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    module: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    title: {
      type: String,
      default: "",
      trim: true,
    },

    sourceLabel: {
      type: String,
      default: "",
      trim: true,
    },

    source: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },

    official: {
      type: Boolean,
      default: false,
    },

    target: {
      type: String,
      enum: ["all", "users", "barangays", ""],
      default: "",
      trim: true,
      lowercase: true,
    },

    notificationType: {
      type: String,
      enum: ["normal", "danger"],
      default: "normal",
      trim: true,
      lowercase: true,
    },

    priority: {
      type: String,
      enum: ["normal", "high", "critical"],
      default: "normal",
      trim: true,
      lowercase: true,
    },

    soundType: {
      type: String,
      enum: ["notification", "normal", "danger", "sms"],
      default: "notification",
      trim: true,
      lowercase: true,
    },

    guidelineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guidelines",
      default: null,
    },

    announcementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Announcement",
      default: null,
    },

    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
    },

    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    referenceModel: {
      type: String,
      default: "",
      trim: true,
    },

    recipientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    recipientUserModel: {
      type: String,
      default: "",
      trim: true,
    },

    targetBarangays: {
      type: [String],
      default: [],
    },

    targetUsers: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },

    connectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Connection",
      default: null,
    },

    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    actorName: {
      type: String,
      default: "",
      trim: true,
    },

    actorUsername: {
      type: String,
      default: "",
      trim: true,
    },

    actorAvatar: {
      type: String,
      default: "",
      trim: true,
    },

    connectionCode: {
      type: String,
      default: "",
      trim: true,
    },

    actionable: {
      type: Boolean,
      default: false,
    },

    handledAt: {
      type: Date,
      default: null,
    },

    read: {
      type: Boolean,
      default: false,
    },

    isRead: {
      type: Boolean,
      default: false,
    },

    dedupeKey: {
      type: String,
      default: "",
      trim: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const locationSchema = new mongoose.Schema(
  {
    lat: {
      type: Number,
      default: null,
    },
    lng: {
      type: Number,
      default: null,
    },
    updatedAt: {
      type: Date,
      default: null,
    },
    share: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },

    fname: {
      type: String,
      trim: true,
      default: "",
    },

    lname: {
      type: String,
      trim: true,
      default: "",
    },

    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      lowercase: true,
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    phoneNumber: {
      type: String,
      trim: true,
      default: "",
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    district: {
      type: String,
      trim: true,
      default: "",
    },

    barangay: {
      type: String,
      trim: true,
      default: "",
    },

    street: {
      type: String,
      trim: true,
      default: "",
    },

    streetAddress: {
      type: String,
      trim: true,
      default: "",
    },

    location: {
      type: locationSchema,
      default: () => ({
        lat: null,
        lng: null,
        updatedAt: null,
        share: false,
      }),
    },

    shareSafetyLocation: {
      type: Boolean,
      default: false,
      index: true,
    },

    connections: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Connection",
      },
    ],

    notifications: {
      type: [notificationSchema],
      default: [],
    },

    // ✅ Remember when the user cleared notifications.
    // This prevents old guideline/announcement notifications from coming back.
    notificationClearedAt: {
      type: Date,
      default: null,
    },

    // ✅ Remember cleared guideline/announcement dedupe keys.
    // This prevents syncRecentGuidelineNotificationsForUser() and
    // syncRecentAnnouncementNotificationsForUser() from recreating old cleared posts.
    clearedNotificationDedupeKeys: {
      type: [String],
      default: [],
    },

    safetyStatus: {
      type: String,
      enum: ["SAFE", "NOT_SAFE", "UNKNOWN"],
      default: "UNKNOWN",
    },

    safetyMessage: {
      type: String,
      default: "",
      trim: true,
    },

    safetyUpdatedAt: {
      type: Date,
      default: null,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    verificationToken: {
      type: String,
      default: "",
    },

    verificationTokenExpires: {
      type: Date,
      default: null,
    },

    otp: {
      type: String,
      default: "",
    },

    otpExpires: {
      type: Date,
      default: null,
    },

    phoneOtp: {
      type: String,
      default: "",
    },

    phoneOtpExpires: {
      type: Date,
      default: null,
    },

    emailOtp: {
      type: String,
      default: "",
    },

    emailOtpExpires: {
      type: Date,
      default: null,
    },

    otpCodeHash: {
      type: String,
      default: "",
    },

    otpPurpose: {
      type: String,
      default: "",
      trim: true,
    },

    otpChannel: {
      type: String,
      enum: ["", "sms", "email"],
      default: "",
      trim: true,
    },

    lastOtpSentAt: {
      type: Date,
      default: null,
    },

    otpAttempts: {
      type: Number,
      default: 0,
    },

    passwordResetVerifiedAt: {
      type: Date,
      default: null,
    },

    passwordResetSkippedAt: {
      type: Date,
      default: null,
    },

    passwordResetSkipCount: {
      type: Number,
      default: 0,
    },

    lastPasswordResetChannel: {
      type: String,
      enum: ["", "sms", "email"],
      default: "",
      trim: true,
    },

    lastPasswordResetOtpVerified: {
      type: Boolean,
      default: false,
    },

    passwordResetTokenHash: {
      type: String,
      default: "",
    },

    passwordResetTokenExpires: {
      type: Date,
      default: null,
    },

    isArchived: {
      type: Boolean,
      default: false,
    },

    archivedAt: {
      type: Date,
      default: null,
    },

    avatar: {
      type: String,
      default: "",
      trim: true,
    },

    avatarPublicId: {
      type: String,
      default: "",
      trim: true,
    },

    deleteAfter: {
      type: Date,
      default: null,
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    notificationTokens: {
      type: [
        {
          token: { type: String, required: true, trim: true },
          platform: { type: String, default: "", trim: true },
          deviceId: { type: String, default: "", trim: true },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

userSchema.index({ barangay: 1, isArchived: 1 });
userSchema.index({ "notifications.dedupeKey": 1 });
userSchema.index({ notificationClearedAt: 1 });
userSchema.index({ clearedNotificationDedupeKeys: 1 });
userSchema.index({
  "notifications.type": 1,
  "notifications.referenceId": 1,
  "notifications.recipientUser": 1,
});

const UserModel = mongoose.model("User", userSchema);

module.exports = UserModel;
