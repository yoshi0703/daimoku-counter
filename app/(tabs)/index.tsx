import { View, StyleSheet } from "react-native";
import { useEffect, useCallback } from "react";
import { useKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";

import { CounterDisplay } from "@/src/components/counter/CounterDisplay";
import { CounterControls } from "@/src/components/counter/CounterControls";
import { SessionTimer } from "@/src/components/counter/SessionTimer";
import { GoalProgressRing } from "@/src/components/counter/GoalProgressRing";
import { RecognitionStatus } from "@/src/components/counter/RecognitionStatus";
import { useDaimokuRecognition } from "@/src/hooks/useDaimokuRecognition";
import { useSessionManager } from "@/src/hooks/useSessionManager";
import { useGoal } from "@/src/hooks/useGoal";
import { useStats } from "@/src/hooks/useStats";
import { COLORS, SPACING } from "@/src/constants/theme";

export default function CounterScreen() {
  useKeepAwake();

  const {
    count,
    isListening,
    isSessionActive,
    elapsedSeconds,
    start,
    stop,
    increment,
    error,
    speechAvailable,
  } = useDaimokuRecognition();

  const { saveSession } = useSessionManager();
  const { goal } = useGoal();
  const { todayTotal, fetchTodayTotal } = useStats();

  useEffect(() => {
    fetchTodayTotal();
  }, [fetchTodayTotal]);

  const handleStop = useCallback(async () => {
    stop();
    if (count > 0) {
      await saveSession(count, elapsedSeconds);
      await fetchTodayTotal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [stop, count, elapsedSeconds, saveSession, fetchTodayTotal]);

  const handleStart = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await start();
  }, [start]);

  const handleTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    increment();
  }, [increment]);

  const displayTotal = todayTotal + (isSessionActive ? count : 0);
  const dailyTarget = goal?.daily_target ?? 100;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.content}>
        <View style={styles.topSection}>
          <GoalProgressRing current={displayTotal} target={dailyTarget} />
        </View>

        <View style={styles.centerSection}>
          <CounterDisplay count={isSessionActive ? count : displayTotal} />
          {isSessionActive && (
            <SessionTimer elapsedSeconds={elapsedSeconds} />
          )}
          <RecognitionStatus isListening={isListening} error={error} />
        </View>

        <View style={styles.bottomSection}>
          <CounterControls
            isSessionActive={isSessionActive}
            speechAvailable={speechAvailable}
            onStart={handleStart}
            onStop={handleStop}
            onTap={handleTap}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  topSection: {
    alignItems: "center",
    paddingTop: SPACING.xl,
  },
  centerSection: {
    alignItems: "center",
    gap: SPACING.sm,
  },
  bottomSection: {
    paddingBottom: SPACING.md,
  },
});
