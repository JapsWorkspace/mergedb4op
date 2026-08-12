import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const sections = [
  {
    icon: "person-circle-outline",
    title: "Information We Collect",
    body:
      "SagipBayan may collect account details such as your name, contact number, email address, barangay, and address to support emergency communication and disaster response services.",
  },
  {
    icon: "medkit-outline",
    title: "How We Use Your Information",
    body:
      "Your information is used to provide safety alerts, verify reports, recommend evacuation centers, and help MDRRMO coordinate community response.",
  },
  {
    icon: "location-outline",
    title: "Location and Safety Data",
    body:
      "Location information may be used to provide nearby incident alerts, route guidance, evacuation recommendations, and safety status features.",
  },
  {
    icon: "camera-outline",
    title: "Incident Reports and Uploaded Images",
    body:
      "Incident reports, descriptions, locations, and uploaded images may be reviewed by MDRRMO for validation and response coordination.",
  },
  {
    icon: "notifications-outline",
    title: "Notifications and Emergency Alerts",
    body:
      "SagipBayan may send in-app, email, and SMS notifications for announcements, guidelines, verified incidents, and urgent disaster alerts.",
  },
  {
    icon: "shield-checkmark-outline",
    title: "Data Protection and Security",
    body:
      "SagipBayan uses reasonable safeguards to protect user information and limits access to authorized personnel.",
  },
  {
    icon: "create-outline",
    title: "User Rights",
    body:
      "Users may update their account information, manage notification settings when available, and request assistance regarding their data.",
  },
  {
    icon: "checkmark-done-outline",
    title: "Consent",
    body:
      "By using SagipBayan, users acknowledge and consent to the collection and use of information for disaster preparedness, response, and safety communication.",
  },
];

export default function DataPrivacy() {
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
            <Ionicons name="lock-closed-outline" size={30} color="#1F5F3B" />
          </View>
          <Text style={styles.kicker}>SagipBayan account safety</Text>
          <Text style={styles.title}>Data Privacy Policy</Text>
          <Text style={styles.subtitle}>
            How SagipBayan protects and uses your information
          </Text>
          <Text style={styles.updated}>Last updated: May 14, 2026</Text>
        </View>

        <View style={styles.noticeCard}>
          <Ionicons name="shield-checkmark-outline" size={20} color="#1F5F3B" />
          <Text style={styles.noticeText}>
            Your information supports emergency communication, disaster preparedness,
            and coordinated municipal response.
          </Text>
        </View>

        {sections.map((section) => (
          <LegalSectionCard key={section.title} {...section} />
        ))}

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
  noticeCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "#EAF5ED",
    borderWidth: 1,
    borderColor: "#CFE3D3",
    marginBottom: 12,
  },
  noticeText: {
    flex: 1,
    color: "#365443",
    fontSize: 13,
    lineHeight: 19,
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
});
