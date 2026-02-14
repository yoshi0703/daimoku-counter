import { View, Text, Switch, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING } from "@/src/constants/theme";

interface Props {
  enabled: boolean;
  onChange: (enabled: boolean) => Promise<void> | void;
}

export function AudioContributionSetting({ enabled, onChange }: Props) {
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
          alignItems: "center",
          justifyContent: "space-between",
        },
        label: {
          fontSize: FONT_SIZE.md,
          color: colors.text,
          flex: 1,
        },
        privacy: {
          fontSize: FONT_SIZE.xs,
          color: colors.textTertiary,
          lineHeight: 18,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>音声データの提供</Text>
      <Text style={styles.description}>
        セッション終了時の音声を匿名で提供し、音声認識の精度向上にご協力いただけます。
      </Text>
      <View style={styles.row}>
        <Text style={styles.label}>音声データを提供する</Text>
        <Switch
          value={enabled}
          onValueChange={onChange}
          trackColor={{ false: colors.border, true: colors.green }}
        />
      </View>
      <Text style={styles.privacy}>
        音声データは匿名として完全に保護され、音声認識向上のためにのみ使用され、速やかに削除されます。
      </Text>
    </View>
  );
}
