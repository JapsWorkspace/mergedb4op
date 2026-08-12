const mongoose = require("mongoose");
const slugify = require("slugify");

const AnnouncementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [150, "Title cannot exceed 150 characters"],
    },

    slug: {
      type: String,
      unique: true,
      sparse: true,
    },

    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },

    category: {
      type: String,
      enum: ["general", "advisory", "event", "service", "weather", "emergency"],
      default: "general",
      trim: true,
    },

    priorityLevel: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },

    pinned: {
      type: Boolean,
      default: false,
      index: true,
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },

    senderRole: {
      type: String,
      default: "drrmo",
      trim: true,
    },

    publishedNotificationSent: {
      type: Boolean,
      default: false,
    },

    publishedNotificationSentAt: {
      type: Date,
      default: null,
    },

    attachments: [
      {
        fileName: String,
        fileUrl: String,
        public_id: String,
      },
    ],

    views: {
      type: Number,
      default: 0,
    },

    viewedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    likedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

AnnouncementSchema.virtual("viewCount").get(function () {
  return Array.isArray(this.viewedBy) ? this.viewedBy.length : this.views || 0;
});

AnnouncementSchema.virtual("likeCount").get(function () {
  return Array.isArray(this.likedBy) ? this.likedBy.length : 0;
});

AnnouncementSchema.set("toJSON", { virtuals: true });
AnnouncementSchema.set("toObject", { virtuals: true });

AnnouncementSchema.index({ status: 1, pinned: -1, category: 1, createdAt: -1 });

AnnouncementSchema.pre("save", function () {
  if (!this.isModified("title") || !this.title) return;
  this.slug = slugify(this.title, {
    lower: true,
    strict: true,
  });
});

module.exports = mongoose.model("Announcement", AnnouncementSchema);
