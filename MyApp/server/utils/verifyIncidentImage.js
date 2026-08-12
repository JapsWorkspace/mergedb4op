const rekognition = require("../config/rekognition");
const exif = require("exif-parser");
const { DetectLabelsCommand } = require("@aws-sdk/client-rekognition");

// 🔥 Define allowed labels per incident
const INCIDENT_RULES = {
  fire: ["fire", "flame", "smoke", "burn", "explosion"],
  flood: ["water", "flood", "river", "rain", "storm", "overflow"],
  accident: ["car", "vehicle", "crash", "accident", "road", "truck"]
};
const JAEN_CENTER = {
  lat: 15.3382,
  lng: 120.9056,
};

const MAX_DISTANCE_KM = 10; // adjust if needed

const isWithinJaen = (gps) => {
  if (!gps) return false;

  const toRad = (v) => (v * Math.PI) / 180;

  const R = 6371; // Earth radius in KM
  const dLat = toRad(gps.lat - JAEN_CENTER.lat);
  const dLng = toRad(gps.lng - JAEN_CENTER.lng);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(JAEN_CENTER.lat)) *
      Math.cos(toRad(gps.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance <= MAX_DISTANCE_KM;
};

// 🔥 Helper for flexible matching
const matchLabels = (labels, allowedLabels) => {
  return labels.filter(label =>
    allowedLabels.some(rule => label.includes(rule))
  );
};
// 🔥 Normalize EXIF timestamp (fix timezone issue)
const PHT_OFFSET_SECONDS = 8 * 60 * 60; // UTC+8

const parseExifTimestamp = (raw) => {
  if (!raw) return null;

  // exif-parser often gives a numeric timestamp here
  if (typeof raw === "number") {
    return raw - PHT_OFFSET_SECONDS;
  }

  // fallback for string EXIF dates like "2026:04:17 09:48:00"
  if (typeof raw === "string") {
    const normalized = raw
      .trim()
      .replace(/^(\d{4}):(\d{2}):(\d{2})\s/, "$1-$2-$3T");

    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) {
      return Math.floor(date.getTime() / 1000) - PHT_OFFSET_SECONDS;
    }
  }

  return null;
};

// 🔥 Extract metadata
const extractImageMetadata = (buffer) => {
  try {
    const parser = exif.create(buffer);
    const result = parser.parse();
    const tags = result.tags || {};

    const rawTimestamp =
      tags.DateTimeOriginal ||
      tags.CreateDate ||
      tags.ModifyDate ||
      null;

    // 🔥 FIXED TIMESTAMP
    const timestamp = parseExifTimestamp(rawTimestamp);

    return {
      timestamp,
      gps: tags.GPSLatitude && tags.GPSLongitude
        ? {
            lat: tags.GPSLatitude,
            lng: tags.GPSLongitude
          }
        : null,
      device: tags.Model || null,
      width: result.imageSize?.width || null,
      height: result.imageSize?.height || null,
    };
  } catch (err) {
    console.error("Metadata parse error:", err.message);
    return null;
  }
};

const verifyIncidentImage = async (imageBuffer, incidentType) => {
  try {
    if (!imageBuffer) {
      return {
        status: "pending",
        confidence: 0,
        labels: [],
        matchedLabels: [],
        isMatch: false,
        metadata: null,
        metadataFlags: null
      };
    }

    const buffer = imageBuffer;

    // 2. Extract metadata
    const metadata = extractImageMetadata(buffer);

    // 3. AWS Rekognition
    const command = new DetectLabelsCommand({
      Image: { Bytes: buffer },
      MaxLabels: 10,
      MinConfidence: 70,
    });

    const result = await rekognition.send(command);

    const labels = result.Labels.map(l => l.Name.toLowerCase());

    // 4. Match labels
    const allowedLabels = INCIDENT_RULES[incidentType] || [];
    const matchedLabels = matchLabels(labels, allowedLabels);
    const isMatch = matchedLabels.length > 0;

    // 5. Smarter confidence (weighted by match relevance)
    let confidence = 0;

    if (result.Labels.length > 0) {
      const total = result.Labels.reduce((sum, l) => sum + l.Confidence, 0);
      confidence = total / result.Labels.length;
    }

    // 🔥 Boost confidence if matched labels exist
    if (matchedLabels.length > 0) {
      confidence += 10;
    }

    if (confidence > 100) confidence = 100;

    // 6. Metadata validation
    let metadataFlags = {
        hasLocation: !!metadata?.gps,
        isWithinArea: isWithinJaen(metadata?.gps),
        isRecent: false,
        isSuspicious: false
        };

        // 🔹 Recency check
        if (metadata?.timestamp) {
            const imageTime = new Date(metadata.timestamp * 1000);
            const now = new Date();

            const diffHours = (now - imageTime) / (1000 * 60 * 60);
            console.log("Image timestamp:", imageTime);
            console.log("Current time:", now);
            console.log("Difference in hours:", diffHours);

            // ✅ Accept slight future drift (camera clock issues)
            metadataFlags.isRecent = diffHours <= 24 && diffHours >= -10;
        }

    // 🚨 Suspicion rules
    if (!metadata?.gps && incidentType !== "accident") {
      metadataFlags.isSuspicious = true;
    }

    // 7. FINAL DECISION LOGIC
    let status = "pending";

    // ❌ RULE 1: No label match = AUTO REJECT
    if (!isMatch) {
    status = "rejected";
    }

    // ⚠️ RULE 2: Missing BOTH GPS + timestamp → weak evidence
    else if (!metadata?.gps && !metadata?.timestamp) {
    status = confidence > 85 ? "pending" : "rejected";
    }

    // ⚠️ RULE 3: Outside Jaen OR not recent → suspicious
    else if (!metadataFlags.isWithinArea || !metadataFlags.isRecent) {
    status = "rejected";
    }

    // ✅ RULE 4: Strong match + good metadata
    else if (confidence >= 85 && matchedLabels.length >= 1) {
    status = "approved";
    }

    // ⚠️ RULE 5: Weak match
    else {
    status = "pending";
    }

    // 🔍 Debug logs
    console.log("=== VERIFICATION DEBUG ===");
    console.log("Incident Type:", incidentType);
    console.log("Labels:", labels);
    console.log("Matched:", matchedLabels);
    console.log("Confidence:", confidence);
    console.log("Metadata:", metadata);
    console.log("Flags:", metadataFlags);
    console.log("Final Status:", status);
    console.log("---- DECISION FACTORS ----");
    console.log("Has GPS:", metadataFlags.hasLocation);
    console.log("Within Jaen:", metadataFlags.isWithinArea);
    console.log("Is Recent:", metadataFlags.isRecent);
    console.log("Timestamp:", metadata.timestamp);
    console.log("Matched Count:", matchedLabels.length);
    console.log("==========================");

    return {
      status,
      confidence: Math.round(confidence * 100) / 100,
      labels,
      matchedLabels,
      isMatch,
      metadata,
      metadataFlags
    };

  } catch (err) {
    console.error("Verification error:", err.message);

    return {
      status: "pending",
      confidence: 0,
      labels: [],
      matchedLabels: [],
      isMatch: false,
      metadata: null,
      metadataFlags: null,
      error: "Verification failed"
    };
  }
};

module.exports = { verifyIncidentImage };