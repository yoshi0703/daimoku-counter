import { View, Pressable, Text, StyleSheet } from "react-native";
import { COLORS, SPACING, TOUCH_TARGET, FONT_SIZE } from "@/src/constants/theme";

interface Props {
  isSessionActive: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function CounterControls({ isSessionActive, onStart, onStop }: Props) {
  if (isSessionActive) {
    return (
      <View style={styles.container}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.stopButton,
            pressed && styles.pressed,
          ]}
          onPress={onStop}
        >
          <View style={styles.stopIcon} />
          <Text style={styles.stopText}>停止する</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          styles.startButton,
          pressed && styles.pressed,
        ]}
        onPress={onStart}
      >
        <Text style={styles.startText}>唱題を始める</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: TOUCH_TARGET.recommended + 8,
    borderRadius: (TOUCH_TARGET.recommended + 8) / 2,
    gap: SPACING.sm,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  startButton: {
    backgroundColor: COLORS.text,
  },
  stopButton: {
    backgroundColor: COLORS.red,
  },
  startText: {
    color: COLORS.background,
    fontSize: FONT_SIZE.lg,
    fontWeight: "600",
  },
  stopText: {
    color: COLORS.background,
    fontSize: FONT_SIZE.lg,
    fontWeight: "600",
  },
  stopIcon: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: COLORS.background,
  },
});
