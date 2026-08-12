const mongoose = require("mongoose");

const UserModel = require("../models/User");
const ConnectionModel = require("../models/Connection");
const { sendExpoPushNotifications } = require("../utils/sendExpoPushNotifications");

function normalizeConnectionCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function idsMatch(a, b) {
  if (!a || !b) return false;
  return String(a) === String(b);
}

function hasMember(list, userId) {
  return Array.isArray(list) && list.some((id) => idsMatch(id, userId));
}

async function addNotification(userId, notification) {
  if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) return;

  await UserModel.findByIdAndUpdate(userId, {
    $push: {
      notifications: {
        type: notification.type,
        message: notification.message,
        notificationType: notification.notificationType || "normal",
        soundType: notification.soundType || "notification",
        incidentId: notification.incidentId || null,
        targetBarangays: Array.isArray(notification.targetBarangays)
          ? notification.targetBarangays
          : [],
        targetUsers: Array.isArray(notification.targetUsers)
          ? notification.targetUsers
          : [],
        connectionId: notification.connectionId || null,
        actorUserId: notification.actorUserId || null,
        actorName: notification.actorName || "",
        actorUsername: notification.actorUsername || "",
        actorAvatar: notification.actorAvatar || "",
        connectionCode: notification.connectionCode || "",
        actionable: Boolean(notification.actionable),
        handledAt: notification.handledAt || null,
        read: false,
        createdAt: new Date(),
      },
    },
  });
}

/**
 * Sends safety notifications to ALL OTHER MEMBERS in every connection
 * where the current user belongs.
 *
 * Example:
 * Connection ABC123 has A, B, C.
 * If A marks SAFE:
 * - B gets notification
 * - C gets notification
 * - A does not get duplicate self notification
 */
async function notifyConnectionMembersSafetyUpdate(user, status, message = "") {
  if (!user?._id) return;

  const connections = await ConnectionModel.find({
    members: user._id,
  }).select("_id code creator members");

  if (!connections.length) return;

  const actorName =
    [user.fname, user.lname].filter(Boolean).join(" ").trim() ||
    user.username ||
    "A member";

  const isSafe = status === "SAFE";
  const notificationType = isSafe ? "safety_safe" : "safety_not_safe";

  const baseMessage = isSafe
    ? `${actorName} marked themselves as safe.`
    : `${actorName} marked themselves as not safe and may need help.`;

  const cleanMessage = String(message || "").trim();

  const notificationMessage = cleanMessage
    ? `${baseMessage} Message: ${cleanMessage}`
    : baseMessage;

  const jobs = [];
  const recipientIds = new Set();

  connections.forEach((connection) => {
    const members = Array.isArray(connection.members) ? connection.members : [];

    members.forEach((memberId) => {
      if (!memberId) return;

      // Do not notify the same user who marked their own status.
      if (idsMatch(memberId, user._id)) return;

      recipientIds.add(String(memberId));
      jobs.push(
        addNotification(memberId, {
          type: notificationType,
          message: notificationMessage,
          connectionId: connection._id,
          actorUserId: user._id,
          actorName,
          actorUsername: user.username || "",
          actorAvatar: user.avatar || "",
          connectionCode: connection.code || "",
          actionable: false,
        })
      );
    });
  });

  await Promise.all(jobs);

  const recipients = await UserModel.find({
    _id: { $in: [...recipientIds] },
    "notificationTokens.0": { $exists: true },
  })
    .select("_id notificationTokens")
    .lean();

  await sendExpoPushNotifications(recipients, {
    title: isSafe ? "Safety update" : "Safety alert",
    body: notificationMessage,
    soundType: isSafe ? "notification" : "danger",
    priority: isSafe ? "default" : "high",
    data: {
      type: notificationType,
      soundType: isSafe ? "notification" : "danger",
      actorUserId: String(user._id),
    },
  });
}

async function resolveNotificationActionTarget(connectionId, userId) {
  const connection = await ConnectionModel.findById(connectionId);
  if (!connection) {
    return { error: { status: 404, message: "Connection not found" } };
  }

  if (!idsMatch(connection.creator, userId)) {
    return { error: { status: 403, message: "Not authorized" } };
  }

  return { connection };
}

async function markOwnerRequestHandled(ownerId, connectionId, memberId) {
  await UserModel.findByIdAndUpdate(
    ownerId,
    {
      $set: {
        "notifications.$[notif].handledAt": new Date(),
        "notifications.$[notif].actionable": false,
        "notifications.$[notif].read": true,
      },
    },
    {
      arrayFilters: [
        {
          "notif.type": "CONNECTION_REQUEST",
          "notif.connectionId": new mongoose.Types.ObjectId(connectionId),
          "notif.actorUserId": new mongoose.Types.ObjectId(memberId),
          "notif.handledAt": null,
        },
      ],
    }
  );
}

async function ensureUserExists(userId) {
  if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) return null;
  return UserModel.findById(userId);
}

function generateConnectionCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}

const markSafe = async (req, res) => {
  try {
    const userId = req.params.id;
    const { message = "" } = req.body || {};

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        safetyStatus: "SAFE",
        safetyMessage: message,
        safetyUpdatedAt: new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await notifyConnectionMembersSafetyUpdate(user, "SAFE", message);

    return res.json({
      message: "Safety status updated",
      safetyStatus: user.safetyStatus,
      safetyMessage: user.safetyMessage,
      safetyUpdatedAt: user.safetyUpdatedAt,
    });
  } catch (err) {
    console.error("Mark safe error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const markNotSafe = async (req, res) => {
  try {
    const userId = req.params.id;
    const { message = "" } = req.body || {};

    const user = await UserModel.findByIdAndUpdate(
      userId,
      {
        safetyStatus: "NOT_SAFE",
        safetyMessage: message,
        safetyUpdatedAt: new Date(),
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await notifyConnectionMembersSafetyUpdate(user, "NOT_SAFE", message);

    return res.json({
      message: "Safety status updated",
      safetyStatus: user.safetyStatus,
      safetyMessage: user.safetyMessage,
      safetyUpdatedAt: user.safetyUpdatedAt,
    });
  } catch (err) {
    console.error("Mark not safe error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const createConnection = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await ensureUserExists(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let code;
    let exists = true;

    while (exists) {
      code = generateConnectionCode();
      const check = await ConnectionModel.findOne({ code });
      exists = Boolean(check);
    }

    const connection = await ConnectionModel.create({
      code,
      creator: userId,
      members: [userId],
      pendingMembers: [],
    });

    await UserModel.findByIdAndUpdate(userId, {
      $addToSet: { connections: connection._id },
    });

    return res.json({
      message: "Connection created successfully.",
      code,
      connectionId: connection._id,
    });
  } catch (err) {
    console.error("Create connection error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const joinConnection = async (req, res) => {
  try {
    const userId = req.params.id;
    const code = normalizeConnectionCode(req.body?.code);
    const requester = await ensureUserExists(userId);

    if (!requester) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!code) {
      return res.status(400).json({ message: "Connection code is required" });
    }

    const connection = await ConnectionModel.findOne({ code });
    if (!connection) {
      return res.status(404).json({ message: "Invalid or expired connection code." });
    }

    if (!connection.creator) {
      return res.status(400).json({ message: "This connection has no owner." });
    }

    if (idsMatch(connection.creator, userId)) {
      return res.status(400).json({ message: "You cannot join your own connection." });
    }

    if (hasMember(connection.members, userId)) {
      return res.status(400).json({ message: "You are already a member of this connection." });
    }

    if (hasMember(connection.pendingMembers, userId)) {
      return res.status(400).json({ message: "Your join request is already pending approval." });
    }

    if (connection.members.length >= 5) {
      return res.status(400).json({
        message: "This connection already has the maximum of 5 members.",
      });
    }

    connection.pendingMembers.push(requester._id);
    await connection.save();

    const requesterName =
      [requester.fname, requester.lname].filter(Boolean).join(" ").trim() ||
      requester.username ||
      "Someone";

    await addNotification(connection.creator, {
      type: "CONNECTION_REQUEST",
      message: `${requesterName} requested to join your connection.`,
      connectionId: connection._id,
      actorUserId: requester._id,
      actorName: requesterName,
      actorUsername: requester.username || "",
      actorAvatar: requester.avatar || "",
      connectionCode: connection.code,
      actionable: true,
    });

    await addNotification(requester._id, {
      type: "CONNECTION_REQUEST_SENT",
      message: `Your request to join connection ${connection.code} was sent.`,
      connectionId: connection._id,
      connectionCode: connection.code,
    });

    return res.json({
      message: "Request sent. Waiting for creator approval.",
      connectionId: connection._id,
      code: connection.code,
    });
  } catch (err) {
    console.error("Join connection error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const getConnectionMembers = async (req, res) => {
  try {
    const connectionId = req.params.id;

    const connection = await ConnectionModel.findById(connectionId).populate(
      "members",
      "fname lname username avatar location shareSafetyLocation safetyStatus safetyMessage safetyUpdatedAt"
    );

    if (!connection) {
      return res.status(404).json({ message: "Connection not found" });
    }

    return res.json(connection.members);
  } catch (err) {
    console.error("Get members error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const getUserConnections = async (req, res) => {
  try {
    const userId = req.params.id;

    const connections = await ConnectionModel.find({
      $or: [{ members: userId }, { creator: userId }],
    })
      .populate("creator", "fname lname username avatar")
      .populate(
        "members",
        "fname lname username avatar location shareSafetyLocation safetyStatus safetyMessage safetyUpdatedAt"
      )
      .populate("pendingMembers", "fname lname username avatar");

    return res.json(connections);
  } catch (err) {
    console.error("Get user connections error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const leaveConnection = async (req, res) => {
  try {
    const { userId, connectionId } = req.params;

    const connection = await ConnectionModel.findById(connectionId);
    if (!connection) {
      return res.status(404).json({ message: "Connection not found" });
    }

    if (idsMatch(connection.creator, userId)) {
      return res.status(400).json({
        message: "Creator cannot leave their own connection",
      });
    }

    const leavingUser = await UserModel.findById(userId).select(
      "fname lname username avatar"
    );

    const leavingName =
      [leavingUser?.fname, leavingUser?.lname].filter(Boolean).join(" ").trim() ||
      leavingUser?.username ||
      "A member";

    const remainingMemberIds = Array.isArray(connection.members)
      ? connection.members.filter(
          (id) => !idsMatch(id, userId) && !idsMatch(id, connection.creator)
        )
      : [];

    connection.members = connection.members.filter((id) => !idsMatch(id, userId));
    connection.pendingMembers = connection.pendingMembers.filter(
      (id) => !idsMatch(id, userId)
    );

    await connection.save();

    await UserModel.findByIdAndUpdate(userId, {
      $pull: { connections: connectionId },
    });

    const notifyTargets = [connection.creator, ...remainingMemberIds].filter(
      (id, index, arr) =>
        id && arr.findIndex((existingId) => idsMatch(existingId, id)) === index
    );

    await Promise.all(
      notifyTargets.map((targetUserId) =>
        addNotification(targetUserId, {
          type: "CONNECTION_LEFT",
          message: `${leavingName} left connection ${connection.code}.`,
          connectionId: connection._id,
          actorUserId: leavingUser?._id || null,
          actorName: leavingName,
          actorUsername: leavingUser?.username || "",
          actorAvatar: leavingUser?.avatar || "",
          connectionCode: connection.code,
          actionable: false,
        })
      )
    );

    return res.json({ message: "You have left the connection" });
  } catch (err) {
    console.error("Leave connection error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const deleteConnection = async (req, res) => {
  try {
    const { connectionId, userId } = req.params;

    const connection = await ConnectionModel.findById(connectionId);
    if (!connection) {
      return res.status(404).json({ message: "Connection not found" });
    }

    if (!idsMatch(connection.creator, userId)) {
      return res.status(403).json({
        message: "Only the creator can delete this connection",
      });
    }

    await ConnectionModel.findByIdAndDelete(connectionId);

    await UserModel.updateMany(
      { connections: connectionId },
      { $pull: { connections: connectionId } }
    );

    return res.json({ message: "Connection deleted successfully" });
  } catch (err) {
    console.error("Delete connection error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const approveMember = async (req, res) => {
  try {
    const { connectionId, memberId, userId } = req.params;

    const { connection, error } = await resolveNotificationActionTarget(
      connectionId,
      userId
    );

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    if (!hasMember(connection.pendingMembers, memberId)) {
      return res.status(400).json({ message: "This join request is no longer pending." });
    }

    if (hasMember(connection.members, memberId)) {
      connection.pendingMembers = connection.pendingMembers.filter(
        (id) => !idsMatch(id, memberId)
      );
      await connection.save();
      return res.json({ message: "Member is already part of this connection." });
    }

    if (connection.members.length >= 5) {
      return res.status(400).json({ message: "Connection already has 5 members." });
    }

    connection.pendingMembers = connection.pendingMembers.filter(
      (id) => !idsMatch(id, memberId)
    );
    connection.members.addToSet(memberId);

    await connection.save();

    await UserModel.findByIdAndUpdate(memberId, {
      $addToSet: { connections: connection._id },
    });

    await markOwnerRequestHandled(userId, connectionId, memberId);

    await addNotification(memberId, {
      type: "CONNECTION_APPROVED",
      message: `You have been accepted into connection ${connection.code}.`,
      connectionId: connection._id,
      connectionCode: connection.code,
    });

    return res.json({ message: "Member approved" });
  } catch (err) {
    console.error("Approve member error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const rejectMember = async (req, res) => {
  try {
    const { connectionId, memberId, userId } = req.params;

    const { connection, error } = await resolveNotificationActionTarget(
      connectionId,
      userId
    );

    if (error) {
      return res.status(error.status).json({ message: error.message });
    }

    if (!hasMember(connection.pendingMembers, memberId)) {
      return res.status(400).json({ message: "This join request is no longer pending." });
    }

    connection.pendingMembers = connection.pendingMembers.filter(
      (id) => !idsMatch(id, memberId)
    );

    await connection.save();
    await markOwnerRequestHandled(userId, connectionId, memberId);

    await addNotification(memberId, {
      type: "CONNECTION_REJECTED",
      message: `Your request to join connection ${connection.code} was rejected.`,
      connectionId: connection._id,
      connectionCode: connection.code,
    });

    return res.json({ message: "Member rejected" });
  } catch (err) {
    console.error("Reject member error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const kickMember = async (req, res) => {
  try {
    const { connectionId, memberId, userId } = req.params;

    const connection = await ConnectionModel.findById(connectionId);
    if (!connection) {
      return res.status(404).json({ message: "Connection not found" });
    }

    if (!idsMatch(connection.creator, userId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (idsMatch(connection.creator, memberId)) {
      return res.status(400).json({ message: "Creator cannot be kicked" });
    }

    connection.members = connection.members.filter((id) => !idsMatch(id, memberId));
    connection.pendingMembers = connection.pendingMembers.filter(
      (id) => !idsMatch(id, memberId)
    );

    await connection.save();

    await UserModel.findByIdAndUpdate(memberId, {
      $pull: { connections: connection._id },
    });

    await addNotification(memberId, {
      type: "CONNECTION_KICKED",
      message: "You were removed from a family connection.",
      connectionId: connection._id,
    });

    return res.json({ message: "Member has been removed from the connection" });
  } catch (err) {
    console.error("Kick member error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

const getConnectionById = async (req, res) => {
  try {
    const { connectionId } = req.params;

    const connection = await ConnectionModel.findById(connectionId)
      .populate("creator", "fname lname username avatar")
      .populate(
        "members",
        "fname lname username avatar location shareSafetyLocation safetyStatus safetyMessage safetyUpdatedAt"
      )
      .populate("pendingMembers", "fname lname username avatar");

    if (!connection) {
      return res.status(404).json({ message: "Connection not found" });
    }

    return res.json(connection);
  } catch (err) {
    console.error("Get connection by ID error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createConnection,
  joinConnection,
  getConnectionMembers,
  getUserConnections,
  getConnectionById,
  leaveConnection,
  markSafe,
  markNotSafe,
  approveMember,
  rejectMember,
  kickMember,
  deleteConnection,
};
