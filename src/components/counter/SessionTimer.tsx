import { Text, StyleSheet } from "react-native";
import { COLORS, FONT_SIZE } from "@/src/constants/theme";
import { formatDuration } from "@/src/lib/dateUtils";

interface Props {
  elapsedSeconds: number;
}

export function SessionTimer({ elapsedSeconds }: Props) {
  return (
    <Text style={styles.timer}>{formatDuration(elapsedSeconds)}</Text>
  );
}

const styles = StyleSheet.create({
  timer: {
    fontSize: FONT_SIZE.xl,
    fontVariant: ["tabular-nums"],
    color: COLORS.textSecondary,
    fontWeight: "300",
  },
});
