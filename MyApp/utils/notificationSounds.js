import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

let normalSound = null;
let dangerSound = null;
let smsSound = null;
let lastPlayedAt = 0;

const MIN_SOUND_GAP_MS = 1200;
const NOTIFICATION_SOUND_SETTINGS_KEY = "notificationSoundSettings";
const DEFAULT_NOTIFICATION_SOUND_SETTINGS = {
  normalNotificationSound: true,
  dangerNotificationSound: true,
  smsNotificationSound: true,
};

export const NOTIFICATION_CHANNELS = {
  normal: "normal-notifications-v2",
  danger: "danger-alerts",
  sms: "sms-notifications",
};

export const NOTIFICATION_SOUND_FILES = {
  normal: "smsnotification.wav",
  danger: "dangernotification.mp3",
  sms: "smsnotification.wav",
};

export async function getNotificationSoundSettings() {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_SOUND_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    return {
      ...DEFAULT_NOTIFICATION_SOUND_SETTINGS,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
    };
  } catch (err) {
    console.log("[notification sound] settings read failed:", err?.message);
    return DEFAULT_NOTIFICATION_SOUND_SETTINGS;
  }
}

export async function updateNotificationSoundSettings(nextSettings = {}) {
  const currentSettings = await getNotificationSoundSettings();
  const updatedSettings = {
    ...currentSettings,
    ...nextSettings,
  };

  await AsyncStorage.setItem(
    NOTIFICATION_SOUND_SETTINGS_KEY,
    JSON.stringify(updatedSettings)
  );

  return updatedSettings;
}

async function getAudio() {
  const module = await import("expo-av");
  return module.Audio;
}

async function configureAudioMode() {
  try {
    const Audio = await getAudio();
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  } catch (err) {
    console.log("[notification sound] audio mode failed:", err?.message);
  }
}

async function loadSound(kind) {
  const Audio = await getAudio();

  if (kind === "danger") {
    if (!dangerSound) {
      const loaded = await Audio.Sound.createAsync(
        require("../Notification/dangernotification.mp3")
      );
      dangerSound = loaded.sound;
    }
    return dangerSound;
  }

  if (kind === "sms") {
    if (!smsSound) {
      const loaded = await Audio.Sound.createAsync(
        require("../Notification/smsnotification.wav")
      );
      smsSound = loaded.sound;
    }
    return smsSound;
  }

  if (!normalSound) {
    const loaded = await Audio.Sound.createAsync(
      require("../Notification/smsnotification.wav")
    );
    normalSound = loaded.sound;
  }
  return normalSound;
}

async function playSound(kind) {
  try {
    const settings = await getNotificationSoundSettings();
    const isDanger = kind === "danger";
    const isSms = kind === "sms";

    if (isDanger && !settings.dangerNotificationSound) {
      console.log("[notification sound] skipped danger sound: disabled");
      return;
    }

    if (isSms && !settings.smsNotificationSound) {
      console.log("[notification sound] skipped sms sound: disabled");
      return;
    }

    if (!isDanger && !isSms && !settings.normalNotificationSound) {
      console.log("[notification sound] skipped normal sound: disabled");
      return;
    }

    const now = Date.now();
    if (now - lastPlayedAt < MIN_SOUND_GAP_MS) return;
    lastPlayedAt = now;

    await configureAudioMode();
    const sound = await loadSound(kind);
    await sound.stopAsync().catch(() => {});
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (err) {
    console.log("[notification sound] play failed:", err?.message);
  }
}

export function playNormalNotificationSound() {
  return playSound("normal");
}

export function playDangerNotificationSound() {
  return playSound("danger");
}

export function playSmsNotificationSound() {
  return playSound("sms");
}

export async function stopNotificationSound() {
  await Promise.all([
    normalSound?.stopAsync?.().catch(() => {}),
    dangerSound?.stopAsync?.().catch(() => {}),
    smsSound?.stopAsync?.().catch(() => {}),
  ]);
}

export async function unloadNotificationSounds() {
  await Promise.all([
    normalSound?.unloadAsync?.().catch(() => {}),
    dangerSound?.unloadAsync?.().catch(() => {}),
    smsSound?.unloadAsync?.().catch(() => {}),
  ]);
  normalSound = null;
  dangerSound = null;
  smsSound = null;
}

export async function setupNotificationChannels() {
  try {
    if (Platform.OS !== "android") return false;

    const importance = Notifications.AndroidImportance?.MAX ?? 5;

    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.normal, {
      name: "SagipBayan Notifications",
      importance,
      sound: NOTIFICATION_SOUND_FILES.normal,
      vibrationPattern: [0, 180, 120, 220],
      lightColor: "#14532D",
    });

    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.danger, {
      name: "SagipBayan Danger Alerts",
      importance,
      sound: NOTIFICATION_SOUND_FILES.danger,
      vibrationPattern: [0, 800, 250, 800],
      lightColor: "#DC2626",
    });

    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.sms, {
      name: "SagipBayan SMS Alerts",
      importance,
      sound: NOTIFICATION_SOUND_FILES.sms,
      vibrationPattern: [0, 180, 120, 260],
      lightColor: "#2563EB",
    });

    await Notifications.setNotificationChannelAsync("default", {
      name: "SagipBayan Alerts",
      importance,
      sound: NOTIFICATION_SOUND_FILES.normal,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#14532D",
    });

    return true;
  } catch (err) {
    console.log("[notification channel] setup failed:", err?.message);
    return false;
  }
}
