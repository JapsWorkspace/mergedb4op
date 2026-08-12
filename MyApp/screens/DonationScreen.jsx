import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getMyDonations,
  submitDonation as submitDonationApi,
} from "../lib/donationApi";
import { UserContext } from "./UserContext";
import { ThemeContext } from "./contexts/ThemeContext";
import useFormAutoScroll from "./hooks/useFormAutoScroll";
import {
  sanitizeAmount,
  sanitizeNumericReference,
} from "./utils/validation";

const OFFLINE_QUEUE_KEY = "sagip_bayan_donation_queue_v3";
const DUPLICATE_REFERENCE_CODE = "DUPLICATE_REFERENCE_NUMBER";
const DUPLICATE_REFERENCE_TITLE = "Reference Number Already Used";
const DUPLICATE_REFERENCE_MESSAGE =
  "This reference number has already been used. Please check your GCash receipt and enter a valid reference number.";

const STATUS_META = {
  pending: { label: "Pending", color: "#B45309", bg: "#FEF3C7" },
  accepted: { label: "Accepted", color: "#166534", bg: "#DCFCE7" },
  received: { label: "Received", color: "#166534", bg: "#DCFCE7" },
  not_received: { label: "Not Received", color: "#991B1B", bg: "#FEE2E2" },
  resubmitted: { label: "Resubmitted", color: "#1D4ED8", bg: "#DBEAFE" },
  in_transit: { label: "In Transit", color: "#1D4ED8", bg: "#DBEAFE" },
  delivered: { label: "Delivered", color: "#14532D", bg: "#BBF7D0" },
  rejected: { label: "Rejected", color: "#991B1B", bg: "#FEE2E2" },
};

const INITIAL_FORM = {
  donorName: "",
  donorPhone: "",
  donorEmail: "",
  amount: "",
  gcashReferenceNumber: "",
  description: "",
};

function getUserDisplayName(user) {
  return (
    user?.fullName ||
    user?.name ||
    user?.username ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    ""
  );
}

function getUserPhone(user) {
  return user?.phone || user?.contactNumber || user?.mobileNumber || "";
}

function getUserEmail(user) {
  return user?.email || "";
}

function isDuplicateReferenceError(error) {
  return Boolean(
    error?.response?.status === 409 &&
      error?.response?.data?.code === DUPLICATE_REFERENCE_CODE
  );
}

function getDuplicateReferenceMessage(error) {
  return error?.response?.data?.message || DUPLICATE_REFERENCE_MESSAGE;
}

export default function DonationScreen({ navigation }) {
  const { user } = useContext(UserContext) || {};
  const { theme } = useContext(ThemeContext);
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeTab, setActiveTab] = useState("form");
  const [form, setForm] = useState(INITIAL_FORM);
  const [photo, setPhoto] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [errors, setErrors] = useState({});

  const { scrollRef, registerInput, scrollToInput } = useFormAutoScroll(36);

  const hydrateUserDetails = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      donorName: getUserDisplayName(user),
      donorPhone: getUserPhone(user),
      donorEmail: getUserEmail(user),
    }));
  }, [user]);

  useEffect(() => {
    hydrateUserDetails();
  }, [hydrateUserDetails]);

  const updateField = (key, value) => {
    setErrors((prev) => ({ ...prev, [key]: "" }));
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const fetchHistory = useCallback(async () => {
    if (!user?._id) {
      setHistory([]);
      return;
    }

    setHistoryLoading(true);
    setHistoryError("");

    try {
      const donations = await getMyDonations(user._id);
      setHistory(Array.isArray(donations) ? donations : []);
    } catch (err) {
      console.log("[donations] history failed:", err?.message);
      setHistoryError("Unable to load donation history.");
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [user?._id]);

  const submitDonationPayload = async (payload, selectedPhoto) => {
    return submitDonationApi(payload, selectedPhoto);
  };

  const syncQueuedDonations = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue = raw ? JSON.parse(raw) : [];

      setQueuedCount(queue.length);

      if (!queue.length) return;

      const remaining = [];

      for (const queued of queue) {
        try {
          await submitDonationPayload(queued.payload, queued.photo);
        } catch (err) {
          if (isDuplicateReferenceError(err)) {
            console.log("[donations] queued duplicate reference blocked");
            continue;
          }

          console.log("[donations] queued sync failed:", err?.message);
          remaining.push(queued);
        }
      }

      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
      setQueuedCount(remaining.length);

      if (remaining.length !== queue.length) {
        fetchHistory();
      }
    } catch (err) {
      console.log("[donations] sync queue failed:", err?.message);
    }
  }, [fetchHistory]);

  useEffect(() => {
    fetchHistory();
    syncQueuedDonations();
  }, [fetchHistory, syncQueuedDonations]);

  const resetMonetaryInputs = () => {
    setForm((prev) => ({
      ...prev,
      donorName: getUserDisplayName(user),
      donorPhone: getUserPhone(user),
      donorEmail: getUserEmail(user),
      amount: "",
      gcashReferenceNumber: "",
      description: "",
    }));
    setPhoto(null);
    setErrors({});
  };

  const resetForm = () => {
    resetMonetaryInputs();
  };

  const openHistoryTab = () => {
    resetMonetaryInputs();
    setActiveTab("history");
    fetchHistory();
  };

  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow photo access to upload your GCash receipt or screenshot."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.72,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      setErrors((prev) => ({ ...prev, photo: "" }));
      setPhoto({
        uri: asset.uri,
        name:
          asset.fileName ||
          asset.uri?.split("/")?.pop() ||
          `donation-proof-${Date.now()}.jpg`,
        type: asset.mimeType || "image/jpeg",
      });
    } catch (err) {
      console.log("[donations] pick image failed:", err?.message);
      Alert.alert("Upload failed", "Unable to select an image right now.");
    }
  };

  const buildPayload = () => {
    const nextErrors = {};

    const cleanAmount = sanitizeAmount(form.amount);
    const amount = Number(cleanAmount);

    const gcashReferenceNumber = sanitizeNumericReference(
      form.gcashReferenceNumber
    );

    const donorName = getUserDisplayName(user);
    const donorPhone = getUserPhone(user);
    const donorEmail = getUserEmail(user);
    const description = String(form.description || "").trim();

    if (!donorName) {
      nextErrors.donorName = "Donor name is missing from your account.";
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      nextErrors.amount = "Enter a valid donation amount.";
    }

    if (!gcashReferenceNumber) {
      nextErrors.gcashReferenceNumber = "Reference number is required.";
    }

    if (!photo?.uri) {
      nextErrors.photo = "Upload your GCash receipt or screenshot.";
    }

    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      throw new Error(Object.values(nextErrors)[0]);
    }

    return {
      donorUserId: user?._id || "",

      inventoryType: "monetary",
      donationType: "monetary",
      category: "money",

      amount: String(amount),
      quantity: "0",
      unit: "",

      paymentMethod: "gcash",
      referenceNumber: gcashReferenceNumber,
      gcashReferenceNumber,

      donorName,
      donorPhone,
      donorEmail,
      contactInfo: donorPhone || donorEmail,

      sourceType: "external",
      fulfillmentMethod: "drop_off",

      itemName: "",
      condition: "",
      usageDuration: "",
      requiresExpiration: "false",

      description: description || "GCash monetary donation.",
      location: "",
      barangay: "",
      latitude: "",
      longitude: "",
    };
  };

  const queueDonation = async (payload, selectedPhoto) => {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];

    const next = [
      ...queue,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        payload,
        photo: selectedPhoto,
        queuedAt: new Date().toISOString(),
      },
    ];

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
    setQueuedCount(next.length);
  };

  const performSubmitDonation = async (payload) => {
    try {
      setSubmitting(true);

      try {
        await submitDonationPayload(payload, photo);
      } catch (submitErr) {
        console.log("[donations] submit failed:", submitErr?.message);

        if (isDuplicateReferenceError(submitErr)) {
          setErrors((prev) => ({
            ...prev,
            gcashReferenceNumber: getDuplicateReferenceMessage(submitErr),
          }));
          Alert.alert(
            DUPLICATE_REFERENCE_TITLE,
            getDuplicateReferenceMessage(submitErr)
          );
          return;
        }

        if (submitErr?.response) {
          throw submitErr;
        }

        await queueDonation(payload, photo);

        Alert.alert(
          "Saved offline",
          "Your donation was saved and will sync when the server is reachable."
        );

        resetForm();
        return;
      }

      Alert.alert(
        "Donation submitted",
        "Your monetary donation is pending MDRRMO review."
      );

      resetForm();
      setActiveTab("history");
      fetchHistory();
    } catch (err) {
      Alert.alert(
        "Submission failed",
        err?.message || "Unable to submit your donation."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitDonation = () => {
    try {
      const payload = buildPayload();
      setErrors({});

      const amountLabel = Number(payload.amount || 0).toLocaleString("en-PH");

      Alert.alert(
        "Confirm Donation",
        `Are you sure you want to submit a GCash monetary donation of PHP ${amountLabel}?`,
        [
          {
            text: "No",
            style: "cancel",
          },
          {
            text: "Yes",
            onPress: () => performSubmitDonation(payload),
          },
        ]
      );
    } catch (err) {
      Alert.alert(
        "Donation details needed",
        err?.message || "Please check the form."
      );
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-back" size={21} color={theme.primary} />
            </TouchableOpacity>

            <View style={styles.headerCopy}>
              <Text style={styles.title}>Monetary Donation</Text>
              <Text style={styles.subtitle}>
                Send GCash support to MDRRMO for disaster response.
              </Text>
            </View>
          </View>

          {queuedCount > 0 && (
            <TouchableOpacity
              style={styles.offlineBanner}
              onPress={syncQueuedDonations}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={17} color="#92400E" />
              <Text style={styles.offlineText}>
                {queuedCount} donation(s) waiting to sync
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.mainTabs}>
            <MainTabButton
              icon="wallet-outline"
              label="GCash Donation"
              active={activeTab === "form"}
              onPress={() => setActiveTab("form")}
              styles={styles}
            />

            <MainTabButton
              icon="time-outline"
              label="My Donation History"
              active={activeTab === "history"}
              onPress={openHistoryTab}
              styles={styles}
            />
          </View>

          {activeTab === "form" ? (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>GCash Monetary Donation</Text>

              <Text style={styles.panelSubtitle}>
                Submit the amount, GCash reference number, and proof of
                transaction.
              </Text>

              <MonetaryFields
                form={form}
                updateField={updateField}
                errors={errors}
                registerInput={registerInput}
                scrollToInput={scrollToInput}
                photo={photo}
                pickImage={pickImage}
                styles={styles}
              />

              <TouchableOpacity
                style={[styles.submitButton, submitting && styles.disabled]}
                onPress={submitDonation}
                disabled={submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#FFFFFF" />
                    <Text style={styles.submitText}>Submit Donation</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <HistoryPanel
              history={history}
              loading={historyLoading}
              error={historyError}
              onRetry={fetchHistory}
              styles={styles}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MainTabButton({ icon, label, active, onPress, styles }) {
  return (
    <TouchableOpacity
      style={[styles.mainTabButton, active && styles.mainTabButtonActive]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons
        name={icon}
        size={17}
        color={active ? "#FFFFFF" : styles.iconColor}
      />
      <Text style={[styles.mainTabText, active && styles.mainTabTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function FieldError({ message, styles }) {
  return message ? <Text style={styles.fieldError}>{message}</Text> : null;
}

function ReadOnlyField({ label, value, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputShell, styles.readOnlyShell]}>
        <Text style={styles.readOnlyText}>
          {value ? value : "Not provided"}
        </Text>
      </View>
    </View>
  );
}

function MonetaryFields({
  form,
  updateField,
  errors,
  registerInput,
  scrollToInput,
  photo,
  pickImage,
  styles,
}) {
  return (
    <>
      <View style={styles.accountInfoBox}>
        <View style={styles.accountInfoIcon}>
          <Ionicons name="person-circle-outline" size={22} color={styles.iconColor} />
        </View>

        <View style={styles.accountInfoCopy}>
          <Text style={styles.accountInfoTitle}>Account details</Text>
          <Text style={styles.accountInfoText}>
            Donor details are automatically taken from your account and cannot
            be edited here.
          </Text>
        </View>
      </View>

      <ReadOnlyField
        label="Donor name"
        value={form.donorName}
        styles={styles}
      />

      <ReadOnlyField
        label="Contact number"
        value={form.donorPhone}
        styles={styles}
      />

      <ReadOnlyField
        label="Email address"
        value={form.donorEmail}
        styles={styles}
      />

      <Field label="Amount" styles={styles}>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="0.00"
          placeholderTextColor={styles.placeholderColor}
          value={form.amount}
          onFocus={() => scrollToInput("amount")}
          onLayout={registerInput("amount")}
          onChangeText={(value) => updateField("amount", sanitizeAmount(value))}
          maxLength={11}
        />
        <FieldError message={errors.amount} styles={styles} />
      </Field>

      <Field label="GCash reference number" styles={styles}>
        <TextInput
          style={styles.input}
          placeholder="Reference number"
          placeholderTextColor={styles.placeholderColor}
          value={form.gcashReferenceNumber}
          onFocus={() => scrollToInput("gcashReferenceNumber")}
          onLayout={registerInput("gcashReferenceNumber")}
          onChangeText={(value) =>
            updateField("gcashReferenceNumber", sanitizeNumericReference(value))
          }
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={80}
        />
        <FieldError message={errors.gcashReferenceNumber} styles={styles} />
      </Field>

      <Field label="Message or note" styles={styles}>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Optional message"
          placeholderTextColor={styles.placeholderColor}
          value={form.description}
          multiline
          onFocus={() => scrollToInput("description")}
          onLayout={registerInput("description")}
          onChangeText={(value) => updateField("description", value)}
          maxLength={500}
        />
      </Field>

      <TouchableOpacity
        style={styles.uploadBox}
        onPress={pickImage}
        activeOpacity={0.85}
      >
        {photo?.uri ? (
          <>
            <Image source={{ uri: photo.uri }} style={styles.previewImage} />
            <Text style={styles.uploadText}>Change proof</Text>
          </>
        ) : (
          <>
            <Ionicons name="image-outline" size={24} color={styles.iconColor} />
            <Text style={styles.uploadTitle}>Upload GCash proof</Text>
            <Text style={styles.uploadHint}>
              Receipt or screenshot is required
            </Text>
          </>
        )}
      </TouchableOpacity>

      <FieldError message={errors.photo} styles={styles} />
    </>
  );
}

function Field({ label, children, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputShell}>{children}</View>
    </View>
  );
}

function HistoryPanel({ history, loading, error, onRetry, styles }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>My Donation History</Text>

      <Text style={styles.panelSubtitle}>
        Track your submitted monetary donations and review status.
      </Text>

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator />
          <Text style={styles.stateText}>Loading donations...</Text>
        </View>
      ) : error ? (
        <TouchableOpacity
          style={styles.stateBox}
          onPress={onRetry}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh-outline" size={22} color={styles.iconColor} />
          <Text style={styles.stateText}>{error}</Text>
          <Text style={styles.retryText}>Tap to retry</Text>
        </TouchableOpacity>
      ) : history.length === 0 ? (
        <View style={styles.stateBox}>
          <Ionicons name="gift-outline" size={24} color={styles.iconColor} />
          <Text style={styles.stateTitle}>No donations yet</Text>
          <Text style={styles.stateText}>
            Your submitted donations will appear here.
          </Text>
        </View>
      ) : (
        history.map((item) => (
          <DonationHistoryCard key={item._id} item={item} styles={styles} />
        ))
      )}
    </View>
  );
}

function DonationHistoryCard({ item, styles }) {
  const normalizedStatus = String(item.status || "pending").toLowerCase();
  const status = STATUS_META[normalizedStatus] || STATUS_META.pending;

  const date = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Date unavailable";

  const amount = Number(item.amount || 0);
  const summary = `PHP ${amount.toLocaleString("en-PH")} via GCash`;

  return (
    <View style={styles.historyCard}>
      <View style={styles.historyTop}>
        <View style={styles.historyIcon}>
          <Ionicons name="wallet-outline" size={18} color="#FFFFFF" />
        </View>

        <View style={styles.historyCopy}>
          <Text style={styles.historyTitle}>GCash Donation</Text>
          <Text style={styles.historyDate}>{date}</Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.label}
          </Text>
        </View>
      </View>

      <Text style={styles.historySummary}>{summary}</Text>

      {item.referenceNumber ? (
        <Text style={styles.assignmentText}>
          Reference: {item.referenceNumber}
        </Text>
      ) : null}

      {item.adminNotes ? (
        <Text style={styles.assignmentText}>Note: {item.adminNotes}</Text>
      ) : null}

      {item.assignment?.targetName ? (
        <Text style={styles.assignmentText}>
          Assigned to: {item.assignment.targetName}
        </Text>
      ) : null}

      {item.photos?.[0]?.fileUrl ? (
        <Image
          source={{ uri: item.photos[0].fileUrl }}
          style={styles.historyProofImage}
        />
      ) : null}
    </View>
  );
}

function createStyles(theme) {
  const isDark = theme.mode === "dark";
  const placeholderColor = isDark ? "#7C8A82" : "#87958C";

  const sheet = StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.background,
    },
    keyboardWrap: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 34,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 16,
    },
    backButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      marginRight: 12,
    },
    headerCopy: {
      flex: 1,
    },
    title: {
      color: theme.text,
      fontSize: 24,
      fontWeight: "900",
    },
    subtitle: {
      marginTop: 3,
      color: theme.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "700",
    },
    offlineBanner: {
      minHeight: 42,
      borderRadius: 14,
      paddingHorizontal: 12,
      marginBottom: 14,
      backgroundColor: "#FEF3C7",
      borderWidth: 1,
      borderColor: "#FDE68A",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    offlineText: {
      flex: 1,
      color: "#92400E",
      fontSize: 12,
      fontWeight: "900",
    },
    mainTabs: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 14,
    },
    mainTabButton: {
      flex: 1,
      minHeight: 62,
      borderRadius: 16,
      paddingHorizontal: 8,
      paddingVertical: 9,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    mainTabButtonActive: {
      backgroundColor: theme.primary,
      borderColor: theme.primary,
    },
    mainTabText: {
      color: theme.primary,
      fontSize: 10,
      lineHeight: 13,
      fontWeight: "900",
      textAlign: "center",
    },
    mainTabTextActive: {
      color: "#FFFFFF",
    },
    panel: {
      borderRadius: 22,
      padding: 16,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: 16,
    },
    panelTitle: {
      color: theme.text,
      fontSize: 18,
      fontWeight: "900",
    },
    panelSubtitle: {
      marginTop: 4,
      marginBottom: 10,
      color: theme.muted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "700",
    },
    accountInfoBox: {
      marginTop: 10,
      marginBottom: 2,
      borderRadius: 16,
      padding: 12,
      backgroundColor: theme.primarySoft || theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    accountInfoIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: theme.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    accountInfoCopy: {
      flex: 1,
    },
    accountInfoTitle: {
      color: theme.text,
      fontSize: 12,
      fontWeight: "900",
    },
    accountInfoText: {
      marginTop: 2,
      color: theme.muted,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: "700",
    },
    field: {
      marginTop: 12,
    },
    label: {
      marginBottom: 7,
      color: theme.muted,
      fontSize: 12,
      fontWeight: "900",
    },
    inputShell: {
      minHeight: 50,
      borderRadius: 15,
      paddingHorizontal: 12,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      justifyContent: "center",
    },
    readOnlyShell: {
      opacity: 0.82,
    },
    readOnlyText: {
      color: theme.muted,
      paddingVertical: 12,
      fontSize: 14,
      fontWeight: "800",
    },
    input: {
      color: theme.text,
      paddingVertical: 11,
      fontSize: 14,
      fontWeight: "800",
    },
    textArea: {
      minHeight: 86,
      textAlignVertical: "top",
    },
    fieldError: {
      marginTop: 6,
      color: theme.danger || "#DC2626",
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "800",
    },
    uploadBox: {
      minHeight: 138,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      marginTop: 12,
    },
    uploadTitle: {
      marginTop: 8,
      color: theme.text,
      fontWeight: "900",
    },
    uploadHint: {
      marginTop: 3,
      color: theme.muted,
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center",
      paddingHorizontal: 14,
    },
    uploadText: {
      position: "absolute",
      bottom: 10,
      right: 10,
      minHeight: 30,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      overflow: "hidden",
      backgroundColor: "rgba(20,83,45,0.92)",
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "900",
    },
    previewImage: {
      width: "100%",
      height: 190,
    },
    submitButton: {
      minHeight: 52,
      borderRadius: 16,
      marginTop: 18,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
    },
    disabled: {
      opacity: 0.62,
    },
    submitText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "900",
    },
    stateBox: {
      minHeight: 150,
      borderRadius: 18,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
      marginTop: 12,
    },
    stateTitle: {
      marginTop: 8,
      color: theme.text,
      fontSize: 14,
      fontWeight: "900",
    },
    stateText: {
      marginTop: 6,
      color: theme.muted,
      fontSize: 12,
      lineHeight: 17,
      textAlign: "center",
      fontWeight: "700",
    },
    retryText: {
      marginTop: 8,
      color: theme.primary,
      fontSize: 12,
      fontWeight: "900",
    },
    historyCard: {
      marginTop: 12,
      borderRadius: 18,
      padding: 13,
      backgroundColor: theme.surfaceAlt,
      borderWidth: 1,
      borderColor: theme.border,
    },
    historyTop: {
      flexDirection: "row",
      alignItems: "center",
    },
    historyIcon: {
      width: 38,
      height: 38,
      borderRadius: 14,
      backgroundColor: theme.primary,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    historyCopy: {
      flex: 1,
      minWidth: 0,
    },
    historyTitle: {
      color: theme.text,
      fontSize: 13,
      fontWeight: "900",
    },
    historyDate: {
      marginTop: 2,
      color: theme.muted,
      fontSize: 11,
      fontWeight: "700",
    },
    statusBadge: {
      minHeight: 28,
      borderRadius: 999,
      paddingHorizontal: 9,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 8,
    },
    statusText: {
      fontSize: 10,
      fontWeight: "900",
      textTransform: "uppercase",
    },
    historySummary: {
      marginTop: 10,
      color: theme.text,
      fontSize: 13,
      fontWeight: "800",
    },
    assignmentText: {
      marginTop: 5,
      color: theme.muted,
      fontSize: 11,
      fontWeight: "700",
    },
    historyProofImage: {
      width: "100%",
      height: 150,
      borderRadius: 14,
      marginTop: 10,
      backgroundColor: theme.surface,
    },
  });

  return {
    ...sheet,
    placeholderColor,
    iconColor: theme.primary,
  };
}
