import { View, Text, StyleSheet } from "react-native";
import { COLORS, FONT_SIZE, SPACING } from "@/src/constants/theme";

interface Props {
  isListening: boolean;
  error: string | null;
}

export function RecognitionStatus({ isListening, error }: Props) {
  if (error) {
    return (
      <View style={styles.container}>
        <View style={[styles.dot, styles.errorDot]} />
        <Text style={[styles.text, styles.errorText]}>{error}</Text>
      </View>
    );
  }

  if (!isListening) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.dot, styles.activeDot]} />
      <Text style={styles.text}>認識中</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    backgroundColor: COLORS.green,
  },
  errorDot: {
    backgroundColor: COLORS.red,
  },
  text: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  errorText: {
    color: COLORS.red,
  },
});
