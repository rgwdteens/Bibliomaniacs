import { View, Text, Pressable, StyleSheet, Alert } from "react-native";

export default function NotFound() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Page Not Found</Text>
          <Text style={styles.userText}>The page you were looking for does not exist</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 24 },
  userText: { fontSize: 18, marginBottom: 16 },
});
