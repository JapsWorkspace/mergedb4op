const mongoose = require("mongoose");
const PublicSite = require("../models/PublicSite");
const Notification = require("../models/Notification");
const cloudinary = require("../config/cloudinary");
const createNotification = require("../utils/createNotification");

const LIMITS = {
  announcements: 5,
  services: 6,
  hotlines: 4,
  tips: 6,
};

const DEFAULT_PAYLOAD = {
  key: "main",
  hero: {
    title: "Jaen MDRRMO Public Information Portal",
    subtitle:
      "Access weather conditions, public advisories, emergency contacts, evacuation information, and local DRRM updates in one place.",
    primaryCtaLabel: "View Weather",
    secondaryCtaLabel: "Emergency Contacts",
  },
  heroImages: [],
  alert: {
    enabled: true,
    level: "Advisory",
    text: "Monitor official weather updates and keep emergency contact lines accessible.",
  },
  announcements: [
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
  services: [
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
  hotlines: [
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
  tips: [
    { text: "Prepare a go-bag for each household member." },
    { text: "Keep flashlights, batteries, and water ready." },
    { text: "Save emergency numbers on every family phone." },
    { text: "Follow official advisories and avoid rumor-based posts." },
  ],
  office: {
    name: "Jaen MDRRMO",
    address: "Jaen, Nueva Ecija",
    hours: "Office hours may vary during emergencies.",
    email: "jaenmdrrmo@example.com",
    facebook: "https://facebook.com/",
  },
  incidentFeedMode: "all",
};

const MAX_HERO_IMAGES = 12;

const trimString = (value, maxLength, fallback = "") => {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
};

const normalizeArray = (value) => {
  return Array.isArray(value) ? value : [];
};

const sanitizeAnnouncement = (item) => {
  return {
    title: trimString(item?.title, 80),
    body: trimString(item?.body, 180),
    tag: trimString(item?.tag, 32, "Update") || "Update",
  };
};

const sanitizeService = (item) => {
  const allowedIcons = ["evacuation", "announcement", "relief", "account"];
  const icon = trimString(item?.icon, 30, "announcement");

  return {
    title: trimString(item?.title, 50),
    desc: trimString(item?.desc, 120),
    icon: allowedIcons.includes(icon) ? icon : "announcement",
  };
};

const sanitizeHotline = (item) => {
  const allowedTypes = ["call", "sms", "email", "link"];
  const type = trimString(item?.type, 20, "call");

  return {
    label: trimString(item?.label, 40),
    number: trimString(item?.number, 120),
    type: allowedTypes.includes(type) ? type : "call",
  };
};

const sanitizeTip = (item) => {
  return {
    text: trimString(item?.text, 120),
  };
};

const sanitizeHeroImage = (item) => {
  const fileUrl = trimString(item?.fileUrl, 1000);

  if (!fileUrl) return null;

  return {
    _id: item?._id && mongoose.isValidObjectId(item._id) ? item._id : undefined,
    fileName: trimString(item?.fileName, 200),
    fileUrl,
    public_id: trimString(item?.public_id, 255),
    caption: trimString(item?.caption, 80),
  };
};

const sanitizePayload = (body = {}) => {
  const announcements = normalizeArray(body.announcements)
    .slice(0, LIMITS.announcements)
    .map(sanitizeAnnouncement)
    .filter((item) => item.title && item.body);

  const services = normalizeArray(body.services)
    .slice(0, LIMITS.services)
    .map(sanitizeService)
    .filter((item) => item.title && item.desc);

  const hotlines = normalizeArray(body.hotlines)
    .slice(0, LIMITS.hotlines)
    .map(sanitizeHotline)
    .filter((item) => item.label && item.number);

  const tips = normalizeArray(body.tips)
    .slice(0, LIMITS.tips)
    .map(sanitizeTip)
    .filter((item) => item.text);

  const incidentFeedModeRaw =
    trimString(body?.incidentFeedMode, 20, DEFAULT_PAYLOAD.incidentFeedMode) ||
    DEFAULT_PAYLOAD.incidentFeedMode;
  const incidentFeedMode =
    incidentFeedModeRaw === "resolved-only" ? "resolved-only" : "all";

  const heroImages = normalizeArray(body.heroImages)
    .slice(0, MAX_HERO_IMAGES)
    .map(sanitizeHeroImage)
    .filter(Boolean);

  return {
    hero: {
      title:
        trimString(body?.hero?.title, 90, DEFAULT_PAYLOAD.hero.title) ||
        DEFAULT_PAYLOAD.hero.title,
      subtitle:
        trimString(body?.hero?.subtitle, 180, DEFAULT_PAYLOAD.hero.subtitle) ||
        DEFAULT_PAYLOAD.hero.subtitle,
      primaryCtaLabel:
        trimString(
          body?.hero?.primaryCtaLabel,
          24,
          DEFAULT_PAYLOAD.hero.primaryCtaLabel
        ) || DEFAULT_PAYLOAD.hero.primaryCtaLabel,
      secondaryCtaLabel:
        trimString(
          body?.hero?.secondaryCtaLabel,
          24,
          DEFAULT_PAYLOAD.hero.secondaryCtaLabel
        ) || DEFAULT_PAYLOAD.hero.secondaryCtaLabel,
    },
    heroImages,

    alert: {
      enabled: !!body?.alert?.enabled,
      level:
        trimString(body?.alert?.level, 20, DEFAULT_PAYLOAD.alert.level) ||
        DEFAULT_PAYLOAD.alert.level,
      text:
        trimString(body?.alert?.text, 180, DEFAULT_PAYLOAD.alert.text) ||
        DEFAULT_PAYLOAD.alert.text,
    },

    announcements:
      announcements.length > 0 ? announcements : DEFAULT_PAYLOAD.announcements,

    services: services.length > 0 ? services : DEFAULT_PAYLOAD.services,

    hotlines: hotlines.length > 0 ? hotlines : DEFAULT_PAYLOAD.hotlines,

    tips: tips.length > 0 ? tips : DEFAULT_PAYLOAD.tips,

    office: {
      name:
        trimString(body?.office?.name, 50, DEFAULT_PAYLOAD.office.name) ||
        DEFAULT_PAYLOAD.office.name,
      address:
        trimString(body?.office?.address, 120, DEFAULT_PAYLOAD.office.address) ||
        DEFAULT_PAYLOAD.office.address,
      hours:
        trimString(body?.office?.hours, 120, DEFAULT_PAYLOAD.office.hours) ||
        DEFAULT_PAYLOAD.office.hours,
      email:
        trimString(body?.office?.email, 80, DEFAULT_PAYLOAD.office.email) ||
        DEFAULT_PAYLOAD.office.email,
      facebook:
        trimString(body?.office?.facebook, 120, DEFAULT_PAYLOAD.office.facebook) ||
        DEFAULT_PAYLOAD.office.facebook,
    },
    incidentFeedMode,
  };
};

const getActor = (req) => {
  return (
    req.session?.username ||
    req.session?.name ||
    req.session?.role ||
    "system"
  );
};

const getActorRole = (req) => {
  const role = trimString(req.session?.role, 20, "system").toLowerCase();
  if (["admin", "drrmo", "barangay"].includes(role)) return role;
  return "system";
};

const uploadHeroImageFile = async (file) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        { folder: "evacuation_app/public_site_hero" },
        (err, result) => {
          if (err) return reject(err);

          resolve({
            fileName: trimString(file?.originalname, 200),
            fileUrl: trimString(result?.secure_url, 1000),
            public_id: trimString(result?.public_id, 255),
            caption: "",
          });
        }
      )
      .end(file.buffer);
  });
};

const destroyCloudinaryAsset = async (publicId) => {
  const value = trimString(publicId, 255);
  if (!value) return;

  try {
    await cloudinary.uploader.destroy(value);
  } catch (error) {
    console.error("destroyCloudinaryAsset error:", error);
  }
};

const buildChangedSections = (previous = {}, next = {}) => {
  const sections = [];

  [
    ["hero", "Hero content"],
    ["alert", "Alert banner"],
    ["announcements", "Announcements"],
    ["services", "Services"],
    ["hotlines", "Hotlines"],
    ["tips", "Preparedness tips"],
    ["office", "Office details"],
    ["incidentFeedMode", "Incident feed mode"],
  ].forEach(([key, label]) => {
    if (JSON.stringify(previous?.[key] ?? null) !== JSON.stringify(next?.[key] ?? null)) {
      sections.push(label);
    }
  });

  return sections;
};

const createLandingAuditEvent = async ({
  req,
  type,
  title,
  message,
  priority = "normal",
  metadata = {},
}) => {
  await createNotification({
    recipientRole: "admin",
    senderUser: req.session?.userId || null,
    senderRole: getActorRole(req),
    senderName: getActor(req),
    module: "system",
    type,
    priority,
    title,
    message,
    link: "/admin/audit-trail",
    referenceModel: "PublicSite",
    metadata: {
      section: "landing_page",
      ...metadata,
    },
  });
};

const getOrCreatePublicSite = async () => {
  let site = await PublicSite.findOne({ key: "main" });

  if (!site) {
    site = await PublicSite.create(DEFAULT_PAYLOAD);
  }

  return site;
};

const getPublicSite = async (req, res) => {
  try {
    const site = await getOrCreatePublicSite();
    return res.status(200).json(site);
  } catch (error) {
    console.error("getPublicSite error:", error);
    return res.status(500).json({
      message: "Failed to load public site content.",
    });
  }
};

const updatePublicSite = async (req, res) => {
  try {
    const payload = sanitizePayload(req.body || {});
    const updatedBy = getActor(req);
    const existingSite = await getOrCreatePublicSite();
    const changedSections = buildChangedSections(existingSite?.toObject?.() || existingSite, payload);

    const updated = await PublicSite.findOneAndUpdate(
      { key: "main" },
      {
        $set: {
          hero: payload.hero,
          heroImages:
            payload.heroImages.length > 0
              ? payload.heroImages
              : existingSite?.heroImages || [],
          alert: payload.alert,
          announcements: payload.announcements,
          services: payload.services,
          hotlines: payload.hotlines,
          tips: payload.tips,
          office: payload.office,
          incidentFeedMode: payload.incidentFeedMode,
          updatedBy,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    if (changedSections.length > 0) {
      await createLandingAuditEvent({
        req,
        type: "landing_page_updated",
        title: "Landing page updated",
        message: `${updatedBy} updated landing page content.`,
        metadata: {
          changedSections,
        },
      });
    }

    return res.status(200).json({
      message: "Public site updated successfully.",
      data: updated,
    });
  } catch (error) {
    console.error("updatePublicSite error:", error);

    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Invalid public site content.",
        error: error.message,
      });
    }

    return res.status(500).json({
      message: "Failed to update public site content.",
    });
  }
};

const updateIncidentFeedMode = async (req, res) => {
  try {
    const mode = req.body?.mode === "resolved-only" ? "resolved-only" : "all";
    const updatedBy = getActor(req);

    const updated = await PublicSite.findOneAndUpdate(
      { key: "main" },
      {
        $set: {
          incidentFeedMode: mode,
          updatedBy,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    await createLandingAuditEvent({
      req,
      type: "landing_incident_feed_mode_updated",
      title: "Landing page incident feed changed",
      message: `${updatedBy} set the landing page incident feed to ${
        mode === "resolved-only" ? "resolved only" : "all incidents"
      }.`,
      metadata: {
        incidentFeedMode: mode,
      },
    });

    return res.status(200).json({
      message:
        mode === "resolved-only"
          ? "Landing page now shows resolved incidents only."
          : "Landing page now shows all incidents.",
      data: updated,
    });
  } catch (error) {
    console.error("updateIncidentFeedMode error:", error);
    return res.status(500).json({
      message: "Failed to update incident feed mode.",
    });
  }
};

const resetPublicSite = async (req, res) => {
  try {
    const updatedBy = getActor(req);
    const existingSite = await getOrCreatePublicSite();

    await Promise.all(
      normalizeArray(existingSite?.heroImages)
        .map((item) => item?.public_id)
        .filter(Boolean)
        .map((publicId) => destroyCloudinaryAsset(publicId))
    );

    const resetDoc = await PublicSite.findOneAndUpdate(
      { key: "main" },
      {
        $set: {
          ...DEFAULT_PAYLOAD,
          updatedBy,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    await createLandingAuditEvent({
      req,
      type: "landing_page_reset",
      title: "Landing page reset",
      message: `${updatedBy} reset the landing page content to default values.`,
    });

    return res.status(200).json({
      message: "Public site reset successfully.",
      data: resetDoc,
    });
  } catch (error) {
    console.error("resetPublicSite error:", error);
    return res.status(500).json({
      message: "Failed to reset public site content.",
    });
  }
};

const uploadPublicSiteHeroImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please choose an image to upload." });
    }

    const site = await getOrCreatePublicSite();
    const currentImages = normalizeArray(site?.heroImages);

    if (currentImages.length >= MAX_HERO_IMAGES) {
      return res.status(400).json({
        message: `Hero images cannot exceed ${MAX_HERO_IMAGES} items.`,
      });
    }

    const uploadedImage = await uploadHeroImageFile(req.file);
    currentImages.push(uploadedImage);

    site.heroImages = currentImages;
    site.updatedBy = getActor(req);
    await site.save();

    await createLandingAuditEvent({
      req,
      type: "landing_hero_image_uploaded",
      title: "Landing page image uploaded",
      message: `${getActor(req)} uploaded a new landing page hero image.`,
      metadata: {
        fileName: uploadedImage.fileName,
      },
    });

    return res.status(200).json({
      message: "Landing page image uploaded successfully.",
      data: site,
    });
  } catch (error) {
    console.error("uploadPublicSiteHeroImage error:", error);
    return res.status(500).json({
      message: "Failed to upload landing page image.",
    });
  }
};

const removePublicSiteHeroImage = async (req, res) => {
  try {
    const site = await getOrCreatePublicSite();
    const targetId = trimString(req.params?.imageId, 64);
    const existingImages = normalizeArray(site?.heroImages);
    const targetImage = existingImages.find((item) => String(item?._id) === targetId);

    if (!targetImage) {
      return res.status(404).json({ message: "Landing page image not found." });
    }

    site.heroImages = existingImages.filter((item) => String(item?._id) !== targetId);
    site.updatedBy = getActor(req);
    await site.save();
    await destroyCloudinaryAsset(targetImage.public_id);

    await createLandingAuditEvent({
      req,
      type: "landing_hero_image_removed",
      title: "Landing page image removed",
      message: `${getActor(req)} removed a landing page hero image.`,
      metadata: {
        fileName: targetImage.fileName,
      },
    });

    return res.status(200).json({
      message: "Landing page image removed successfully.",
      data: site,
    });
  } catch (error) {
    console.error("removePublicSiteHeroImage error:", error);
    return res.status(500).json({
      message: "Failed to remove landing page image.",
    });
  }
};

const reorderPublicSiteHeroImages = async (req, res) => {
  try {
    const imageIds = normalizeArray(req.body?.imageIds)
      .map((value) => trimString(value, 64))
      .filter(Boolean);

    const site = await getOrCreatePublicSite();
    const existingImages = normalizeArray(site?.heroImages);

    if (!imageIds.length || imageIds.length !== existingImages.length) {
      return res.status(400).json({
        message: "Please provide the full hero image order.",
      });
    }

    const imageMap = new Map(existingImages.map((item) => [String(item?._id), item]));
    const reordered = imageIds.map((id) => imageMap.get(id)).filter(Boolean);

    if (reordered.length !== existingImages.length) {
      return res.status(400).json({
        message: "Hero image order contains invalid entries.",
      });
    }

    site.heroImages = reordered;
    site.updatedBy = getActor(req);
    await site.save();

    await createLandingAuditEvent({
      req,
      type: "landing_hero_images_reordered",
      title: "Landing page images reordered",
      message: `${getActor(req)} changed the order of the landing page hero images.`,
    });

    return res.status(200).json({
      message: "Landing page image order updated successfully.",
      data: site,
    });
  } catch (error) {
    console.error("reorderPublicSiteHeroImages error:", error);
    return res.status(500).json({
      message: "Failed to reorder landing page images.",
    });
  }
};

const updatePublicSiteHeroImageCaption = async (req, res) => {
  try {
    const imageId = trimString(req.params?.imageId, 64);
    const caption = trimString(req.body?.caption, 80);
    const site = await getOrCreatePublicSite();
    const heroImages = normalizeArray(site?.heroImages);
    const imageIndex = heroImages.findIndex((item) => String(item?._id) === imageId);

    if (imageIndex === -1) {
      return res.status(404).json({ message: "Landing page image not found." });
    }

    heroImages[imageIndex] = {
      ...heroImages[imageIndex].toObject?.(),
      caption,
    };
    site.heroImages = heroImages;
    site.updatedBy = getActor(req);
    await site.save();

    await createLandingAuditEvent({
      req,
      type: "landing_hero_image_caption_updated",
      title: "Landing page image details updated",
      message: `${getActor(req)} updated a landing page hero image caption.`,
      metadata: {
        imageId,
      },
    });

    return res.status(200).json({
      message: "Landing page image details updated successfully.",
      data: site,
    });
  } catch (error) {
    console.error("updatePublicSiteHeroImageCaption error:", error);
    return res.status(500).json({
      message: "Failed to update landing page image details.",
    });
  }
};

module.exports = {
  getPublicSite,
  updatePublicSite,
  resetPublicSite,
  updateIncidentFeedMode,
  uploadPublicSiteHeroImage,
  removePublicSiteHeroImage,
  reorderPublicSiteHeroImages,
  updatePublicSiteHeroImageCaption,
};
