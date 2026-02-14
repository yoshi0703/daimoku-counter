import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING } from "@/src/constants/theme";
import { formatCount } from "@/src/lib/dateUtils";

interface Props {
  count: number;
}

export function CounterDisplay({ count }: Props) {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          alignItems: "center",
          justifyContent: "center",
        },
        count: {
          fontSize: FONT_SIZE.counter,
          fontWeight: "200",
          fontVariant: ["tabular-nums"],
          color: colors.text,
          letterSpacing: -2,
        },
        unit: {
          fontSize: FONT_SIZE.counterUnit,
          color: colors.textSecondary,
          marginTop: -SPACING.sm,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.count}>{formatCount(count)}</Text>
      <Text style={styles.unit}>遍</Text>
    </View>
  );
}
