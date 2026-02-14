import { Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE } from "@/src/constants/theme";
import { formatDuration } from "@/src/lib/dateUtils";

interface Props {
  elapsedSeconds: number;
}

export function SessionTimer({ elapsedSeconds }: Props) {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        timer: {
          fontSize: FONT_SIZE.xl,
          fontVariant: ["tabular-nums"],
          color: colors.textSecondary,
          fontWeight: "300",
        },
      }),
    [colors],
  );

  return (
    <Text style={styles.timer}>{formatDuration(elapsedSeconds)}</Text>
  );
}
