const mongoose = require("mongoose");

const HeroSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: 90,
      default: "Jaen MDRRMO Public Information Portal",
    },
    subtitle: {
      type: String,
      trim: true,
      maxlength: 180,
      default:
        "Access weather conditions, public advisories, emergency contacts, evacuation information, and local DRRM updates in one place.",
    },
    primaryCtaLabel: {
      type: String,
      trim: true,
      maxlength: 24,
      default: "View Weather",
    },
    secondaryCtaLabel: {
      type: String,
      trim: true,
      maxlength: 24,
      default: "Emergency Contacts",
    },
  },
  { _id: false }
);

const HeroImageSchema = new mongoose.Schema(
  {
    fileName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
    fileUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
      required: true,
    },
    public_id: {
      type: String,
      trim: true,
      maxlength: 255,
      default: "",
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "",
    },
  },
  { _id: true, timestamps: false }
);

const AlertSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: true,
    },
    level: {
      type: String,
      trim: true,
      maxlength: 20,
      default: "Advisory",
    },
    text: {
      type: String,
      trim: true,
      maxlength: 180,
      default:
        "Monitor official weather updates and keep emergency contact lines accessible.",
    },
  },
  { _id: false }
);

const AnnouncementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: 80,
      required: true,
    },
    body: {
      type: String,
      trim: true,
      maxlength: 180,
      required: true,
    },
    tag: {
      type: String,
      trim: true,
      maxlength: 32,
      default: "Update",
    },
  },
  { _id: true, timestamps: false }
);

const ServiceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: 50,
      required: true,
    },
    desc: {
      type: String,
      trim: true,
      maxlength: 120,
      required: true,
    },
    icon: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "announcement",
    },
  },
  { _id: true, timestamps: false }
);

const HotlineSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      maxlength: 40,
      required: true,
    },
    number: {
      type: String,
      trim: true,
      maxlength: 120,
      required: true,
    },
    type: {
      type: String,
      enum: ["call", "sms", "email", "link"],
      default: "call",
    },
  },
  { _id: true, timestamps: false }
);

const TipSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      trim: true,
      maxlength: 120,
      required: true,
    },
  },
  { _id: true, timestamps: false }
);

const OfficeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "Jaen MDRRMO",
    },
    address: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "Jaen, Nueva Ecija",
    },
    hours: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "Office hours may vary during emergencies.",
    },
    email: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "jaenmdrrmo@example.com",
    },
    facebook: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "https://facebook.com/",
    },
  },
  { _id: false }
);

const PublicSiteSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "main",
      index: true,
    },

    hero: {
      type: HeroSchema,
      default: () => ({}),
    },

    heroImages: {
      type: [HeroImageSchema],
      default: [],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length <= 12;
        },
        message: "Hero images cannot exceed 12 items.",
      },
    },

    alert: {
      type: AlertSchema,
      default: () => ({}),
    },

    announcements: {
      type: [AnnouncementSchema],
      default: [
        {
          title: "Preparedness Reminder",
          body: "Keep go-bags ready, secure important documents, and monitor MDRRMO advisories during unstable weather.",
          tag: "Public Advisory",
        },
        {
          title: "Evacuation Readiness",
          body: "Barangays should review local evacuation areas and identify households needing priority assistance.",
          tag: "Operations",
        },
      ],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length <= 5;
        },
        message: "Announcements cannot exceed 5 items.",
      },
    },

    services: {
      type: [ServiceSchema],
      default: [
        {
          title: "Evacuation Areas",
          desc: "View mapped evacuation areas and their current status.",
          icon: "evacuation",
        },
        {
          title: "Announcements",
          desc: "See official advisories and updates from the MDRRMO.",
          icon: "announcement",
        },
        {
          title: "Relief Services",
          desc: "Understand local relief support and emergency response information.",
          icon: "relief",
        },
        {
          title: "Citizen Access",
          desc: "Login for authorized system access and operational modules.",
          icon: "account",
        },
      ],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length <= 6;
        },
        message: "Services cannot exceed 6 items.",
      },
    },

    hotlines: {
      type: [HotlineSchema],
      default: [
        {
          label: "Emergency Hotline",
          number: "0999-000-0000",
          type: "call",
        },
        {
          label: "SMS Hotline",
          number: "0999-000-0001",
          type: "sms",
        },
        {
          label: "Email",
          number: "jaenmdrrmo@example.com",
          type: "email",
        },
        {
          label: "Facebook Page",
          number: "https://facebook.com/",
          type: "link",
        },
      ],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length <= 4;
        },
        message: "Hotlines cannot exceed 4 items.",
      },
    },

    tips: {
      type: [TipSchema],
      default: [
        { text: "Prepare a go-bag for each household member." },
        { text: "Keep flashlights, batteries, and water ready." },
        { text: "Save emergency numbers on every family phone." },
        { text: "Follow official advisories and avoid rumor-based posts." },
      ],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length <= 6;
        },
        message: "Preparedness tips cannot exceed 6 items.",
      },
    },

    office: {
      type: OfficeSchema,
      default: () => ({}),
    },

    incidentFeedMode: {
      type: String,
      enum: ["all", "resolved-only"],
      default: "all",
    },

    updatedBy: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PublicSite", PublicSiteSchema);
