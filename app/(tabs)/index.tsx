import { View, Text, StyleSheet } from "react-native";
import { useEffect, useCallback, useMemo, useRef } from "react";
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
import {
  startDaimokuLiveActivity,
  stopDaimokuLiveActivity,
  syncDaimokuWidgetSnapshot,
  updateDaimokuLiveActivity,
} from "@/src/lib/iosLiveActivity";

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
  const liveActivityIdRef = useRef<string | null>(null);
  const liveActivityStartingRef = useRef(false);
  const sessionStartedAtRef = useRef<string | null>(null);

  useEffect(() => {
    fetchTodayTotal();
  }, [fetchTodayTotal]);

  const handleStop = useCallback(async () => {
    await stop();
    const liveActivityId = liveActivityIdRef.current;
    if (liveActivityId) {
      await stopDaimokuLiveActivity(liveActivityId, {
        count,
        elapsedSeconds,
        mode,
        todayTotal: todayTotal + count,
        updatedAt: new Date().toISOString(),
      });
      liveActivityIdRef.current = null;
    }
    sessionStartedAtRef.current = null;

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
  }, [stop, count, elapsedSeconds, mode, todayTotal, saveSession, fetchTodayTotal, audioContributionEnabled, getLastRecordingUri]);

  const handleStart = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sessionStartedAtRef.current = new Date().toISOString();
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
  const liveActivityConfigRef = useRef({
    dailyTarget,
    mode,
    todayTotal,
  });
  const liveActivitySnapshotRef = useRef({
    count,
    elapsedSeconds,
    mode,
    todayTotal,
  });

  useEffect(() => {
    liveActivityConfigRef.current = {
      dailyTarget,
      mode,
      todayTotal,
    };
  }, [dailyTarget, mode, todayTotal]);

  useEffect(() => {
    liveActivitySnapshotRef.current = {
      count,
      elapsedSeconds,
      mode,
      todayTotal,
    };
  }, [count, elapsedSeconds, mode, todayTotal]);

  useEffect(() => {
    if (!isSessionActive || liveActivityIdRef.current || liveActivityStartingRef.current) return;

    let cancelled = false;

    (async () => {
      liveActivityStartingRef.current = true;
      try {
        const startedAt = sessionStartedAtRef.current ?? new Date().toISOString();
        const {
          dailyTarget: configuredDailyTarget,
          mode: configuredMode,
          todayTotal: configuredTodayTotal,
        } = liveActivityConfigRef.current;
        const activityId = await startDaimokuLiveActivity({
          sessionId: `session-${Date.now()}`,
          startedAt,
          targetCount: configuredDailyTarget,
          count: 0,
          elapsedSeconds: 0,
          mode: configuredMode,
          todayTotal: configuredTodayTotal,
          updatedAt: new Date().toISOString(),
        });

        if (!activityId) return;

        if (!cancelled) {
          liveActivityIdRef.current = activityId;
          return;
        }

        const snapshot = liveActivitySnapshotRef.current;
        await stopDaimokuLiveActivity(activityId, {
          count: snapshot.count,
          elapsedSeconds: snapshot.elapsedSeconds,
          mode: snapshot.mode,
          todayTotal: snapshot.todayTotal + snapshot.count,
          updatedAt: new Date().toISOString(),
        });
      } finally {
        liveActivityStartingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSessionActive]);

  useEffect(() => {
    if (!isSessionActive || !liveActivityIdRef.current) return;

    updateDaimokuLiveActivity(liveActivityIdRef.current, {
      count,
      elapsedSeconds,
      mode,
      todayTotal: todayTotal + count,
      updatedAt: new Date().toISOString(),
    });
  }, [isSessionActive, count, elapsedSeconds, mode, todayTotal]);

  useEffect(() => {
    syncDaimokuWidgetSnapshot({
      count: isSessionActive ? count : 0,
      elapsedSeconds: isSessionActive ? elapsedSeconds : 0,
      mode,
      todayTotal: displayTotal,
      isRecording: isSessionActive,
      updatedAt: new Date().toISOString(),
    });
  }, [displayTotal, isSessionActive, count, elapsedSeconds, mode]);

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
