import { View, Text, Pressable, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING, TOUCH_TARGET } from "@/src/constants/theme";
import type { RecognitionModePreference } from "@/src/hooks/useApiKeys";

interface Props {
  mode: RecognitionModePreference;
  cloudConfigured: boolean;
  onChange: (mode: RecognitionModePreference) => Promise<void> | void;
}

export function RecognitionModeSetting({
  mode,
  cloudConfigured,
  onChange,
}: Props) {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: SPACING.md,
          gap: SPACING.sm,
        },
        title: {
          fontSize: FONT_SIZE.lg,
          fontWeight: "600",
          color: colors.text,
        },
        description: {
          fontSize: FONT_SIZE.sm,
          color: colors.textSecondary,
          lineHeight: 20,
        },
        row: {
          flexDirection: "row",
          gap: SPACING.sm,
        },
        option: {
          flex: 1,
          minHeight: TOUCH_TARGET.minimum + 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          paddingHorizontal: SPACING.sm,
          paddingVertical: SPACING.sm,
        },
        optionActive: {
          backgroundColor: colors.text,
          borderColor: colors.text,
        },
        optionText: {
          color: colors.text,
          fontSize: FONT_SIZE.md,
          fontWeight: "600",
          textTransform: "lowercase",
        },
        optionTextActive: {
          color: colors.background,
        },
        optionHint: {
          color: colors.textSecondary,
          fontSize: FONT_SIZE.xs,
        },
        optionHintActive: {
          color: colors.background,
          opacity: 0.9,
        },
        warning: {
          fontSize: FONT_SIZE.xs,
          color: colors.textTertiary,
          lineHeight: 18,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>認識モード</Text>
      <Text style={styles.description}>
        Expo Goでは local（端末内推定）か cloud（API認識）を選べます。
      </Text>

      <View style={styles.row}>
        <Pressable
          style={[styles.option, mode === "local" && styles.optionActive]}
          onPress={() => onChange("local")}
        >
          <Text
            style={[styles.optionText, mode === "local" && styles.optionTextActive]}
          >
            local
          </Text>
          <Text
            style={[styles.optionHint, mode === "local" && styles.optionHintActive]}
          >
            無料・端末内
          </Text>
        </Pressable>

        <Pressable
          style={[styles.option, mode === "cloud" && styles.optionActive]}
          onPress={() => onChange("cloud")}
        >
          <Text
            style={[styles.optionText, mode === "cloud" && styles.optionTextActive]}
          >
            cloud
          </Text>
          <Text
            style={[styles.optionHint, mode === "cloud" && styles.optionHintActive]}
          >
            APIで高精度
          </Text>
        </Pressable>
      </View>

      {!cloudConfigured ? (
        <Text style={styles.warning}>
          APIキー未設定のため、cloudを選んでも実行時はlocalにフォールバックします。
        </Text>
      ) : null}
    </View>
  );
}
