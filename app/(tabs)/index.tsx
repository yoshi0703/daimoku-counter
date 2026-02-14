import { View, Text, StyleSheet } from "react-native";
import { useEffect, useCallback, useMemo } from "react";
import { useKeepAwake } from "expo-keep-awake";
import * as Haptics from "expo-haptics";
import { SafeAreaView } from "react-native-safe-area-context";

import { CounterDisplay } from "@/src/components/counter/CounterDisplay";
import { CounterControls } from "@/src/components/counter/CounterControls";
import { SessionTimer } from "@/src/components/counter/SessionTimer";
import { GoalProgressRing } from "@/src/components/counter/GoalProgressRing";
import { RecognitionStatus } from "@/src/components/counter/RecognitionStatus";
import { useDaimokuRecognition } from "@/src/hooks/useDaimokuRecognition";
import { uploadAudioContribution } from "@/src/lib/audioContributionUploader";
import { useSessionManager } from "@/src/hooks/useSessionManager";
import { useGoal } from "@/src/hooks/useGoal";
import { useStats } from "@/src/hooks/useStats";
import { useApiKeys } from "@/src/hooks/useApiKeys";
import { useTheme } from "@/src/contexts/ThemeContext";
import { SPACING, FONT_SIZE } from "@/src/constants/theme";

export default function CounterScreen() {
  useKeepAwake();
  const { colors } = useTheme();

  const { deepgramKey, openaiKey, getDeepgramToken, recognitionMode, audioContributionEnabled } = useApiKeys();

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
    cloudRecorderEngine,
    getLastRecordingUri,
  } = useDaimokuRecognition(
    deepgramKey,
    openaiKey,
    getDeepgramToken,
    recognitionMode,
  );

  const { saveSession } = useSessionManager();
  const { goal } = useGoal();
  const { todayTotal, fetchTodayTotal } = useStats();

  useEffect(() => {
    fetchTodayTotal();
  }, [fetchTodayTotal]);

  const handleStop = useCallback(async () => {
    await stop();
    const recordingUri = getLastRecordingUri();
    if (count > 0) {
      await saveSession(count, elapsedSeconds);
      await fetchTodayTotal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (audioContributionEnabled && recordingUri && mode === "local") {
        uploadAudioContribution({
          uri: recordingUri,
          durationSeconds: elapsedSeconds,
          daimokuCount: count,
          recognitionMode: mode,
        });
      }
    }
  }, [stop, count, elapsedSeconds, saveSession, fetchTodayTotal, audioContributionEnabled, getLastRecordingUri, mode]);

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
  const usesSpeech = mode === "native" || mode === "cloud" || mode === "local";
  const showDebugTranscript = __DEV__;
  const modeLabel = mode === "cloud"
    ? `${mode} (${cloudRecorderEngine})`
    : mode;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
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
          backgroundColor: colors.surface,
          borderRadius: 8,
          padding: SPACING.sm,
          marginTop: SPACING.sm,
          width: "100%",
        },
        transcriptLabel: {
          fontSize: 11,
          color: colors.textTertiary,
          marginBottom: 2,
        },
        transcriptText: {
          fontSize: FONT_SIZE.sm,
          color: colors.textSecondary,
        },
      }),
    [colors],
  );

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
          {showDebugTranscript && isSessionActive && lastTranscript ? (
            <View style={styles.transcriptBox}>
              <Text style={styles.transcriptLabel}>
                モード: {modeLabel} | 認識結果:
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
