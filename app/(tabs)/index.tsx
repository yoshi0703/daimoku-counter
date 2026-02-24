import { AppState, type AppStateStatus, View, Text, StyleSheet } from "react-native";
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
  getDaimokuLiveActivityPushToken,
  startDaimokuLiveActivity,
  stopDaimokuLiveActivity,
  syncDaimokuWidgetSnapshot,
  updateDaimokuLiveActivity,
} from "@/src/lib/iosLiveActivity";
import { relayLiveActivityPush } from "@/src/lib/liveActivityPushRelay";

const LIVE_ACTIVITY_UPDATE_MIN_INTERVAL_MS = 4000;
const WIDGET_SYNC_MIN_INTERVAL_MS = 2000;
const PUSH_TOKEN_RETRY_MS = 1000;
const PUSH_TOKEN_MAX_ATTEMPTS = 20;

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
  const liveActivityPushTokenRef = useRef<string | null>(null);
  const liveActivityStartingRef = useRef(false);
  const sessionStartedAtRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const liveActivityLastSignatureRef = useRef<string | null>(null);
  const liveActivityLastUpdateAtRef = useRef(0);
  const liveActivityUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const widgetLastSignatureRef = useRef<string | null>(null);
  const widgetLastSyncAtRef = useRef(0);
  const widgetSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchTodayTotal();
  }, [fetchTodayTotal]);

  const handleStop = useCallback(async () => {
    await stop();
    if (liveActivityUpdateTimerRef.current) {
      clearTimeout(liveActivityUpdateTimerRef.current);
      liveActivityUpdateTimerRef.current = null;
    }
    if (widgetSyncTimerRef.current) {
      clearTimeout(widgetSyncTimerRef.current);
      widgetSyncTimerRef.current = null;
    }

    const liveActivityId = liveActivityIdRef.current;
    const liveActivityPushToken = liveActivityPushTokenRef.current;
    if (liveActivityPushToken) {
      await relayLiveActivityPush({
        pushToken: liveActivityPushToken,
        event: "end",
        contentState: {
          count,
          elapsedSeconds,
          mode,
          todayTotal: todayTotal + count,
        },
        dismissalDate: Math.floor(Date.now() / 1000),
      });
    }

    if (liveActivityId) {
      await stopDaimokuLiveActivity(liveActivityId, {
        count,
        elapsedSeconds,
        mode,
        todayTotal: todayTotal + count,
      });
      liveActivityIdRef.current = null;
    }
    liveActivityPushTokenRef.current = null;

    liveActivityLastSignatureRef.current = null;
    liveActivityLastUpdateAtRef.current = 0;

    await syncDaimokuWidgetSnapshot({
      count: 0,
      elapsedSeconds: 0,
      mode,
      todayTotal: todayTotal + count,
      isRecording: false,
    });
    widgetLastSignatureRef.current = `0|${mode}|${todayTotal + count}|0`;
    widgetLastSyncAtRef.current = Date.now();

    sessionStartedAtRef.current = null;

    const recordingUri = getLastRecordingUri();
    if (count > 0) {
      await saveSession(count, elapsedSeconds);
      await fetchTodayTotal();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (
        audioContributionEnabled &&
        recordingUri &&
        (mode === "local" || mode === "whisper" || mode === "hybrid")
      ) {
        uploadAudioContribution({
          uri: recordingUri,
          durationSeconds: elapsedSeconds,
          daimokuCount: count,
          recognitionMode: mode,
        });
      }
    }
  }, [
    stop,
    count,
    elapsedSeconds,
    mode,
    todayTotal,
    saveSession,
    fetchTodayTotal,
    audioContributionEnabled,
    getLastRecordingUri,
  ]);

  const handleStart = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sessionStartedAtRef.current = new Date().toISOString();
    liveActivityPushTokenRef.current = null;
    liveActivityLastSignatureRef.current = null;
    liveActivityLastUpdateAtRef.current = 0;
    widgetLastSignatureRef.current = null;
    await start();
  }, [start]);

  const handleTap = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    increment();
  }, [increment]);

  const displayTotal = todayTotal + (isSessionActive ? count : 0);
  const dailyTarget = goal?.daily_target ?? 100;
  const usesSpeech =
    mode === "native" ||
    mode === "cloud" ||
    mode === "local" ||
    mode === "hybrid" ||
    mode === "whisper";
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

  const clearLiveActivityUpdateTimer = useCallback(() => {
    if (liveActivityUpdateTimerRef.current) {
      clearTimeout(liveActivityUpdateTimerRef.current);
      liveActivityUpdateTimerRef.current = null;
    }
  }, []);

  const clearWidgetSyncTimer = useCallback(() => {
    if (widgetSyncTimerRef.current) {
      clearTimeout(widgetSyncTimerRef.current);
      widgetSyncTimerRef.current = null;
    }
  }, []);

  const makeLiveActivityPayload = useCallback(() => {
    const snapshot = liveActivitySnapshotRef.current;
    return {
      count: snapshot.count,
      elapsedSeconds: snapshot.elapsedSeconds,
      mode: snapshot.mode,
      todayTotal: snapshot.todayTotal + snapshot.count,
    };
  }, []);

  const makeWidgetPayload = useCallback(() => {
    const snapshot = liveActivitySnapshotRef.current;
    const recording = isSessionActive;
    return {
      count: recording ? snapshot.count : 0,
      elapsedSeconds: recording ? snapshot.elapsedSeconds : 0,
      mode: snapshot.mode,
      todayTotal: snapshot.todayTotal + (recording ? snapshot.count : 0),
      isRecording: recording,
    };
  }, [isSessionActive]);

  const flushLiveActivityUpdate = useCallback((force: boolean) => {
    if (!isSessionActive) return;
    const activityId = liveActivityIdRef.current;
    if (!activityId) return;

    const payload = makeLiveActivityPayload();
    const signature = `${payload.count}|${payload.mode}|${payload.todayTotal}`;
    if (!force && signature === liveActivityLastSignatureRef.current) {
      return;
    }

    liveActivityLastSignatureRef.current = signature;
    liveActivityLastUpdateAtRef.current = Date.now();
    void updateDaimokuLiveActivity(activityId, payload);

    const liveActivityPushToken = liveActivityPushTokenRef.current;
    if (liveActivityPushToken && appStateRef.current !== "active") {
      void relayLiveActivityPush({
        pushToken: liveActivityPushToken,
        event: "update",
        contentState: {
          count: payload.count ?? 0,
          elapsedSeconds: payload.elapsedSeconds ?? 0,
          mode: payload.mode ?? "manual",
          todayTotal: payload.todayTotal ?? 0,
        },
        staleDate: Math.floor(Date.now() / 1000) + 120,
      });
    }
  }, [isSessionActive, makeLiveActivityPayload]);

  const scheduleLiveActivityUpdate = useCallback((force = false) => {
    if (!isSessionActive || !liveActivityIdRef.current) return;

    if (force) {
      clearLiveActivityUpdateTimer();
      flushLiveActivityUpdate(true);
      return;
    }

    const sinceLast = Date.now() - liveActivityLastUpdateAtRef.current;
    const waitMs = LIVE_ACTIVITY_UPDATE_MIN_INTERVAL_MS - sinceLast;
    if (waitMs <= 0) {
      flushLiveActivityUpdate(false);
      return;
    }

    if (liveActivityUpdateTimerRef.current) return;

    liveActivityUpdateTimerRef.current = setTimeout(() => {
      liveActivityUpdateTimerRef.current = null;
      flushLiveActivityUpdate(false);
    }, waitMs);
  }, [clearLiveActivityUpdateTimer, flushLiveActivityUpdate, isSessionActive]);

  const flushWidgetSnapshotSync = useCallback((force: boolean) => {
    const payload = makeWidgetPayload();
    const signature = `${payload.count}|${payload.mode}|${payload.todayTotal}|${payload.isRecording ? 1 : 0}`;
    if (!force && signature === widgetLastSignatureRef.current) {
      return;
    }

    widgetLastSignatureRef.current = signature;
    widgetLastSyncAtRef.current = Date.now();
    void syncDaimokuWidgetSnapshot(payload);
  }, [makeWidgetPayload]);

  const scheduleWidgetSnapshotSync = useCallback((force = false) => {
    if (force) {
      clearWidgetSyncTimer();
      flushWidgetSnapshotSync(true);
      return;
    }

    const sinceLast = Date.now() - widgetLastSyncAtRef.current;
    const waitMs = WIDGET_SYNC_MIN_INTERVAL_MS - sinceLast;
    if (waitMs <= 0) {
      flushWidgetSnapshotSync(false);
      return;
    }

    if (widgetSyncTimerRef.current) return;

    widgetSyncTimerRef.current = setTimeout(() => {
      widgetSyncTimerRef.current = null;
      flushWidgetSnapshotSync(false);
    }, waitMs);
  }, [clearWidgetSyncTimer, flushWidgetSnapshotSync]);

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
        });

        if (!activityId) return;

        if (!cancelled) {
          liveActivityIdRef.current = activityId;
          (async () => {
            for (let attempt = 0; attempt < PUSH_TOKEN_MAX_ATTEMPTS; attempt += 1) {
              if (cancelled || liveActivityIdRef.current !== activityId) return;

              const pushToken = await getDaimokuLiveActivityPushToken(activityId);
              if (pushToken) {
                liveActivityPushTokenRef.current = pushToken;
                return;
              }

              await new Promise((resolve) => setTimeout(resolve, PUSH_TOKEN_RETRY_MS));
            }
          })();
          scheduleLiveActivityUpdate(true);
          return;
        }

        const snapshot = liveActivitySnapshotRef.current;
        await stopDaimokuLiveActivity(activityId, {
          count: snapshot.count,
          elapsedSeconds: snapshot.elapsedSeconds,
          mode: snapshot.mode,
          todayTotal: snapshot.todayTotal + snapshot.count,
        });
      } finally {
        liveActivityStartingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSessionActive, scheduleLiveActivityUpdate]);

  useEffect(() => {
    if (!isSessionActive || !liveActivityIdRef.current) return;
    scheduleLiveActivityUpdate(false);
  }, [isSessionActive, count, mode, todayTotal, scheduleLiveActivityUpdate]);

  useEffect(() => {
    scheduleWidgetSnapshotSync(false);
  }, [isSessionActive, count, mode, todayTotal, scheduleWidgetSnapshotSync]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;
      if (!isSessionActive) return;

      const movedToBackground = nextState === "inactive" || nextState === "background";
      const returnedToForeground =
        (prevState === "inactive" || prevState === "background") && nextState === "active";

      if (movedToBackground || returnedToForeground) {
        scheduleWidgetSnapshotSync(true);
        scheduleLiveActivityUpdate(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isSessionActive, scheduleLiveActivityUpdate, scheduleWidgetSnapshotSync]);

  useEffect(() => {
    return () => {
      clearLiveActivityUpdateTimer();
      clearWidgetSyncTimer();
    };
  }, [clearLiveActivityUpdateTimer, clearWidgetSyncTimer]);

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
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
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
