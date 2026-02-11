import { View, Text, StyleSheet } from "react-native";
import { COLORS, FONT_SIZE, SPACING } from "@/src/constants/theme";
import { formatCount } from "@/src/lib/dateUtils";

interface Props {
  count: number;
}

export function CounterDisplay({ count }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.count}>{formatCount(count)}</Text>
      <Text style={styles.unit}>遍</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    fontSize: FONT_SIZE.counter,
    fontWeight: "200",
    fontVariant: ["tabular-nums"],
    color: COLORS.text,
    letterSpacing: -2,
  },
  unit: {
    fontSize: FONT_SIZE.counterUnit,
    color: COLORS.textSecondary,
    marginTop: -SPACING.sm,
  },
});
