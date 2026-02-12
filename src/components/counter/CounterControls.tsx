import { View, Pressable, Text, StyleSheet } from "react-native";
import { COLORS, SPACING, TOUCH_TARGET, FONT_SIZE } from "@/src/constants/theme";

interface Props {
  isSessionActive: boolean;
  speechAvailable: boolean;
  onStart: () => void;
  onStop: () => void;
  onTap: () => void;
}

export function CounterControls({
  isSessionActive,
  speechAvailable,
  onStart,
  onStop,
  onTap,
}: Props) {
  if (isSessionActive) {
    return (
      <View style={styles.container}>
        {/* 手動モード: タップカウントボタン */}
        {!speechAvailable && (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.tapButton,
              pressed && styles.tapPressed,
            ]}
            onPress={onTap}
          >
            <Text style={styles.tapText}>南無妙法蓮華経</Text>
            <Text style={styles.tapHint}>タップでカウント</Text>
          </Pressable>
        )}

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
        <Text style={styles.startText}>
          {speechAvailable ? "唱題を始める" : "カウントを始める"}
        </Text>
      </Pressable>
      {!speechAvailable && (
        <Text style={styles.modeHint}>
          手動モード（音声認識はDevelopment Buildで利用可）
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
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
  tapButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: "column",
    height: TOUCH_TARGET.recommended + 40,
    borderRadius: 16,
    gap: SPACING.xs,
  },
  tapPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.96 }],
    backgroundColor: COLORS.border,
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
  tapText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.xl,
    fontWeight: "600",
  },
  tapHint: {
    color: COLORS.textTertiary,
    fontSize: FONT_SIZE.xs,
  },
  stopIcon: {
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: COLORS.background,
  },
  modeHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    textAlign: "center",
  },
});
