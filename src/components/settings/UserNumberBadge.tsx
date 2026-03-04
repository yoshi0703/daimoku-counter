import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, BORDER_RADIUS } from "@/src/constants/theme";

interface Props {
  userNumber: number | null;
  loading: boolean;
}

function getTierColor(n: number): string {
  if (n <= 100) return "#D4A853";
  if (n <= 1000) return "#A0A6B4";
  if (n <= 10000) return "#C48A5C";
  return "#A0A6B4";
}

export function UserNumberBadge({ userNumber, loading }: Props) {
  const { colors } = useTheme();
  const tierColor = userNumber !== null ? getTierColor(userNumber) : "#A0A6B4";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        bar: {
          backgroundColor: tierColor,
          borderRadius: BORDER_RADIUS.full,
          paddingVertical: 10,
          paddingHorizontal: 24,
          alignSelf: "center",
        },
        number: {
          fontSize: FONT_SIZE.md,
          fontWeight: "700",
          color: "#FFFFFF",
        },
      }),
    [tierColor],
  );

  if (loading || userNumber === null) return null;

  return (
    <View style={styles.bar}>
      <Text style={styles.number}>#{userNumber}</Text>
    </View>
  );
}
