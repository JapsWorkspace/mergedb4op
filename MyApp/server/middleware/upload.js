const multer = require("multer");
const path = require("path");
const fs = require("fs");

// =======================
// ✅ Local folders
// =======================
const guidelineDir = path.join(__dirname, "../uploads/guidelines");
const proofDir = path.join(__dirname, "../uploads/proofs");

if (!fs.existsSync(guidelineDir)) {
  fs.mkdirSync(guidelineDir, { recursive: true });
}

if (!fs.existsSync(proofDir)) {
  fs.mkdirSync(proofDir, { recursive: true });
}

// =======================
// ✅ Local storage for proofs
// =======================
const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("Saving proof file to:", proofDir);
    cb(null, proofDir);
  },

  filename: (req, file, cb) => {
    const uniqueSuffix =
      Date.now() + "-" + Math.round(Math.random() * 1e9);

    const finalName = `${uniqueSuffix}-${file.originalname}`;

    console.log(
      "Uploading proof file:",
      file.originalname,
      "as",
      finalName
    );

    cb(null, finalName);
  },
});

// =======================
// ✅ Optional local storage for generic uploads
// =======================
const localGuidelineStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("Saving generic file to:", guidelineDir);
    cb(null, guidelineDir);
  },

  filename: (req, file, cb) => {
    const uniqueSuffix =
      Date.now() + "-" + Math.round(Math.random() * 1e9);

    const finalName = `${uniqueSuffix}-${file.originalname}`;

    console.log(
      "Uploading generic file:",
      file.originalname,
      "as",
      finalName
    );

    cb(null, finalName);
  },
});

// =======================
// ✅ File filters
// =======================
const proofFileFilter = (req, file, cb) => {
  const allowedExt = /\.(jpeg|jpg|png|webp|pdf|doc|docx)$/i;

  const originalname = String(file.originalname || "").toLowerCase();

  const mimetype = String(file.mimetype || "").toLowerCase();

  const isAllowedExt = allowedExt.test(originalname);

  const isAllowedMime =
    mimetype.startsWith("image/") ||
    mimetype === "application/pdf" ||
    mimetype === "application/msword" ||
    mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (isAllowedExt || isAllowedMime) {
    return cb(null, true);
  }

  return cb(
    new Error("Only images and PDF files are allowed for proofs"),
    false
  );
};

const imageOnlyFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image")) {
    return cb(new Error("Only image files are allowed"), false);
  }

  cb(null, true);
};

const allowAllFilter = (req, file, cb) => {
  cb(null, true);
};

// =======================
// ✅ Guideline uploads
// =======================
const uploadGuideline = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const mimetype = String(file.mimetype || "").toLowerCase();

    const originalname = String(file.originalname || "").toLowerCase();

    const isImageMime = mimetype.startsWith("image/");

    const isImageExt =
      /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(originalname);

    if (!isImageMime && !isImageExt) {
      return cb(new Error("Only image files are allowed"), false);
    }

    return cb(null, true);
  },
});

// =======================
// ✅ Announcement uploads
// =======================
const uploadAnnouncement = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const mimetype = String(file.mimetype || "").toLowerCase();

    const originalname = String(file.originalname || "").toLowerCase();

    const isImageMime = mimetype.startsWith("image/");

    const isImageExt =
      /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(originalname);

    if (!isImageMime && !isImageExt) {
      return cb(new Error("Only image files are allowed"), false);
    }

    return cb(null, true);
  },
});

// =======================
// ✅ Proof uploader
// =======================
const uploadProof = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 15 * 1024 * 1024,
  },

  fileFilter: proofFileFilter,
});

// =======================
// ✅ Release proof uploader
// =======================
const uploadReleaseProofImages = multer({
  storage: proofStorage,

  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 5,
  },

  fileFilter: imageOnlyFilter,
});

// =======================
// ✅ Optional generic uploader
// =======================
const upload = multer({
  storage: localGuidelineStorage,
  fileFilter: allowAllFilter,
});

// =======================
// ✅ Avatar upload
// =======================
const uploadAvatar = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 25 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const mimetype = String(file.mimetype || "").toLowerCase();

    const originalname = String(file.originalname || "").toLowerCase();

    const isImageMime = mimetype.startsWith("image/");

    const isImageExt =
      /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(originalname);

    if (!isImageMime && !isImageExt) {
      return cb(new Error("Only image files allowed"), false);
    }

    return cb(null, true);
  },
});

// =======================
// ✅ Incident image upload
// =======================
const uploadIncidentImage = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 15 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const mimetype = String(file.mimetype || "").toLowerCase();

    const originalname = String(file.originalname || "").toLowerCase();

    const isImageMime = mimetype.startsWith("image/");

    const isImageExt =
      /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(originalname);

    if (!isImageMime && !isImageExt) {
      return cb(new Error("Only image files allowed"), false);
    }

    return cb(null, true);
  },
});

// =======================
// ✅ Public site image upload
// =======================
const uploadPublicSiteImage = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const mimetype = String(file.mimetype || "").toLowerCase();

    const originalname = String(file.originalname || "").toLowerCase();

    const isImageMime = mimetype.startsWith("image/");

    const isImageExt =
      /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(originalname);

    if (!isImageMime && !isImageExt) {
      return cb(
        new Error(
          "Only image files allowed for public site images"
        ),
        false
      );
    }

    return cb(null, true);
  },
});

// =======================
// ✅ Donation photos upload
// =======================
const uploadDonationPhotos = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 4,
  },

  fileFilter: (req, file, cb) => {
    const mimetype = String(file.mimetype || "").toLowerCase();

    const originalname = String(file.originalname || "").toLowerCase();

    const isImageMime = mimetype.startsWith("image/");

    const isImageExt =
      /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(originalname);

    if (!isImageMime && !isImageExt) {
      return cb(
        new Error("Only image files allowed for donation photos"),
        false
      );
    }

    return cb(null, true);
  },
});

// =======================
// 🛠 Debug helpers
// =======================
uploadGuideline.debugMiddleware = (req, res, next) => {
  console.log("Guideline files:", req.files || req.file);
  console.log("Body:", req.body);
  next();
};

uploadAnnouncement.debugMiddleware = (req, res, next) => {
  console.log("Announcement files:", req.files || req.file);
  console.log("Body:", req.body);
  next();
};

uploadProof.debugMiddleware = (req, res, next) => {
  console.log("Proof files:", req.files || req.file);
  console.log("Body:", req.body);
  next();
};

upload.debugMiddleware = (req, res, next) => {
  console.log("Request files (generic upload):", req.files || req.file);
  console.log("Request body (generic upload):", req.body);
  next();
};

uploadAvatar.debugMiddleware = (req, res, next) => {
  console.log("Avatar file:", req.file);
  console.log("Body:", req.body);
  next();
};

uploadIncidentImage.debugMiddleware = (req, res, next) => {
  console.log("Incident file:", req.file);
  console.log("Body:", req.body);
  next();
};

uploadPublicSiteImage.debugMiddleware = (req, res, next) => {
  console.log("Public site image:", req.file);
  console.log("Body:", req.body);
  next();
};

uploadDonationPhotos.debugMiddleware = (req, res, next) => {
  console.log("Request files (donation photos):", req.files || req.file);
  console.log("Request body (donation photos):", req.body);
  next();
};

// =======================
// ✅ Export
// =======================
module.exports = {
  uploadGuideline,
  uploadAnnouncement,
  uploadProof,
  uploadReleaseProofImages,
  upload,
  uploadAvatar,
  uploadIncidentImage,
  uploadPublicSiteImage,
  uploadDonationPhotos,
};
