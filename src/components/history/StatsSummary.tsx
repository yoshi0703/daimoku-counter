import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING } from "@/src/constants/theme";
import type { DailyRecord } from "@/src/types";

interface Props {
  records: DailyRecord[];
}

export function StatsSummary({ records }: Props) {
  const { colors } = useTheme();

  const totalCount = records.reduce((sum, r) => sum + r.total_count, 0);
  const daysActive = records.length;
  const avgPerDay = daysActive > 0 ? Math.round(totalCount / daysActive) : 0;

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    if (records.some((r) => r.date === dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  const stats = [
    { label: "連続", value: `${streak}日` },
    { label: "合計", value: totalCount.toLocaleString() },
    { label: "日平均", value: avgPerDay.toLocaleString() },
  ];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flexDirection: "row",
          gap: SPACING.sm,
        },
        card: {
          flex: 1,
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: SPACING.md,
          alignItems: "center",
        },
        value: {
          fontSize: FONT_SIZE.xl,
          fontWeight: "600",
          color: colors.text,
        },
        label: {
          fontSize: FONT_SIZE.xs,
          color: colors.textTertiary,
          marginTop: SPACING.xs,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      {stats.map((stat) => (
        <View key={stat.label} style={styles.card}>
          <Text style={styles.value}>{stat.value}</Text>
          <Text style={styles.label}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}
