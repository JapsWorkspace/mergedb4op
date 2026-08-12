const Audit = require("../models/Audit");
const { buildAuditEventPayload } = require("./auditEventUtils");

const createAuditEvent = async (payload, options = {}) => {
  try {
    const items = Array.isArray(payload) ? payload : [payload];
    const docs = items
      .map((item) => buildAuditEventPayload(item || {}))
      .filter((item) => item && item.title && item.message);

    if (docs.length === 0) {
      return Array.isArray(payload) ? [] : null;
    }

    const created = await Audit.create(docs, options);
    return Array.isArray(payload) ? created : created[0] || null;
  } catch (err) {
    console.error("Create Audit Event Error:", err);
    return Array.isArray(payload) ? [] : null;
  }
};

module.exports = createAuditEvent;
