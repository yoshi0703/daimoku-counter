import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING } from "@/src/constants/theme";
import type { DailyRecord } from "@/src/types";

interface Props {
  records: DailyRecord[];
}

const CHART_HEIGHT = 160;

export function DailyChart({ records }: Props) {
  const { colors } = useTheme();

  const days: { label: string; count: number }[] = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const record = records.find((r) => r.date === dateStr);
    days.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      count: record?.total_count ?? 0,
    });
  }

  const maxCount = Math.max(...days.map((d) => d.count), 1);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: SPACING.md,
        },
        title: {
          fontSize: FONT_SIZE.sm,
          color: colors.textTertiary,
          marginBottom: SPACING.md,
        },
        chart: {
          flexDirection: "row",
          alignItems: "flex-end",
          height: CHART_HEIGHT + 40,
          gap: SPACING.xs,
        },
        barContainer: {
          flex: 1,
          alignItems: "center",
        },
        barValue: {
          fontSize: 10,
          color: colors.textTertiary,
          marginBottom: SPACING.xs,
        },
        barTrack: {
          height: CHART_HEIGHT,
          justifyContent: "flex-end",
          width: "100%",
          alignItems: "center",
        },
        bar: {
          width: "60%",
          borderRadius: 4,
          minHeight: 2,
        },
        barLabel: {
          fontSize: 10,
          color: colors.textTertiary,
          marginTop: SPACING.xs,
        },
        barLabelToday: {
          color: colors.text,
          fontWeight: "600",
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>過去7日間</Text>
      <View style={styles.chart}>
        {days.map((day, i) => {
          const height = (day.count / maxCount) * CHART_HEIGHT;
          const isToday = i === days.length - 1;
          return (
            <View key={day.label} style={styles.barContainer}>
              <Text style={styles.barValue}>
                {day.count > 0 ? day.count : ""}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: Math.max(height, 2),
                      backgroundColor: isToday ? colors.text : colors.border,
                    },
                  ]}
                />
              </View>
              <Text
                style={[styles.barLabel, isToday && styles.barLabelToday]}
              >
                {day.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
