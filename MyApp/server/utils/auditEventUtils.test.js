const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAuditEventFromNotification,
  buildAuditEventPayload,
  mapAuditDocToEvent,
} = require("./auditEventUtils");

test("buildAuditEventFromNotification maps notification payload into a persistent audit event", () => {
  const auditEvent = buildAuditEventFromNotification({
    module: "relief",
    type: "relief_goods_released",
    priority: "high",
    title: "Relief release prepared",
    message: "DRRMO released support for request RR-2026-0001.",
    senderUser: "user-1",
    senderRole: "drrmo",
    senderName: "drrmo3",
    recipientRole: "barangay",
    recipientBarangay: "barangay-1",
    recipientBarangayName: "Santo Tomas",
    referenceId: "release-1",
    referenceModel: "ReliefRelease",
    createdAt: new Date("2026-05-06T01:00:00.000Z"),
    metadata: {
      requestNo: "RR-2026-0001",
      releaseNo: "RL-2026-0003",
      disaster: "Flood",
      requestStatus: "released",
      foodPacksReleased: 120,
    },
  });

  assert.equal(auditEvent.module, "relief");
  assert.equal(auditEvent.type, "relief_goods_released");
  assert.equal(auditEvent.actorRole, "drrmo");
  assert.equal(auditEvent.actorName, "drrmo3");
  assert.equal(auditEvent.barangayName, "Santo Tomas");
  assert.equal(auditEvent.requestNo, "RR-2026-0001");
  assert.equal(auditEvent.releaseNo, "RL-2026-0003");
  assert.equal(auditEvent.status, "released");
});

test("buildAuditEventPayload keeps legacy audit entries readable in the new format", () => {
  const auditEvent = buildAuditEventPayload({
    category: "relief_request",
    peopleRange: "120 food pack(s)",
    status: "approved",
    actionBy: "drrmo",
    barangayName: "San Jose",
    actionAt: new Date("2026-05-06T02:00:00.000Z"),
  });

  assert.equal(auditEvent.module, "relief");
  assert.equal(auditEvent.actorRole, "drrmo");
  assert.equal(auditEvent.barangayName, "San Jose");
  assert.equal(auditEvent.message, "120 food pack(s)");
});

test("mapAuditDocToEvent produces the admin timeline event shape", () => {
  const mapped = mapAuditDocToEvent({
    _id: "audit-1",
    module: "relief",
    type: "relief_request_received",
    priority: "normal",
    title: "Relief request marked received",
    message: "Barangay marked request RR-2026-0002 as received.",
    actorName: "Barangay 1",
    actorRole: "barangay",
    barangayName: "Barangay 1",
    requestNo: "RR-2026-0002",
    referenceModel: "ReliefRequest",
    createdAt: new Date("2026-05-06T03:00:00.000Z"),
  });

  assert.equal(mapped._id, "audit-1");
  assert.equal(mapped.moduleLabel, "Relief");
  assert.equal(mapped.actorRoleLabel, "Barangay");
  assert.equal(mapped.requestNo, "RR-2026-0002");
  assert.equal(mapped.source, "audit");
});
