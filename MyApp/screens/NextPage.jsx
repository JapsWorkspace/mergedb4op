import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
} from "react-native";

const { width } = Dimensions.get("window");

export default function NextPage() {
  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <Text style={styles.header}>Your Cart</Text>
      <View style={styles.line} />

      {/* Cart Item 1 */}
      <View style={styles.card}>
        <Text style={styles.productName}>Cyberpunk 2077</Text>
        <Text style={styles.price}>1,239$</Text>
        <Text style={styles.remove}>REMOVE</Text>
      </View>

      {/* Cart Item 2 */}
      <View style={styles.card}>
        <Text style={styles.productName}>
          Hollow Knight: Silksong
        </Text>
        <Text style={styles.price}>1,239$</Text>
        <Text style={styles.remove}>REMOVE</Text>
      </View>

      {/* Divider */}
      <View style={styles.line} />

      {/* Estimated Total */}
      <View style={styles.totalSection}>
        <Text style={styles.totalLabel}>Estimated Total</Text>
        <Text style={styles.totalAmount}>1,854$</Text>
      </View>

      {/* Continue Payment */}
      <View style={styles.paymentButton}>
        <Text style={styles.paymentText}>Continue Payment</Text>
      </View>
    </ScrollView>
  );
}
