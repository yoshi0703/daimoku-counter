import { View, Text, StyleSheet } from "react-native";
import { useMemo } from "react";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING } from "@/src/constants/theme";

interface Props {
  current: number;
  target: number;
  showCount?: boolean;
}

const SIZE = 140;
const STROKE_WIDTH = 5;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function GoalProgressRing({ current, target, showCount = false }: Props) {
  const { colors } = useTheme();
  const progress = Math.min(current / Math.max(target, 1), 1);
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const isComplete = current >= target;
  const progressColor = isComplete ? colors.green : colors.primary;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          alignItems: "center",
          justifyContent: "center",
        },
        svg: {
          position: "absolute",
        },
        labelContainer: {
          alignItems: "center",
          justifyContent: "center",
          width: SIZE,
          height: SIZE,
        },
        percentage: {
          fontSize: FONT_SIZE.lg,
          fontWeight: "600",
          color: colors.primary,
        },
        countLabel: {
          fontSize: FONT_SIZE.sm,
          fontWeight: "600",
          color: colors.text,
          marginTop: 2,
        },
        targetLabel: {
          fontSize: FONT_SIZE.xs,
          color: colors.textTertiary,
          marginTop: 2,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <Svg width={SIZE} height={SIZE} style={styles.svg}>
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={colors.primaryLight}
          strokeWidth={STROKE_WIDTH}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={progressColor}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </Svg>
      <View style={styles.labelContainer}>
        <Text style={styles.percentage}>
          {Math.round(progress * 100)}%
        </Text>
        {showCount && (
          <Text style={styles.countLabel}>
            {current.toLocaleString()}遍
          </Text>
        )}
        <Text style={styles.targetLabel}>
          目標 {target.toLocaleString()}
        </Text>
      </View>
    </View>
  );
}
