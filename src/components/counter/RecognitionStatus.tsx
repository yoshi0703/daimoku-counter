import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING } from "@/src/constants/theme";

interface Props {
  isListening: boolean;
  error: string | null;
}

export function RecognitionStatus({ isListening, error }: Props) {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
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
          backgroundColor: colors.green,
        },
        errorDot: {
          backgroundColor: colors.red,
        },
        text: {
          fontSize: FONT_SIZE.sm,
          color: colors.textSecondary,
        },
        errorText: {
          color: colors.red,
        },
      }),
    [colors],
  );

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
