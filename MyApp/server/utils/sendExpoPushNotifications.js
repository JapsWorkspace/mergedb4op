const fetch = require("node-fetch");

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_TOKEN_PATTERN = /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/;
const PUSH_CHUNK_SIZE = 100;

const PUSH_SOUND_CONFIG = {
  danger: {
    sound: "dangernotification.mp3",
    channelId: "danger-alerts",
  },
  notification: {
    sound: "smsnotification.wav",
    channelId: "normal-notifications-v2",
  },
  normal: {
    sound: "smsnotification.wav",
    channelId: "normal-notifications-v2",
  },
  sms: {
    sound: "smsnotification.wav",
    channelId: "sms-notifications",
  },
};

function normalizePushToken(value) {
  const token = String(value || "").trim();
  return EXPO_TOKEN_PATTERN.test(token) ? token : "";
}

function chunk(items, size = PUSH_CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getUserPushTokens(user) {
  return (Array.isArray(user?.notificationTokens) ? user.notificationTokens : [])
    .map((item) => normalizePushToken(item?.token || item))
    .filter(Boolean);
}

function getPushSoundConfig(soundType = "notification") {
  const normalized = String(soundType || "notification").trim().toLowerCase();
  return PUSH_SOUND_CONFIG[normalized] || PUSH_SOUND_CONFIG.notification;
}

async function sendExpoPushNotifications(users = [], payload = {}) {
  const uniqueTokens = [
    ...new Set((Array.isArray(users) ? users : []).flatMap(getUserPushTokens)),
  ];

  if (!uniqueTokens.length) {
    return { ok: true, sent: 0, skipped: true, reason: "no_tokens" };
  }

  const soundConfig = getPushSoundConfig(payload.soundType || payload.data?.soundType);

  const messages = uniqueTokens.map((to) => ({
    to,
    sound: payload.sound || soundConfig.sound,
    title: String(payload.title || "SagipBayan").slice(0, 120),
    body: String(payload.body || payload.message || "You have a new update.").slice(0, 240),
    data: {
      ...(payload.data || {}),
      soundType: payload.soundType || payload.data?.soundType || "notification",
    },
    priority: payload.priority === "high" ? "high" : "default",
    channelId: payload.channelId || soundConfig.channelId,
  }));

  const results = [];

  for (const messageChunk of chunk(messages)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageChunk),
      });

      const data = await response.json().catch(() => ({}));
      results.push({ status: response.status, data });

      if (!response.ok) {
        console.error("[expo push] send failed", { status: response.status, data });
      }
    } catch (err) {
      console.error("[expo push] request failed", { message: err?.message || String(err) });
      results.push({ status: 0, error: err?.message || String(err) });
    }
  }

  return {
    ok: results.every((item) => item.status >= 200 && item.status < 300),
    sent: messages.length,
    chunks: results.length,
    results,
  };
}

module.exports = {
  getUserPushTokens,
  getPushSoundConfig,
  normalizePushToken,
  sendExpoPushNotifications,
};
