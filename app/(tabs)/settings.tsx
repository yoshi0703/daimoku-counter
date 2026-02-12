import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GoalSetting } from "@/src/components/settings/GoalSetting";
import { useGoal } from "@/src/hooks/useGoal";
import { COLORS, FONT_SIZE, SPACING } from "@/src/constants/theme";

export default function SettingsScreen() {
  const { goal, updateGoal } = useGoal();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <GoalSetting
          currentTarget={goal?.daily_target ?? 100}
          onUpdate={updateGoal}
        />

        <View style={styles.about}>
          <Text style={styles.aboutTitle}>題目カウンター</Text>
          <Text style={styles.aboutText}>
            音声認識で「南無妙法蓮華経」を{"\n"}
            リアルタイムにカウントします。
          </Text>
          <Text style={styles.version}>v1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
  },
  about: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.lg,
    alignItems: "center",
  },
  aboutTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "600",
    color: COLORS.text,
  },
  aboutText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginTop: SPACING.sm,
    lineHeight: 22,
  },
  version: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textTertiary,
    marginTop: SPACING.md,
  },
});
