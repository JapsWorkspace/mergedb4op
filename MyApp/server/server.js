// RESOLVED MERGE VERSION OF server.js

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const path = require("path");
const fs = require("fs");

const http = require("http");
const { Server } = require("socket.io");

const Donation = require("./models/Donation");
const UserStaff = require("./models/UserStaff");
const Barangay = require("./models/Barangay");



if (process.env.NODE_ENV !== "production") {
  dotenv.config({
    path: path.join(__dirname, ".env"),
    quiet: true,
  });
}

mongoose.set("bufferCommands", false);

function resolveRouteModule(routeModule) {
  return routeModule && typeof routeModule === "object" && routeModule.default
    ? routeModule.default
    : routeModule;
}

// --------------------
// Routes
// --------------------
const userRoutes = require("./routes/userRoutes");
const incidentRoutes = require("./routes/incidentRoutes");
const historyRoutes = require("./routes/historyRoutes");
const evacRoutes = require("./routes/EvacRoutes");
const authRoutes = require("./routes/authRoutes");
const barangayRoutes = require("./routes/barangayRoutes");
const drrmoRoutes = require("./routes/drrmoRoutes");
const reliefTrackingRoutes = require("./routes/reliefTrackingRoutes");
const auditRoutes = require("./routes/auditRoutes");
const { exportAuditLogsPdf } = require("./controllers/auditController");
const { requireLogin, requireAdmin } = require("./middleware/adminMiddleware");
const guidelineRoutes = require("./routes/GuidelineRoutes");
const announcementRoutes = require("./routes/AnnouncementRoutes");
const connectionRoutes = require("./routes/connectionRoutes");
const timeInOutRoutes = require("./routes/timeInOutRoutes");
const editRoutes = require("./routes/editRoutes");
const barangayStockRoutes = require("./routes/barangayStockRoutes");
const donationRoutes = require("./routes/donationRoutes");
const safetyMarkingRoutes = require("./routes/safetyMarkingRoutes");
const devNotificationRoutes = require("./routes/devNotificationRoutes");
const smsRoutes = require("./routes/smsRoutes");
const emailRoutes = require("./routes/emailRoutes");

const inventoryRoutes = require("./routes/inventoryRoutes");
const reliefRequestRoutes = require("./routes/reliefRequestRoutes");
const reliefDistributionRoutes = require("./routes/reliefDistributionRoutes");
const reliefReleaseRoutes = require("./routes/reliefReleaseRoutes");
const barangayCollectionRoutes = require("./routes/barangayCollectionRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const publicSiteRoutes = require("./routes/publicSiteRoutes");
const foodPackRoutes = require("./routes/foodPackRoutes");
const overviewAnalyticsRoutes = require("./routes/overviewAnalysticsRoutes");
const reliefAnalyticsRoutes = require("./routes/reliefAnalyticsRoutes");
const incidentAnalyticsRoutes = require("./routes/incidentAnalyticsRoutes");
const evacAnalyticsRoutes = require("./routes/EvacAnalyticsRoutes");
const waterLevelRoutes = resolveRouteModule(
  require("./routes/waterLevelRoutes")
);
const yoloRoutes = require("./routes/yoloRoutes");

const app = express();
const server = http.createServer(app);

const hazardLayerFiles = {
  safe: path.join(__dirname, "..", "screens", "data", "Safe.json"),
  medium: path.join(__dirname, "..", "screens", "data", "Medium.json"),
  susceptible: path.join(
    __dirname,
    "..",
    "screens",
    "data",
    "Susceptible_clean.json"
  ),
};

function readHazardLayer(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

app.set("trust proxy", 1);

// --------------------
// Upload folders
// --------------------
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const guidelinesDir = path.join(uploadDir, "guidelines");
if (!fs.existsSync(guidelinesDir)) {
  fs.mkdirSync(guidelinesDir, { recursive: true });
}

const announcementsDir = path.join(uploadDir, "announcements");
if (!fs.existsSync(announcementsDir)) {
  fs.mkdirSync(announcementsDir, { recursive: true });
}

const inventoryDir = path.join(uploadDir, "inventory");
if (!fs.existsSync(inventoryDir)) {
  fs.mkdirSync(inventoryDir, { recursive: true });
}

const goodsDir = path.join(uploadDir, "goods");
if (!fs.existsSync(goodsDir)) {
  fs.mkdirSync(goodsDir, { recursive: true });
}

const monetaryDir = path.join(uploadDir, "monetary");
if (!fs.existsSync(monetaryDir)) {
  fs.mkdirSync(monetaryDir, { recursive: true });
}

const proofsDir = path.join(uploadDir, "proofs");
if (!fs.existsSync(proofsDir)) {
  fs.mkdirSync(proofsDir, { recursive: true });
}

const reliefRequestsDir = path.join(uploadDir, "relief-requests");
if (!fs.existsSync(reliefRequestsDir)) {
  fs.mkdirSync(reliefRequestsDir, { recursive: true });
}

const avatarsDir = path.join(uploadDir, "avatars");
if (!fs.existsSync(avatarsDir)) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

// --------------------
// Body parsers
// --------------------
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// --------------------
// CORS
// --------------------
function parseBooleanEnv(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["true", "1", "yes", "y"].includes(
    String(value).trim().toLowerCase()
  );
}

function parseCsvEnv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const FRONTEND_URLS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:8081",
  "http://10.0.2.2:8081",
  "http://192.168.1.87:8081",
  "http://192.168.1.131:3000",
  "https://sagipbayan.com",
  ...parseCsvEnv(process.env.FRONTEND_URLS),
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || FRONTEND_URLS.includes(origin)) {
        callback(null, true);
      } else {
        console.log("[cors] blocked origin:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// --------------------
// Session
// --------------------
const isProd = process.env.NODE_ENV === "production";

const requestedSecureSessionCookie = parseBooleanEnv(
  process.env.SESSION_COOKIE_SECURE,
  isProd
);

// Local HTTP development cannot persist Secure cookies, so force them off
// outside production even if the env file still has SESSION_COOKIE_SECURE=true.
const useSecureSessionCookie = isProd ? requestedSecureSessionCookie : false;

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    proxy: useSecureSessionCookie,
    cookie: {
      secure: useSecureSessionCookie,
      httpOnly: true,
      sameSite: useSecureSessionCookie ? "none" : "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

// --------------------
// DEBUG middleware
// --------------------
app.use((req, res, next) => {
  console.log("REQUEST:", req.method, req.url);
  console.log("SESSION:", req.session);
  next();
});

// --------------------
// Health / Debug routes
// --------------------
app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Backend is reachable",
  });
});

app.post("/health-post", (req, res) => {
  console.log("POST /health-post reached");
  console.log("BODY:", req.body);

  res.status(200).json({
    ok: true,
    message: "POST is working",
    body: req.body,
  });
});

app.get("/api/debug-express", (req, res) => {
  res.json({
    message: "EXPRESS WORKING",
    session: req.session,
  });
});

app.get("/api/mobile-debug", async (req, res) => {
  const startedAt = Date.now();

  const checks = {
    backend: true,
    apiStatus: "ok",
    mongoState: mongoose.connection.readyState,
    incidentFetch: false,
    evacFetch: false,
    guidelineFetch: false,
  };

  try {
    const [incidentCount, evacCount, guidelineCount] = await Promise.all([
      mongoose.connection.db.collection("incidents").countDocuments({
        $or: [
          { isPublic: true },
          { forceApproved: true },
          { approvedByMDRRMO: true },
          { status: /^approved$/i },
        ],
      }),

      mongoose.connection.db
        .collection("evacplaces")
        .countDocuments({ isArchived: { $ne: true } }),

      mongoose.connection.db
        .collection("guidelines")
        .countDocuments({ status: "published" }),
    ]);

    checks.incidentFetch = true;
    checks.evacFetch = true;
    checks.guidelineFetch = true;

    res.json({
      ok: true,
      message: "Connected to server",
      responseTimeMs: Date.now() - startedAt,
      checks,
      counts: {
        publicIncidents: incidentCount,
        evacuationCenters: evacCount,
        publishedGuidelines: guidelineCount,
      },
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: "Failed to fetch server diagnostics",
      responseTimeMs: Date.now() - startedAt,
      checks,
      error: err.message,
    });
  }
});

app.get("/api/tryserver", (req, res) => {
  res.json({ message: "Server is working!" });
});

app.get("/api/debug-session", async (req, res) => {
  try {
    const role = String(req.session?.role || "").toLowerCase();
    const userId = req.session?.userId || null;

    let themePreference = req.session?.themePreference || null;

    if (userId && role && !themePreference) {
      const Model = role === "barangay" ? Barangay : UserStaff;

      const account = await Model.findById(userId)
        .select("themePreference")
        .lean();

      themePreference = account?.themePreference || "dark";

      req.session.themePreference = themePreference;
    }

    res.json({
      session: req.session,
      username: req.session?.username || null,
      userId,
      role: req.session?.role || null,
      themePreference: themePreference || "dark",
    });
  } catch (error) {
    console.error("Debug session error:", error);

    res.status(500).json({
      message: "Failed to read session",
    });
  }
});

app.get("/", (req, res) => {
  res.send("ROOT WORKING");
});

// --------------------
// Serve uploads
// --------------------
app.use("/uploads", express.static(uploadDir));
app.use("/uploads/guidelines", express.static(guidelinesDir));
app.use("/uploads/announcements", express.static(announcementsDir));
app.use("/uploads/inventory", express.static(inventoryDir));
app.use("/uploads/goods", express.static(goodsDir));
app.use("/uploads/monetary", express.static(monetaryDir));
app.use("/uploads/proofs", express.static(proofsDir));
app.use("/uploads/relief-requests", express.static(reliefRequestsDir));
app.use("/uploads/avatars", express.static(avatarsDir));
app.use("/uploads", (req, res) => {
  res.status(404).json({
    message:
      "Uploaded file not found. If this was an older local upload, it may no longer exist on the server.",
  });
});

// --------------------
// API Routes
// --------------------
app.use("/api/guidelines", guidelineRoutes);
app.use("/api/announcements", announcementRoutes);

app.use("/user", userRoutes);

app.use("/incident", incidentRoutes);
app.use("/api/incident", incidentRoutes);

app.use("/history", historyRoutes);
app.use("/evacs", evacRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/barangays/collection", barangayCollectionRoutes);
app.use("/api/barangays", barangayRoutes);

app.use("/api/drrmo", drrmoRoutes);

app.use("/api/relief-tracking", reliefTrackingRoutes);

app.get("/api/audit/export-pdf", requireLogin, requireAdmin, exportAuditLogsPdf);
app.get("/api/audit-trail/export-pdf", requireLogin, requireAdmin, exportAuditLogsPdf);
app.use("/api/audit", auditRoutes);

app.use("/connection", connectionRoutes);

app.use("/api/timeinout", timeInOutRoutes);

app.use("/api/edit", editRoutes);

app.use("/api/inventory", inventoryRoutes);

app.use("/api/relief-requests", reliefRequestRoutes);

app.use("/api/relief-distributions", reliefDistributionRoutes);

app.use("/api/relief-releases", reliefReleaseRoutes);

app.use("/api/barangay-stock", barangayStockRoutes);

app.use("/api/donations", donationRoutes);

app.use("/api/safety-marking", safetyMarkingRoutes);

app.use("/api/sms", smsRoutes);

app.use("/api/notifications", notificationRoutes);

app.use("/api/public-site", publicSiteRoutes);

app.use("/api/food-pack-templates", foodPackRoutes);

app.use("/api/overview-analytics", overviewAnalyticsRoutes);

app.use("/api/relief-analytics", reliefAnalyticsRoutes);

app.use("/api/incident-analytics", incidentAnalyticsRoutes);

app.use("/api/evac-analytics", evacAnalyticsRoutes);

app.use("/api/water-levels", waterLevelRoutes);

app.use("/api/yolo", yoloRoutes);

if (process.env.NODE_ENV !== "production") {
  app.use("/api/email", emailRoutes);
  app.use("/api", devNotificationRoutes);
}

// --------------------
// Hazard proxy
// --------------------
app.get("/api/hazard-layers", (req, res) => {
  try {
    res.json({
      safe: readHazardLayer(hazardLayerFiles.safe),
      medium: readHazardLayer(hazardLayerFiles.medium),
      susceptible: readHazardLayer(hazardLayerFiles.susceptible),
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to load hazard layers.",
      error: err.message,
    });
  }
});

app.get("/hazards", async (req, res) => {
  try {
    const citiesRes = await fetch("https://api.mapakalamidad.ph/cities");

    const citiesJson = await citiesRes.json();

    const pasig = citiesJson.result?.find(
      (city) =>
        city.name.toLowerCase().includes("pasig") ||
        city.code.toLowerCase().includes("pasig")
    );

    if (!pasig) {
      return res.status(404).json({
        error: "Pasig City not found",
      });
    }

    const reportsRes = await fetch(
      `https://api.mapakalamidad.ph/reports?geoformat=geojson&admin=${pasig.code}`,
      {
        headers: {
          "User-Agent": "MyHazardMapApp/1.0",
        },
      }
    );

    const reportsData = await reportsRes.json();

    res.json(reportsData.result);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// --------------------
// React build production
// --------------------
if (process.env.NODE_ENV === "production") {
  const buildPath = path.join(__dirname, "..", "tests", "build");

  app.use(express.static(buildPath));

  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(buildPath, "index.html"));
  });
}

// --------------------
// Global error handler
// --------------------
app.use((err, req, res, next) => {
  console.error("GLOBAL EXPRESS ERROR:", {
    method: req.method,
    url: req.originalUrl,
    message: err.message,
    name: err.name,
    code: err.code,
    stack: err.stack,
  });

  res.status(err.status || 500).json({
    message: err.message || "Server error",
    name: err.name || "Error",
    code: err.code || null,
  });
});

// --------------------
// Socket.IO
// --------------------
const io = new Server(server, {
  cors: {
    origin: "*",
    credentials: true,
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("[socket] User connected:", socket.id);

  socket.on("joinRoom", (userId) => {
    const roomId = String(userId || "").trim();

    if (!roomId) return;

    socket.join(roomId);

    console.log("[socket] joined room:", roomId);
  });

  socket.on("send-location", (data) => {
    console.log("[socket] Received location:", data);

    socket.broadcast.emit("receive-location", data);
  });

  socket.on("disconnect", () => {
    console.log("[socket] User disconnected:", socket.id);
  });
});

// --------------------
// MongoDB / Server startup
// --------------------
async function startServer() {
  const mongoUri = process.env.MONGO_URI?.trim();

  if (!mongoUri) {
    console.error(
      "MongoDB startup error: MONGO_URI is missing in MyApp/server/.env"
    );

    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB Atlas connected");

    mongoose.connection.once("open", async () => {
      console.log("Connected DB:", mongoose.connection.name);

      const collections = await mongoose.connection.db
        .listCollections()
        .toArray();

      console.log(
        "Collections in DB:",
        collections.map((c) => c.name)
      );

      try {
        await Donation.ensureReferenceIndexes?.();
      } catch (err) {
        console.error(
          "[donations] failed to ensure reference indexes:",
          err
        );
      }
    });

    const PORT = process.env.PORT || 8000;

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use. Stop the other server using that port, or start this one with a different PORT value.`
        );

        console.error("Example: $env:PORT=8001; node server.js");

        process.exit(1);
      }

      console.error("Server failed to start:", err);

      process.exit(1);
    });

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("MongoDB connection error:", err.message || err);

    process.exit(1);
  }
}

startServer();
