import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const sections = [
  {
    icon: "checkmark-circle-outline",
    title: "Acceptance of Terms",
    body:
      "By using SagipBayan, you agree to follow these terms and use the system responsibly for disaster preparedness, reporting, and safety communication.",
  },
  {
    icon: "people-outline",
    title: "Responsible Use",
    body:
      "Users must provide accurate information and use the system only for legitimate safety, disaster, and community response purposes.",
  },
  {
    icon: "document-text-outline",
    title: "Incident Reporting",
    body:
      "Incident reports should be truthful, timely, and supported by accurate location details and images when available.",
  },
  {
    icon: "warning-outline",
    title: "False or Misleading Reports",
    body:
      "Submitting false, prank, malicious, or misleading reports may affect emergency response and may result in account restrictions or further action by authorized personnel.",
  },
  {
    icon: "notifications-outline",
    title: "Notifications and Alerts",
    body:
      "SagipBayan may send in-app, email, and SMS alerts for important announcements, guidelines, verified incidents, and emergency advisories.",
  },
  {
    icon: "navigate-outline",
    title: "Evacuation and Safety Guidance",
    body:
      "Evacuation center recommendations and safety guidance are provided to support decision-making, but users should still follow official MDRRMO instructions.",
  },
  {
    icon: "cloud-offline-outline",
    title: "System Availability",
    body:
      "The system depends on internet connection, device settings, SMS gateway availability, and server availability. Some services may be delayed during outages.",
  },
  {
    icon: "key-outline",
    title: "Account Responsibility",
    body:
      "Users are responsible for keeping their login credentials secure and for updating their contact and barangay information.",
  },
  {
    icon: "refresh-outline",
    title: "Updates to Terms",
    body:
      "SagipBayan may update these terms to improve safety, compliance, and system reliability.",
  },
];

export default function TermsCondition({ accepted, setAccepted }) {
  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="clipboard-outline" size={31} color="#1F5F3B" />
          </View>
          <Text style={styles.kicker}>Responsible emergency use</Text>
          <Text style={styles.title}>Terms and Conditions</Text>
          <Text style={styles.subtitle}>
            Guidelines for responsible use of SagipBayan
          </Text>
          <Text style={styles.updated}>Last updated: May 14, 2026</Text>
        </View>

        {sections.map((section) => (
          <LegalSectionCard key={section.title} {...section} />
        ))}

        <Pressable
          style={[styles.acceptCard, accepted && styles.acceptCardActive]}
          onPress={() => setAccepted(!accepted)}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
            {accepted ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
          </View>
          <View style={styles.acceptCopy}>
            <Text style={styles.acceptTitle}>Consent required</Text>
            <Text style={styles.acceptText}>
              I have read and agree to the Terms and Conditions and Data Privacy Policy.
            </Text>
          </View>
        </Pressable>

        <View style={{ height: 28 }} />
      </ScrollView>
    </View>
  );
}

function LegalSectionCard({ icon, title, body }) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={20} color="#1F5F3B" />
      </View>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionBody}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F8F5",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  header: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerIcon: {
    width: 66,
    height: 66,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7F3EA",
    borderWidth: 1,
    borderColor: "#CFE3D3",
    marginBottom: 12,
  },
  kicker: {
    color: "#1F5F3B",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  title: {
    marginTop: 5,
    color: "#10251B",
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 6,
    color: "#647067",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  updated: {
    marginTop: 8,
    color: "#7B867F",
    fontSize: 12,
    fontWeight: "800",
  },
  sectionCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#DCE9D6",
    marginBottom: 12,
    shadowColor: "#12301F",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F7F1",
  },
  sectionCopy: {
    flex: 1,
  },
  sectionTitle: {
    color: "#10251B",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  sectionBody: {
    marginTop: 5,
    color: "#56665D",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "600",
  },
  acceptCard: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 15,
    borderWidth: 1,
    borderColor: "#DCE9D6",
    marginTop: 4,
  },
  acceptCardActive: {
    borderColor: "#1F5F3B",
    backgroundColor: "#F4FBF5",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#1F5F3B",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: "#1F5F3B",
  },
  acceptCopy: {
    flex: 1,
  },
  acceptTitle: {
    color: "#10251B",
    fontSize: 14,
    fontWeight: "900",
  },
  acceptText: {
    marginTop: 4,
    color: "#56665D",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
});
