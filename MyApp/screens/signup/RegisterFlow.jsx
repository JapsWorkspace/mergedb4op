import {
  View,
  FlatList,
  Dimensions,
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
} from "react-native";

import { useEffect, useRef, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

import api from "../../lib/api";
import StepPersonal from "./StepPersonal";
import StepAddress from "./StepAddress";
import StepSecurity from "./StepSecurity";
import StepMobile from "./StepMobile";
import SignUpHeader from "./SignUpHeader";

const { width } = Dimensions.get("window");
const REGISTRATION_STEPS = {
  PERSONAL: 0,
  ADDRESS: 1,
  SECURITY: 2,
  MOBILE: 3,
};
const RESEND_LOCKOUT_SECONDS = 5 * 60;
const MAX_RESEND_ATTEMPTS = 5;

function buildFullAddress({ barangay, street }) {
  return [street, barangay, "Jaen, Nueva Ecija"].filter(Boolean).join(", ");
}

function formatLockoutTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export default function RegisterFlow() {
  const listRef = useRef(null);
  const navigation = useNavigation();

  const [step, setStep] = useState(0);
  const [unlockedSteps, setUnlockedSteps] = useState([0]);

  const [form, setForm] = useState({
    fname: "",
    lname: "",
    username: "",
    password: "",
    phone: "",
    email: "",
    barangay: "",
    street: "",
    address: "",
  });

  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [verificationStep, setVerificationStep] = useState("form");
  const [registeredUserId, setRegisteredUserId] = useState("");
  const [phoneMasked, setPhoneMasked] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpChannelLoading, setOtpChannelLoading] = useState("");
  const [isEmailActionLoading, setIsEmailActionLoading] = useState(false);
  const [smsCooldown, setSmsCooldown] = useState(0);
  const [emailCooldown, setEmailCooldown] = useState(0);
  const [resendLockout, setResendLockout] = useState(0);
  const [resendAttempts, setResendAttempts] = useState(0);
  const [emailPollingMessage, setEmailPollingMessage] = useState("");
  const otpRefs = useRef([]);

  const [serverError, setServerError] = useState({
    email: "",
    phone: "",
    username: "",
  });

  const steps = ["personal", "address", "security", "mobile"];

  useEffect(() => {
    if (smsCooldown <= 0) return undefined;

    const timer = setInterval(() => {
      setSmsCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [smsCooldown]);

  useEffect(() => {
    if (emailCooldown <= 0) return undefined;

    const timer = setInterval(() => {
      setEmailCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [emailCooldown]);

  useEffect(() => {
    if (resendLockout <= 0) return undefined;

    const timer = setInterval(() => {
      setResendLockout((value) => {
        const next = Math.max(0, value - 1);
        if (next === 0) {
          setResendAttempts(0);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [resendLockout]);

  useEffect(() => {
    if (verificationStep !== "email_notice" || !registeredUserId) return undefined;

    let cancelled = false;
    let successTimer = null;

    const checkStatus = async () => {
      try {
        const res = await api.get(`/user/${registeredUserId}/verification-status`);

        if (cancelled) return;

        if (res?.data?.isVerified) {
          setEmailPollingMessage("");
          setVerificationStep("success");
          successTimer = setTimeout(() => {
            navigation.replace("LogIn");
          }, 1000);
          return;
        }

        setEmailPollingMessage("");
      } catch (err) {
        console.log("[email verification polling failed]", err?.message);
        if (!cancelled) {
          setEmailPollingMessage("Still waiting for verification...");
        }
      }
    };

    checkStatus();
    const intervalId = setInterval(checkStatus, 3000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      if (successTimer) clearTimeout(successTimer);
    };
  }, [registeredUserId, navigation, verificationStep]);

  const updateForm = (data) => {
    setForm((prev) => ({ ...prev, ...data }));
  };

  const goToStep = (index) => {
    const safeIndex = Math.max(
      REGISTRATION_STEPS.PERSONAL,
      Math.min(index, steps.length - 1)
    );

    setStep(safeIndex);

    listRef.current?.scrollToIndex({
      index: safeIndex,
      animated: true,
    });
  };

  const goNext = () => {
    if (step < steps.length - 1) {
      const next = step + 1;

      setUnlockedSteps((prev) =>
        prev.includes(next) ? prev : [...prev, next]
      );

      goToStep(next);
    }
  };

  const goBack = () => {
    if (step === REGISTRATION_STEPS.PERSONAL) {
      navigation.navigate("LogIn");
      return;
    }

    goToStep(step - 1);
  };

  const handleRegistrationBack = () => {
    if (verificationStep === "success") {
      navigation.navigate("LogIn");
      return;
    }

    if (verificationStep === "email_notice") {
      setVerificationStep("choose_channel");
      return;
    }

    if (
      verificationStep === "choose_channel" ||
      verificationStep === "phone" ||
      verificationStep === "email"
    ) {
      setOtpCode("");
      setVerificationStep("form");
      goToStep(REGISTRATION_STEPS.MOBILE);
      return;
    }

    goBack();
  };

  const handleSwipe = (index) => {
    const direction = index - step;

    if (direction < 0) {
      setStep(index);
      return;
    }

    if (direction > 0 && !unlockedSteps.includes(index)) {
      listRef.current?.scrollToIndex({
        index: step,
        animated: true,
      });
      return;
    }

    setStep(index);
  };

  const handleSubmit = async (mobileData) => {
    try {
      const rebuiltAddress = buildFullAddress({
        barangay: form.barangay,
        street: form.street,
      });

      const payload = {
        fname: form.fname,
        lname: form.lname,
        username: form.username,
        password: form.password,
        email: mobileData.email,
        phone: mobileData.phone,
        barangay: form.barangay,
        street: form.street,
        streetAddress: form.street,
        address: rebuiltAddress,
      };

      console.log("📦 FINAL CLEAN PAYLOAD:", payload);

      const res = await api.post("/user/register", payload);
      const result = res?.data || {};
      await AsyncStorage.multiSet([
        ["hasSeenGetStarted", "true"],
        ["getStartedSeen", "true"],
        ["hasAcceptedPrivacy", "true"],
        ["hasAcceptedDataPrivacy", "true"],
        ["privacyAccepted", "true"],
        ["hasAcceptedTerms", "true"],
        ["termsAccepted", "true"],
        ["hasAccount", "true"],
        ["hasCreatedAccount", "true"],
        ["onboardingComplete", "true"],
      ]);

      console.log("📨 SERVER RESPONSE:", result);

      setServerError({ email: "", phone: "", username: "" });
      setRegisteredUserId(result?.userId || "");
      setPhoneMasked(result?.phoneMasked || mobileData.phone);
      setEmailMasked(result?.emailMasked || mobileData.email);
      setVerificationStep("choose_channel");
      setOtpCode("");
      setSmsCooldown(0);
      setEmailCooldown(0);

      setModalMessage(
        result?.message ||
          "Registration successful. Choose where you want to receive your OTP."
      );
      setShowModal(true);
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Registration failed";

      console.log("❌ REGISTER ERROR:", message);

      const lower = String(message).toLowerCase();

      const errors = {
        email: lower.includes("email") ? "Email already exists" : "",
        phone: lower.includes("phone") ? "Phone number already exists" : "",
        username: lower.includes("username") ? "Username already exists" : "",
      };

      setServerError(errors);

      const modalMsg =
        errors.email ||
        errors.phone ||
        errors.username ||
        message;

      setModalMessage(modalMsg);
      setShowModal(true);
    }
  };

  const startRegistrationOtp = async (channel) => {
    if (!registeredUserId || otpChannelLoading) return;

    const nextStep = channel === "sms" ? "phone" : "email";
    const purpose = channel === "sms" ? "registration_phone" : "registration_email";

    try {
      setOtpChannelLoading(channel);
      setOtpCode("");

      await api.post("/user/send-otp", {
        userId: registeredUserId,
        channel,
        purpose,
      });

      setVerificationStep(nextStep);

      if (channel === "sms") {
        setSmsCooldown(60);
      } else {
        setEmailCooldown(60);
      }
      setResendAttempts(0);
      setResendLockout(0);

      setModalMessage(
        channel === "sms"
          ? "OTP sent to your mobile number."
          : "OTP sent to your email address."
      );
      setShowModal(true);
    } catch (err) {
      setModalMessage(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Unable to send OTP. Please try again."
      );
      setShowModal(true);
    } finally {
      setOtpChannelLoading("");
    }
  };

  const verifyRegistrationOtp = async () => {
    if (!registeredUserId) return;

    if (!otpCode) {
      setModalMessage("OTP cannot be empty");
      setShowModal(true);
      return;
    }

    if (!/^\d{6}$/.test(otpCode)) {
      setModalMessage("Please enter the full 6-digit OTP.");
      setShowModal(true);
      return;
    }

    try {
      setIsVerifyingOtp(true);
      const purpose =
        verificationStep === "phone" ? "registration_phone" : "registration_email";
      const channel = verificationStep === "phone" ? "sms" : "email";
      const res = await api.post("/user/verify-otp", {
        userId: registeredUserId,
        otp: otpCode,
        purpose,
        channel,
      });
      const result = res?.data || {};

      setOtpCode("");

      setVerificationStep("success");
      setModalMessage(result?.message || "Account verified successfully.");
      setShowModal(true);

      setTimeout(() => {
        setShowModal(false);
        navigation.navigate("LogIn");
      }, 1200);
    } catch (err) {
      setModalMessage(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          "OTP verification failed."
      );
      setShowModal(true);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const resendVerificationEmail = async () => {
    if (!registeredUserId || isEmailActionLoading) return;

    try {
      setIsEmailActionLoading(true);
      await api.post(`/user/${registeredUserId}/resend-verification-email`);
      setEmailCooldown(60);
      setModalMessage("Verification email sent. Please check your inbox.");
      setShowModal(true);
    } catch (err) {
      setModalMessage(
        err?.response?.data?.message || "Unable to resend verification email."
      );
      setShowModal(true);
    } finally {
      setIsEmailActionLoading(false);
    }
  };

  const resendRegistrationOtp = async () => {
    if (!registeredUserId) return;

    if (resendLockout > 0) {
      setModalMessage(
        `Please wait ${formatLockoutTime(resendLockout)} before resending OTP.`
      );
      setShowModal(true);
      return;
    }

    const channel = verificationStep === "phone" ? "sms" : "email";
    const activeCooldown = channel === "sms" ? smsCooldown : emailCooldown;

    if (activeCooldown > 0) return;

    if (resendAttempts >= MAX_RESEND_ATTEMPTS - 1) {
      setResendAttempts((value) => value + 1);
      setResendLockout(RESEND_LOCKOUT_SECONDS);
      setSmsCooldown(0);
      setEmailCooldown(0);
      setModalMessage("Please wait before resending OTP.");
      setShowModal(true);
      return;
    }

    try {
      const purpose =
        verificationStep === "phone" ? "registration_phone" : "registration_email";

      await api.post("/user/send-otp", {
        userId: registeredUserId,
        channel,
        purpose,
      });

      if (channel === "sms") {
        setSmsCooldown(60);
      } else {
        setEmailCooldown(60);
      }
      setResendAttempts((value) => value + 1);
      setModalMessage("A new verification code has been sent.");
      setShowModal(true);
    } catch (err) {
      setModalMessage(
        err?.response?.data?.message || "Please wait before requesting another OTP."
      );
      setShowModal(true);
    }
  };

  const updateOtpDigit = (text, index) => {
    const digit = String(text || "").replace(/\D/g, "").slice(-1);
    const next = otpCode.split("").concat(Array(6).fill("")).slice(0, 6);
    next[index] = digit;
    setOtpCode(next.join("").slice(0, 6));

    if (digit && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const renderVerificationPanel = () => {
    if (verificationStep === "choose_channel") {
      return (
        <View style={styles.verificationWrap}>
          <RegistrationStepIndicator currentStep={1} />
          <View style={styles.verificationCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark-outline" size={34} color="#166534" />
            </View>
            <Text style={styles.verifyTitle}>Choose OTP Method</Text>
            <Text style={styles.verifyText}>
              Select where you want to receive your 6-digit verification code.
            </Text>

            <TouchableOpacity
              style={[
                styles.channelButton,
                otpChannelLoading === "sms" && styles.disabledButton,
              ]}
              disabled={!!otpChannelLoading}
              onPress={() => startRegistrationOtp("sms")}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#166534" />
              <View style={styles.channelCopy}>
                <Text style={styles.channelTitle}>Send via SMS</Text>
                <Text style={styles.channelMeta}>{phoneMasked || "Registered mobile number"}</Text>
              </View>
              {otpChannelLoading === "sms" ? (
                <ActivityIndicator size="small" color="#166534" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color="#166534" />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.channelButton,
                otpChannelLoading === "email" && styles.disabledButton,
              ]}
              disabled={!!otpChannelLoading}
              onPress={() => startRegistrationOtp("email")}
            >
              <Ionicons name="mail-outline" size={20} color="#166534" />
              <View style={styles.channelCopy}>
                <Text style={styles.channelTitle}>Send via Email</Text>
                <Text style={styles.channelMeta}>{emailMasked || "Registered email address"}</Text>
              </View>
              {otpChannelLoading === "email" ? (
                <ActivityIndicator size="small" color="#166534" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color="#166534" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (verificationStep === "success") {
      return (
        <View style={styles.verificationWrap}>
          <RegistrationStepIndicator currentStep={4} />
          <View style={styles.verificationCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="checkmark-circle-outline" size={34} color="#166534" />
            </View>
            <Text style={styles.verifyTitle}>Account Verified</Text>
            <Text style={styles.verifyText}>
              Your SagipBayan account has been verified. You may now sign in and access the system.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => navigation.navigate("LogIn")}
            >
              <Text style={styles.modalButtonText}>Continue to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    if (verificationStep === "email_notice") {
      return (
        <View style={styles.verificationWrap}>
          <RegistrationStepIndicator currentStep={2} />
          <View style={styles.verificationCard}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-outline" size={34} color="#166534" />
            </View>
            <Text style={styles.verifyTitle}>Check Your Email</Text>
            <Text style={styles.verifyText}>
              Your phone number has been verified. We sent a verification link to your registered email address. Please open your email and click the link to complete your registration.
            </Text>
            <Text style={styles.verifySubtext}>
              This screen will continue automatically once your email is verified.
            </Text>

            <ActivityIndicator size="large" color="#166534" style={styles.loadingSpinner} />
            <Text style={styles.loadingText}>
              {emailPollingMessage || "Waiting for email verification..."}
            </Text>

            <TouchableOpacity
              style={[
                styles.secondaryButton,
                (isEmailActionLoading || emailCooldown > 0) && styles.disabledButton,
              ]}
              onPress={resendVerificationEmail}
              disabled={isEmailActionLoading || emailCooldown > 0}
            >
              <Text style={styles.secondaryButtonText}>
                {emailCooldown > 0
                  ? `Resend available in ${emailCooldown}s`
                  : isEmailActionLoading
                    ? "Please wait..."
                    : "Resend Verification Email"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.verificationWrap}>
        <RegistrationStepIndicator currentStep={1} />
        <View style={styles.otpCard}>
          <View style={styles.otpHeroCircle}>
            <Ionicons name="chatbubble-ellipses-outline" size={36} color="#1F5F3B" />
          </View>
          <Text style={styles.otpTitle}>Almost there</Text>
          <Text style={styles.otpInstruction}>
            {verificationStep === "email"
              ? "Please enter the 6-digit code sent to your email address for verification."
              : "Please enter the 6-digit code sent to your mobile number for verification."}
          </Text>
          <Text style={styles.otpSubtext}>This code will expire in 5 minutes.</Text>

          <View style={styles.otpBoxes}>
            {Array.from({ length: 6 }).map((_, index) => {
              const digit = otpCode[index] || "";
              return (
                <TextInput
                  key={index}
                  ref={(ref) => {
                    otpRefs.current[index] = ref;
                  }}
                  value={digit}
                  onChangeText={(value) => updateOtpDigit(value, index)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === "Backspace" && !digit && index > 0) {
                      otpRefs.current[index - 1]?.focus();
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={1}
                  style={[styles.otpBox, digit && styles.otpBoxFilled]}
                  textAlign="center"
                />
              );
            })}
          </View>

          <TouchableOpacity
            style={[
              styles.otpVerifyButton,
              isVerifyingOtp && styles.disabledButton,
            ]}
            onPress={verifyRegistrationOtp}
            disabled={isVerifyingOtp}
          >
            <Text style={styles.otpVerifyText}>
              {isVerifyingOtp ? "Verifying..." : "Verify"}
            </Text>
          </TouchableOpacity>

          <Text style={styles.otpTimer}>
            {verificationStep === "email"
              ? emailCooldown > 0
                ? `Request new code in 00:${String(emailCooldown).padStart(2, "0")}s`
                : "You can request a new code now."
              : smsCooldown > 0
                ? `Request new code in 00:${String(smsCooldown).padStart(2, "0")}s`
                : "You can request a new code now."}
          </Text>

          <TouchableOpacity
            onPress={resendRegistrationOtp}
            disabled={
              resendLockout > 0 ||
              (verificationStep === "email" ? emailCooldown > 0 : smsCooldown > 0)
            }
          >
            <Text
              style={[
                styles.otpResend,
                (resendLockout > 0 ||
                  (verificationStep === "email" ? emailCooldown > 0 : smsCooldown > 0)) &&
                  styles.disabledLinkText,
              ]}
            >
              {resendLockout > 0
                ? `Please wait ${formatLockoutTime(resendLockout)} before resending OTP`
                : "Didn't receive any code? Resend Again"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.linkButton} onPress={handleRegistrationBack}>
            <Text style={styles.mutedLinkText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SignUpHeader
        step={step}
        onBack={handleRegistrationBack}
      />
      {verificationStep === "form" ? (
        <RegistrationStepIndicator currentStep={0} compact />
      ) : null}

      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Notice</Text>

            <Text style={styles.modalText}>{modalMessage}</Text>

            <TouchableOpacity
              onPress={() => setShowModal(false)}
              style={styles.modalButton}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {verificationStep !== "form" ? renderVerificationPanel() : (
      <FlatList
        ref={listRef}
        data={steps}
        keyExtractor={(item) => item}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(
            e.nativeEvent.contentOffset.x / width
          );
          handleSwipe(index);
        }}
        renderItem={({ item }) => (
          <View style={styles.page}>
            {item === "personal" && (
              <StepPersonal
                fName={form.fname}
                lName={form.lname}
                username={form.username}
                onFNameChange={(v) => updateForm({ fname: v })}
                onLNameChange={(v) => updateForm({ lname: v })}
                onUsernameChange={(v) => updateForm({ username: v })}
                onNext={(data) => {
                  updateForm({
                    fname: data.fName,
                    lname: data.lName,
                    username: data.username,
                  });
                  goNext();
                }}
              />
            )}

            {item === "address" && (
              <StepAddress
                barangay={form.barangay}
                street={form.street}
                onBarangayChange={(v) => updateForm({ barangay: v })}
                onStreetChange={(v) => updateForm({ street: v })}
                onNext={(data) => {
                  updateForm({
                    barangay: data.barangay,
                    street: data.street,
                    address: buildFullAddress({
                      barangay: data.barangay,
                      street: data.street,
                    }),
                  });
                  goNext();
                }}
              />
            )}

            {item === "security" && (
              <StepSecurity
                onNext={(data) => {
                  updateForm({
                    password: data.password,
                  });
                  goNext();
                }}
              />
            )}

            {item === "mobile" && (
              <StepMobile
                phone={form.phone}
                email={form.email}
                onPhoneChange={(v) => updateForm({ phone: v })}
                onEmailChange={(v) => updateForm({ email: v })}
                onSubmit={handleSubmit}
                emailError={serverError.email}
                phoneError={serverError.phone}
              />
            )}
          </View>
        )}
      />
      )}
    </View>
  );
}

function RegistrationStepIndicator({ currentStep = 0, compact = false }) {
  const steps = ["Account", "Phone", "Email", "Done"];

  return (
    <View style={[styles.stepper, compact && styles.stepperCompact]}>
      {steps.map((label, index) => {
        const completed = index < currentStep;
        const active = index === currentStep;

        return (
          <View key={label} style={styles.stepItem}>
            {index > 0 && (
              <View
                style={[
                  styles.stepLine,
                  index <= currentStep && styles.stepLineActive,
                ]}
              />
            )}
            <View
              style={[
                styles.stepCircle,
                completed && styles.stepCircleDone,
                active && styles.stepCircleActive,
              ]}
            >
              {completed ? (
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              ) : (
                <Text
                  style={[
                    styles.stepNumber,
                    active && styles.stepNumberActive,
                  ]}
                >
                  {index + 1}
                </Text>
              )}
            </View>
            <Text
              style={[
                styles.stepLabel,
                active && styles.stepLabelActive,
                completed && styles.stepLabelDone,
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  page: { width, flex: 1 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },

  modalBox: {
    width: "85%",
    backgroundColor: "#fff",
    padding: 22,
    borderRadius: 16,
    alignItems: "center",
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },

  modalText: {
    textAlign: "center",
    marginTop: 10,
  },

  modalButton: {
    marginTop: 20,
    backgroundColor: "#166534",
    paddingVertical: 12,
    width: "100%",
    borderRadius: 10,
  },

  modalButtonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.55,
  },
  verificationWrap: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "#F4F8F2",
  },
  verificationCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#DCE7DD",
    padding: 22,
  },
  verifyTitle: {
    color: "#10251B",
    fontSize: 22,
    fontWeight: "800",
  },
  verifyText: {
    color: "#647067",
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 18,
    fontWeight: "600",
  },
  otpInput: {
    borderWidth: 1,
    borderColor: "#CBD8CF",
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#FBFDFC",
    fontSize: 20,
    textAlign: "center",
    letterSpacing: 0,
    marginBottom: 14,
  },
  otpCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 34,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    paddingHorizontal: 20,
    paddingVertical: 26,
    alignItems: "center",
    shadowColor: "#123524",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },

  channelButton: {
    width: "100%",
    minHeight: 66,
    marginTop: 12,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDEBE4",
    backgroundColor: "#F8FBF9",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  channelCopy: {
    flex: 1,
    minWidth: 0,
  },

  channelTitle: {
    color: "#10251B",
    fontSize: 14,
    fontWeight: "900",
  },

  channelMeta: {
    marginTop: 2,
    color: "#647067",
    fontSize: 12,
    fontWeight: "700",
  },
  otpHeroCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DDEEE3",
    marginBottom: 18,
  },
  otpTitle: {
    color: "#123524",
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "900",
    textAlign: "center",
  },
  otpInstruction: {
    color: "#667085",
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  otpSubtext: {
    color: "#98A2B3",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  otpBoxes: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 24,
    marginBottom: 22,
  },
  otpBox: {
    width: 44,
    height: 52,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E4E7EC",
    backgroundColor: "#F7FAF8",
    color: "#123524",
    fontSize: 20,
    fontWeight: "900",
  },
  otpBoxFilled: {
    borderColor: "#1F5F3B",
    backgroundColor: "#FFFFFF",
  },
  otpVerifyButton: {
    minHeight: 56,
    borderRadius: 22,
    backgroundColor: "#1F5F3B",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1F5F3B",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  otpVerifyText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  otpTimer: {
    color: "#667085",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 16,
  },
  otpResend: {
    color: "#1F5F3B",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 10,
    textAlign: "center",
  },
  linkButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  linkButtonText: {
    color: "#166534",
    fontWeight: "800",
  },
  mutedLinkText: {
    color: "#647067",
    fontWeight: "800",
  },
  disabledLinkText: {
    color: "#94A3B8",
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#CFE0D1",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: {
    color: "#166534",
    fontWeight: "800",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F3EA",
    borderWidth: 1,
    borderColor: "#CFE0D1",
    marginBottom: 16,
  },
  verifySubtext: {
    color: "#7b867f",
    textAlign: "center",
    lineHeight: 19,
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 10,
  },
  loadingSpinner: {
    marginTop: 8,
    marginBottom: 10,
  },
  loadingText: {
    color: "#166534",
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 10,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 18,
    paddingHorizontal: 6,
  },
  stepperCompact: {
    paddingHorizontal: 18,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  stepItem: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },
  stepLine: {
    position: "absolute",
    right: "50%",
    left: "-50%",
    top: 14,
    height: 2,
    backgroundColor: "#D9E4DC",
  },
  stepLineActive: {
    backgroundColor: "#166534",
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#C8D6CC",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  stepCircleActive: {
    borderColor: "#166534",
    backgroundColor: "#E8F3EA",
  },
  stepCircleDone: {
    borderColor: "#166534",
    backgroundColor: "#166534",
  },
  stepNumber: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "900",
  },
  stepNumberActive: {
    color: "#166534",
  },
  stepLabel: {
    marginTop: 6,
    color: "#7b867f",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  stepLabelActive: {
    color: "#166534",
  },
  stepLabelDone: {
    color: "#14532D",
  },
});
