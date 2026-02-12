import { View, Text, StyleSheet } from "react-native";
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
import { useApiKeys } from "@/src/hooks/useApiKeys";
import { COLORS, SPACING, FONT_SIZE } from "@/src/constants/theme";

export default function CounterScreen() {
  useKeepAwake();

  const { deepgramKey, openaiKey } = useApiKeys();

  const {
    count,
    isListening,
    isSessionActive,
    elapsedSeconds,
    start,
    stop,
    increment,
    error,
    mode,
    lastTranscript,
  } = useDaimokuRecognition(deepgramKey, openaiKey);

  const { saveSession } = useSessionManager();
  const { goal } = useGoal();
  const { todayTotal, fetchTodayTotal } = useStats();

  useEffect(() => {
    fetchTodayTotal();
  }, [fetchTodayTotal]);

  const handleStop = useCallback(async () => {
    await stop();
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
  const usesSpeech = mode === "native" || mode === "cloud";

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
          {isSessionActive && lastTranscript ? (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptLabel}>
                モード: {mode} | 認識結果:
              </Text>
              <Text style={styles.transcriptText} numberOfLines={3}>
                {lastTranscript}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bottomSection}>
          <CounterControls
            isSessionActive={isSessionActive}
            speechAvailable={usesSpeech}
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
  transcriptBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: SPACING.sm,
    marginTop: SPACING.sm,
    width: "100%",
  },
  transcriptLabel: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginBottom: 2,
  },
  transcriptText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
});
