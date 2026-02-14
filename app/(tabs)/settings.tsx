import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import { GoalSetting } from "@/src/components/settings/GoalSetting";
import { ApiKeySettings } from "@/src/components/settings/ApiKeySettings";
import { FeedbackForm } from "@/src/components/settings/FeedbackForm";
import { RecognitionModeSetting } from "@/src/components/settings/RecognitionModeSetting";
import { useGoal } from "@/src/hooks/useGoal";
import { useApiKeys } from "@/src/hooks/useApiKeys";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING } from "@/src/constants/theme";

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { goal, updateGoal } = useGoal();
  const {
    deepgramKey,
    openaiKey,
    recognitionMode,
    saveDeepgramKey,
    saveOpenaiKey,
    saveRecognitionMode,
  } =
    useApiKeys();
  const cloudConfigured = Boolean(deepgramKey?.trim() || openaiKey?.trim());

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scroll: {
          flex: 1,
        },
        content: {
          padding: SPACING.lg,
          gap: SPACING.lg,
        },
        about: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: SPACING.lg,
          alignItems: "center",
        },
        aboutTitle: {
          fontSize: FONT_SIZE.lg,
          fontWeight: "600",
          color: colors.text,
        },
        aboutText: {
          fontSize: FONT_SIZE.sm,
          color: colors.textSecondary,
          textAlign: "center",
          marginTop: SPACING.sm,
          lineHeight: 22,
        },
        version: {
          fontSize: FONT_SIZE.xs,
          color: colors.textTertiary,
          marginTop: SPACING.md,
        },
      }),
    [colors],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <GoalSetting
          currentTarget={goal?.daily_target ?? 100}
          onUpdate={updateGoal}
        />

        <RecognitionModeSetting
          mode={recognitionMode}
          cloudConfigured={cloudConfigured}
          onChange={saveRecognitionMode}
        />

        <ApiKeySettings
          deepgramKey={deepgramKey}
          openaiKey={openaiKey}
          onSaveDeepgram={saveDeepgramKey}
          onSaveOpenai={saveOpenaiKey}
        />

        <FeedbackForm />

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
