const { trimSmsMessage } = require("./sendUniSms");

function sanitizeBlock(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function summarizeForSms(value, max = 55) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "";
  if (clean.length <= max) return clean;

  return clean.slice(0, Math.max(0, max - 3)).trimEnd() + "...";
}

function getBarangayLabel(value) {
  const text = String(value || "").trim();
  if (!text) return "Brgy. your area";
  return text.toLowerCase().startsWith("brgy") ? text : `Brgy. ${text}`;
}

function getIncidentLocationLabel(incident) {
  return (
    incident?.landmark ||
    incident?.streetAddress ||
    incident?.street ||
    incident?.location ||
    incident?.address ||
    incident?.barangay ||
    "your area"
  );
}

function shortenLocation(value, max = 32) {
  const clean = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, Math.max(0, max - 3)).trimEnd() + "...";
}

function formatDate(value = new Date()) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleString("en-PH");
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(message) {
  const paragraphs = String(message || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return [
    '<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.55">',
    paragraphs || "<p>SagipBayan notification</p>",
    "</div>",
  ].join("");
}

function buildAnnouncementSms({ title, description, category }) {
  const cat = String(category || "Announcement").trim();
  const shortTitle = summarizeForSms(title, 40);
  const shortDesc = summarizeForSms(description, 70);

  const fallback =
    cat.toLowerCase() === "weather"
      ? "Stay alert and monitor MDRRMO updates."
      : cat.toLowerCase() === "emergency"
      ? "Please read and follow MDRRMO instructions."
      : "Open the app for details.";

  const details = [shortTitle, shortDesc || fallback].filter(Boolean).join(". ");
  const message = `This is a sample message: ${details}`;

  return trimSmsMessage(message, 150);
}

function buildGuidelineSms({ title, description, body, content, category }) {
  const cat = String(category || "Safety").trim();
  const shortTitle = summarizeForSms(title, 40);
  const shortDesc = summarizeForSms(description || body || content, 70);

  let fallback = "Review and stay prepared.";

  if (cat.toLowerCase() === "flood") {
    fallback = "Avoid floodwater and prepare emergency supplies.";
  } else if (cat.toLowerCase() === "earthquake") {
    fallback = "Prepare your emergency kit and know safe spots.";
  } else if (cat.toLowerCase() === "typhoon") {
    fallback = "Secure your home and monitor weather updates.";
  }

  const details = [shortTitle, shortDesc || fallback].filter(Boolean).join(". ");
  const message = `This is a sample message: ${details}`;

  return trimSmsMessage(message, 150);
}

function buildAnnouncementEmail(announcement = {}) {
  const category = String(announcement.category || "General").trim();
  const title = String(announcement.title || "MDRRMO Announcement").trim();
  const description = sanitizeBlock(announcement.description || announcement.message);
  const datePosted = formatDate(
    announcement.publishedNotificationSentAt ||
      announcement.publishedAt ||
      announcement.updatedAt ||
      announcement.createdAt
  );
  const subject = `SagipBayan ${category} Announcement: ${title}`;
  const message = [
    "Dear Resident,",
    "",
    `The MDRRMO has posted a new ${category} announcement through SagipBayan.`,
    "",
    "Title:",
    title,
    "",
    "Description:",
    description || "Please open the SagipBayan app for the full announcement.",
    "",
    "Date Posted:",
    datePosted,
    "",
    "Please read the announcement carefully and follow official MDRRMO instructions.",
    "",
    "This is an automated notification from SagipBayan.",
  ].join("\n");

  return { subject, message, html: textToHtml(message) };
}

function buildGuidelineEmail(guideline = {}) {
  const category = String(guideline.category || "General").trim();
  const title = String(guideline.title || "MDRRMO Safety Guideline").trim();
  const description = sanitizeBlock(
    guideline.description || guideline.body || guideline.content || guideline.message
  );
  const datePosted = formatDate(
    guideline.publishedNotificationSentAt ||
      guideline.publishedAt ||
      guideline.updatedAt ||
      guideline.createdAt
  );
  const subject = `SagipBayan ${category} Guideline: ${title}`;
  const message = [
    "Dear Resident,",
    "",
    `The MDRRMO has posted a new ${category} safety guideline through SagipBayan.`,
    "",
    "Title:",
    title,
    "",
    "Guideline:",
    description || "Please open the SagipBayan app for the full guideline.",
    "",
    "Date Posted:",
    datePosted,
    "",
    "Please review this guideline carefully to stay informed and prepared.",
    "",
    "This is an automated notification from SagipBayan.",
  ].join("\n");

  return { subject, message, html: textToHtml(message) };
}

function buildIncidentSmsMessage(incident) {
  const type = String(incident?.type || incident?.category || "incident").toLowerCase();
  const barangay = getBarangayLabel(incident?.barangay || "your area");
  const location = shortenLocation(getIncidentLocationLabel(incident), 32);

  if (type.includes("flood")) {
    return trimSmsMessage(
      `This is a sample message: Flood alert in ${barangay}, around ${location}. Avoid flooded roads.`,
      150
    );
  }

  if (type.includes("fire")) {
    return trimSmsMessage(
      `This is a sample message: Fire reported in ${barangay}, around ${location}. Avoid the area.`,
      150
    );
  }

  if (type.includes("earthquake")) {
    return trimSmsMessage(
      `This is a sample message: Earthquake alert in ${barangay}, around ${location}. Check surroundings.`,
      150
    );
  }

  if (type.includes("typhoon")) {
    return trimSmsMessage(
      `This is a sample message: Typhoon alert in ${barangay}. Stay indoors and monitor updates.`,
      150
    );
  }

  if (type.includes("landslide")) {
    return trimSmsMessage(
      `This is a sample message: Landslide risk in ${barangay}, around ${location}. Avoid the area.`,
      150
    );
  }

  return trimSmsMessage(
    `This is a sample message: Incident in ${barangay}, around ${location}. Stay alert.`,
    150
  );
}

function buildIncidentEmail(incident = {}) {
  const incidentType = String(incident.type || incident.category || "Incident").trim();
  const barangay = String(incident.barangay || "your barangay").trim();
  const level = String(incident.level || incident.severity || "").trim();
  const location = String(getIncidentLocationLabel(incident) || "Not specified").trim();
  const description = sanitizeBlock(incident.description || incident.details);
  const subject = `SagipBayan Alert: ${incidentType} in Barangay ${barangay}`;
  const message = [
    "Dear Resident,",
    "",
    "A verified incident has been reported in your barangay.",
    "",
    "Incident Type:",
    incidentType,
    "",
    "Severity/Level:",
    level || "Not specified",
    "",
    "Barangay:",
    barangay,
    "",
    "Location / Landmark:",
    location,
    "",
    "Report Details:",
    description || "No additional report details were provided.",
    "",
    "Status:",
    "Verified by MDRRMO",
    "",
    "Please stay alert, avoid affected areas, and follow official MDRRMO instructions.",
    "",
    "This is an automated notification from SagipBayan.",
  ].join("\n");

  return { subject, message, html: textToHtml(message) };
}

function buildClusterSmsMessage({ type, barangay, landmark }) {
  const incidentType = String(type || "incident").toLowerCase();
  const barangayLabel = getBarangayLabel(barangay || "your area");
  const location = shortenLocation(landmark || "nearby areas", 32);

  if (incidentType.includes("flood")) {
    return trimSmsMessage(
      `This is a sample message: Multiple flood reports near ${barangayLabel}, around ${location}. Avoid flooded roads.`,
      150
    );
  }

  if (incidentType.includes("fire")) {
    return trimSmsMessage(
      `This is a sample message: Multiple fire reports near ${barangayLabel}, around ${location}. Avoid the area.`,
      150
    );
  }

  return trimSmsMessage(
    `This is a sample message: Multiple ${incidentType} reports near ${barangayLabel}, around ${location}. Stay alert.`,
    150
  );
}

function buildClusterEmail({ type, barangay, barangays, locations, landmark, count }) {
  const incidentType = String(type || "Incident").trim();
  const area =
    Array.isArray(barangays) && barangays.length
      ? barangays.filter(Boolean).join(", ")
      : String(barangay || "your area").trim();
  const knownLocations =
    Array.isArray(locations) && locations.length
      ? locations.filter(Boolean).join("\n")
      : String(landmark || "Nearby areas").trim();
  const subject = `SagipBayan Alert: Multiple ${incidentType} Reports Detected`;
  const message = [
    "Dear Resident,",
    "",
    "SagipBayan has detected multiple reports of the same incident type in your area or nearby barangays.",
    "",
    "Incident Type:",
    incidentType,
    "",
    "Affected Area:",
    area || "Nearby barangays",
    "",
    "Known Location/s:",
    knownLocations || "Nearby areas",
    "",
    "Number of Reports:",
    String(count || "Multiple"),
    "",
    "Please stay alert, avoid affected areas, and follow official MDRRMO instructions.",
    "",
    "This is an automated notification from SagipBayan.",
  ].join("\n");

  return { subject, message, html: textToHtml(message) };
}

module.exports = {
  summarizeForSms,
  buildAnnouncementSms,
  buildGuidelineSms,
  buildAnnouncementEmail,
  buildGuidelineEmail,
  buildIncidentSmsMessage,
  buildIncidentEmail,
  buildClusterSmsMessage,
  buildClusterEmail,
  getIncidentLocationLabel,
  getBarangayLabel,
  shortenLocation,
};
