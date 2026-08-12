// screens/components/LogoutModal.jsx
import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

export default function LogoutModal({ visible, onCancel, onConfirm }) {
  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.text}>
            Are you sure do{"\n"}you want to logout?
          </Text>

          <View style={styles.row}>
            <TouchableOpacity style={styles.no} onPress={onCancel}>
              <Text>No</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.yes} onPress={onConfirm}>
              <Text style={{ color: "#fff" }}>Yes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  box: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 20,
    width: "80%",
  },
  text: {
    textAlign: "center",
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  no: {
    borderWidth: 1,
    padding: 12,
    width: "45%",
    borderRadius: 20,
    alignItems: "center",
  },
  yes: {
    backgroundColor: "#0a5915",
    padding: 12,
    width: "45%",
    borderRadius: 20,
    alignItems: "center",
  },
});