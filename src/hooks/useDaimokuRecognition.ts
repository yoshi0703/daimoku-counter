import { useRef, useState, useCallback, useEffect } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from "expo-audio";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import type { AudioRecorder } from "expo-audio";
import type { RecognitionModePreference } from "@/src/hooks/useApiKeys";
import {
  DaimokuCounter,
  countOccurrences,
  getDaimokuContextualStrings,
  selectBestDaimokuTranscript,
} from "@/src/lib/daimokuCounter";
import {
  isLocalWhisperSupported,
  transcribeWithLocalWhisper,
  warmupLocalWhisper,
} from "@/src/lib/localWhisper";
import { beginIosBackgroundTask, endIosBackgroundTask } from "@/src/lib/iosBackgroundTask";
import { transcribeAudio } from "@/src/lib/transcriptionService";

// expo-speech-recognition をランタイムで安全にインポート
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = () => {};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch {
  // Expo Go では利用不可
}

function isNativeOnDeviceRecognitionAvailable(): boolean {
  if (!ExpoSpeechRecognitionModule) return false;

  try {
    if (typeof ExpoSpeechRecognitionModule.supportsOnDeviceRecognition === "function") {
      return Boolean(ExpoSpeechRecognitionModule.supportsOnDeviceRecognition());
    }
  } catch {
    // ignore and assume available
  }

  return true;
}

/** 録音チャンクの長さ（ミリ秒） */
const CHUNK_DURATION_MS = 15000;
type CloudRecorderEngine = "expo-audio" | "expo-av";
type RecognitionMode = "native" | "cloud" | "local" | "whisper" | "hybrid" | "manual";
type PendingHybridFinalization = {
  uri: string;
  nativeCount: number;
  manualIncrement: number;
  createdAt: number;
};

// Expo Go 向けローカル推定モード（メータリングベース）
// v2: 実録音(51回/60秒)で検証済みパラメータ — 高速唱題(~1.18s/cycle)対応
const LOCAL_PROGRESS_UPDATE_MS = 120;
const LOCAL_MIN_GAP_MS = 380;
const LOCAL_MAX_GAP_MS = 1900;
const LOCAL_THRESHOLD_OFFSET_DB = 1.2;
const LOCAL_THRESHOLD_FLOOR_DB = -42;
const LOCAL_PEAK_PROMINENCE_DB = 1.2;
const HYBRID_PROGRESS_UPDATE_MS = 150;
const HYBRID_MIN_SEGMENT_MS = 1800;
const HYBRID_SILENCE_HOLD_MS = 900;
const HYBRID_SPEECH_MARGIN_DB = 6;
const HYBRID_NOISE_FLOOR_DB = -42;
const NATIVE_RESTART_INTERVAL_MS = 45_000;
const NATIVE_RESTART_RESUME_DELAY_MS = 180;
const NATIVE_RESTART_HARD_LIMIT_MS = 58_000;
const NATIVE_RESTART_SILENCE_WINDOW_MS = 450;
const FOREGROUND_RECOVERY_DELAY_MS = 400;
const NATIVE_STALL_CHECK_INTERVAL_MS = 1_000;
const NATIVE_STALL_WITH_SPEECH_MS = 6_000;
const PENDING_HYBRID_FINALIZATION_KEY = "@pending_hybrid_finalization_v1";

/** Whisper最適化録音プリセット: 16kHz mono（Whisperの入力仕様に合わせてリサンプルを省略） */
const WHISPER_OPTIMIZED_RECORDING = {
  ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  ios: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  android: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 64000,
  },
};

/** ハイブリッドモード用AudioSession設定（expo-speech-recognitionのiosCategoryと整合） */
const HYBRID_AUDIO_MODE = {
  allowsRecordingIOS: true,
  interruptionModeIOS: 0 as const, // InterruptionModeIOS.MixWithOthers
  playsInSilentModeIOS: true,
  staysActiveInBackground: true,
  interruptionModeAndroid: 2 as const, // InterruptionModeAndroid.DuckOthers
  playThroughEarpieceAndroid: false,
  shouldDuckAndroid: true,
};

export function useDaimokuRecognition(
  deepgramKey: string | null,
  openaiKey: string | null,
  getDeepgramToken?: () => Promise<string | null>,
  preferredMode: RecognitionModePreference = "cloud",
) {
  const [count, setCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<RecognitionMode>("manual");
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [cloudRecorderEngine, setCloudRecorderEngine] = useState<CloudRecorderEngine>("expo-audio");
  const latestCountRef = useRef(0);

  const sessionActiveRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const counter = useRef(new DaimokuCounter());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeResumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeStallCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nativeRestartPendingRef = useRef(false);
  const nativeSoftRestartRequestedAtRef = useRef(0);
  const nativeHardRestartDeadlineAtRef = useRef(0);
  const nativeLastResultAtRef = useRef(0);
  const nativeLastSpeechDetectedAtRef = useRef(0);
  const cloudCountRef = useRef(0);
  const whisperCountRef = useRef(0);
  const cloudRecorderEngineRef = useRef<CloudRecorderEngine>("expo-audio");
  const avRecordingRef = useRef<Audio.Recording | null>(null);
  const localRecordingRef = useRef<Audio.Recording | null>(null);
  const localNoiseFloorDbRef = useRef(-70);
  const localLastPulseAtMsRef = useRef(0);
  const localPrevDbRef = useRef<number | null>(null);
  const localPrevPrevDbRef = useRef<number | null>(null);
  const localPrevSampleTimeMsRef = useRef<number | null>(null);
  const localRecentIntervalsRef = useRef<number[]>([]);
  const lastRecordingUriRef = useRef<string | null>(null);
  const nativeCountRef = useRef(0);
  const hybridRecordingRef = useRef<Audio.Recording | null>(null);
  const hybridNoiseFloorDbRef = useRef(-55);
  const hybridLastSpeechAtMsRef = useRef(0);
  const hybridSegmentStartedAtMsRef = useRef(0);
  const hybridSawSpeechRef = useRef(false);
  const hybridSplittingRef = useRef(false);
  const hybridWhisperCountRef = useRef(0);
  const hybridWhisperChunksRef = useRef(0);
  const hybridWhisperQueueRef = useRef(Promise.resolve());
  const hybridFinalizationInFlightRef = useRef(false);
  const manualIncrementRef = useRef(0);
  const consecutiveErrorsRef = useRef(0);
  const stopInProgressRef = useRef(false);
  const waitForHybridSplitSettle = useCallback(async () => {
    while (hybridSplittingRef.current) {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
  }, []);

  // Ref でキーを保持（クロージャーの stale 値問題を回避）
  const deepgramKeyRef = useRef(deepgramKey);
  deepgramKeyRef.current = deepgramKey;
  const openaiKeyRef = useRef(openaiKey);
  openaiKeyRef.current = openaiKey;
  const getDeepgramTokenRef = useRef(getDeepgramToken);
  getDeepgramTokenRef.current = getDeepgramToken;

  // expo-audio の AudioRecorder フック（HIGH_QUALITY プリセット使用）
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderRef = useRef<AudioRecorder>(recorder);
  recorderRef.current = recorder;

  const setCountValue = useCallback((next: number) => {
    latestCountRef.current = next;
    setCount(next);
  }, []);

  const setCountValueNonDecreasing = useCallback((next: number) => {
    const clamped = Math.max(latestCountRef.current, next);
    latestCountRef.current = clamped;
    setCount(clamped);
  }, []);

  const incrementCountValue = useCallback((delta = 1) => {
    latestCountRef.current += delta;
    setCount(latestCountRef.current);
  }, []);

  const switchCloudRecorderEngine = useCallback((engine: CloudRecorderEngine) => {
    cloudRecorderEngineRef.current = engine;
    setCloudRecorderEngine(engine);
  }, []);

  const savePendingHybridFinalization = useCallback(async (payload: PendingHybridFinalization) => {
    try {
      await AsyncStorage.setItem(PENDING_HYBRID_FINALIZATION_KEY, JSON.stringify(payload));
    } catch (storageError) {
      console.warn("savePendingHybridFinalization error:", storageError);
    }
  }, []);

  const loadPendingHybridFinalization = useCallback(async (): Promise<PendingHybridFinalization | null> => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_HYBRID_FINALIZATION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<PendingHybridFinalization>;
      if (
        typeof parsed?.uri !== "string" ||
        typeof parsed?.nativeCount !== "number" ||
        typeof parsed?.manualIncrement !== "number"
      ) {
        await AsyncStorage.removeItem(PENDING_HYBRID_FINALIZATION_KEY);
        return null;
      }
      return {
        uri: parsed.uri,
        nativeCount: parsed.nativeCount,
        manualIncrement: parsed.manualIncrement,
        createdAt:
          typeof parsed.createdAt === "number" ? parsed.createdAt : Date.now(),
      };
    } catch (storageError) {
      console.warn("loadPendingHybridFinalization error:", storageError);
      return null;
    }
  }, []);

  const clearPendingHybridFinalization = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(PENDING_HYBRID_FINALIZATION_KEY);
    } catch (storageError) {
      console.warn("clearPendingHybridFinalization error:", storageError);
    }
  }, []);

  const clearNativeRestartTimer = useCallback(() => {
    if (nativeRestartTimerRef.current) {
      clearTimeout(nativeRestartTimerRef.current);
      nativeRestartTimerRef.current = null;
    }
  }, []);

  const clearNativeResumeTimer = useCallback(() => {
    if (nativeResumeTimerRef.current) {
      clearTimeout(nativeResumeTimerRef.current);
      nativeResumeTimerRef.current = null;
    }
  }, []);

  const clearNativeStallCheckTimer = useCallback(() => {
    if (nativeStallCheckTimerRef.current) {
      clearInterval(nativeStallCheckTimerRef.current);
      nativeStallCheckTimerRef.current = null;
    }
  }, []);

  const syncHybridDisplayedCount = useCallback((transcript?: string) => {
    const verifiedBaseCount = Math.max(
      nativeCountRef.current,
      hybridWhisperCountRef.current,
    );
    const nextCount = verifiedBaseCount + manualIncrementRef.current;
    setCountValueNonDecreasing(nextCount);
    if (transcript) {
      setLastTranscript(
        `${transcript} [real-time:${nativeCountRef.current} / verified:${hybridWhisperCountRef.current} / total:${nextCount}]`,
      );
    }
    return nextCount;
  }, [setCountValueNonDecreasing]);

  const ensureCloudRecordingPermission = useCallback(async () => {
    try {
      const expoAudioPermission = await requestRecordingPermissionsAsync();
      if (expoAudioPermission.granted) return true;
    } catch {
      // ignore and try expo-av permission API
    }

    try {
      const expoAvPermission = await Audio.requestPermissionsAsync();
      return expoAvPermission.granted;
    } catch {
      return false;
    }
  }, []);

  const startExpoAudioRecording = useCallback(async () => {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      allowsBackgroundRecording: true,
      interruptionMode: "mixWithOthers",
    });

    const rec = recorderRef.current;
    await rec.prepareToRecordAsync();
    rec.record();
  }, []);

  const startExpoAvRecording = useCallback(async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      playThroughEarpieceAndroid: false,
      shouldDuckAndroid: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();
    avRecordingRef.current = recording;
  }, []);

  const startCloudRecording = useCallback(async (): Promise<CloudRecorderEngine> => {
    const currentEngine = cloudRecorderEngineRef.current;

    if (currentEngine === "expo-audio") {
      try {
        await startExpoAudioRecording();
        return "expo-audio";
      } catch (error) {
        console.warn("expo-audio recorder failed, switching to expo-av", error);
        switchCloudRecorderEngine("expo-av");
      }
    }

    await startExpoAvRecording();
    return "expo-av";
  }, [startExpoAudioRecording, startExpoAvRecording, switchCloudRecorderEngine]);

  const stopCloudRecordingInternal = useCallback(async (): Promise<string | null> => {
    if (cloudRecorderEngineRef.current === "expo-av") {
      const recording = avRecordingRef.current;
      if (!recording) return null;
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      avRecordingRef.current = null;
      return uri ?? null;
    }

    const rec = recorderRef.current;
    await rec.stop();
    return rec.uri ?? null;
  }, []);

  // 起動時にモード判定
  useEffect(() => {
    const hasDeepgramKey = Boolean(deepgramKey?.trim());
    const hasOpenaiKey = Boolean(openaiKey?.trim());
    const cloudAvailable = hasDeepgramKey || hasOpenaiKey;
    const nativeAvailable = isNativeOnDeviceRecognitionAvailable();
    const whisperAvailable = isLocalWhisperSupported();
    const localMeteringAvailable = true;
    const shouldPreferHybridOnIos =
      Platform.OS === "ios" && nativeAvailable && whisperAvailable;

    setSpeechAvailable(
      nativeAvailable ||
      cloudAvailable ||
      whisperAvailable ||
      localMeteringAvailable,
    );

    if (shouldPreferHybridOnIos) {
      setMode("hybrid");
      return;
    }

    if (preferredMode === "cloud" && cloudAvailable) {
      setMode("cloud");
      return;
    }

    if (preferredMode === "local") {
      if (nativeAvailable && whisperAvailable) {
        setMode("hybrid");
        return;
      }
      if (whisperAvailable) {
        setMode("whisper");
        return;
      }
      if (nativeAvailable) {
        setMode("native");
        return;
      }
      if (localMeteringAvailable) {
        setMode("local");
        return;
      }
    }

    if (nativeAvailable) {
      setMode("native");
    } else if (cloudAvailable) {
      setMode("cloud");
    } else if (localMeteringAvailable) {
      setMode("local");
    } else {
      setMode("manual");
    }
  }, [deepgramKey, openaiKey, preferredMode]);

  // ===== ネイティブ音声認識 =====
  const startRecognition = useCallback(() => {
    if (!ExpoSpeechRecognitionModule) return;
    ExpoSpeechRecognitionModule.start({
      lang: "ja-JP",
      interimResults: true,
      maxAlternatives: 5,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: false,
      iosTaskHint: "dictation",
      contextualStrings: getDaimokuContextualStrings(),
      iosCategory: {
        category: "playAndRecord",
        categoryOptions: ["defaultToSpeaker", "allowBluetooth", "mixWithOthers"],
        mode: "measurement",
      },
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: HYBRID_PROGRESS_UPDATE_MS,
      },
    });
  }, []);

  const resumeNativeRecognition = useCallback((delayMs: number) => {
    if (!ExpoSpeechRecognitionModule || !sessionActiveRef.current) return;
    clearNativeResumeTimer();
    nativeRestartPendingRef.current = true;
    nativeResumeTimerRef.current = setTimeout(() => {
      nativeResumeTimerRef.current = null;
      if (!sessionActiveRef.current) {
        nativeRestartPendingRef.current = false;
        return;
      }
      nativeRestartPendingRef.current = false;
      startRecognition();
    }, delayMs);
  }, [clearNativeResumeTimer, startRecognition]);

  const restartNativeRecognition = useCallback((
    delayMs = NATIVE_RESTART_RESUME_DELAY_MS,
    method: "abort" | "stop" = "abort",
  ) => {
    if (!ExpoSpeechRecognitionModule || !sessionActiveRef.current || nativeRestartPendingRef.current) {
      return;
    }

    clearNativeRestartTimer();
    counter.current.onRecognitionRestart();
    nativeRestartPendingRef.current = true;

    try {
      if (method === "abort" && typeof ExpoSpeechRecognitionModule.abort === "function") {
        ExpoSpeechRecognitionModule.abort();
      } else {
        ExpoSpeechRecognitionModule.stop();
      }
    } catch {
      nativeRestartPendingRef.current = false;
      resumeNativeRecognition(delayMs);
    }
  }, [clearNativeRestartTimer, resumeNativeRecognition]);

  const scheduleNativeRecognitionWatchdog = useCallback(() => {
    if (!ExpoSpeechRecognitionModule || !sessionActiveRef.current) return;
    clearNativeRestartTimer();
    nativeRestartTimerRef.current = setTimeout(() => {
      nativeRestartTimerRef.current = null;
      nativeSoftRestartRequestedAtRef.current = Date.now();
      nativeHardRestartDeadlineAtRef.current =
        nativeSoftRestartRequestedAtRef.current + (NATIVE_RESTART_HARD_LIMIT_MS - NATIVE_RESTART_INTERVAL_MS);
      if (mode === "native") {
        restartNativeRecognition();
      }
    }, NATIVE_RESTART_INTERVAL_MS);
  }, [clearNativeRestartTimer, mode, restartNativeRecognition]);

  const startNativeStallMonitor = useCallback(() => {
    if (!ExpoSpeechRecognitionModule) return;
    clearNativeStallCheckTimer();
    nativeStallCheckTimerRef.current = setInterval(() => {
      if (!sessionActiveRef.current || nativeRestartPendingRef.current) return;
      if (appStateRef.current !== "active") return;
      if (mode !== "native" && mode !== "hybrid") return;

      const lastSpeechAt = nativeLastSpeechDetectedAtRef.current;
      if (lastSpeechAt === 0) return;

      const now = Date.now();
      const sinceSpeechMs = now - lastSpeechAt;
      const sinceResultMs = nativeLastResultAtRef.current > 0
        ? now - nativeLastResultAtRef.current
        : Number.POSITIVE_INFINITY;

      const softRestartRequestedAt = nativeSoftRestartRequestedAtRef.current;
      const hardRestartDeadlineAt = nativeHardRestartDeadlineAtRef.current;
      if (mode === "hybrid" && softRestartRequestedAt > 0) {
        const reachedSilenceWindow = sinceSpeechMs >= NATIVE_RESTART_SILENCE_WINDOW_MS;
        const reachedHardDeadline =
          hardRestartDeadlineAt > 0 && now >= hardRestartDeadlineAt;

        if (reachedSilenceWindow || reachedHardDeadline) {
          nativeSoftRestartRequestedAtRef.current = 0;
          nativeHardRestartDeadlineAtRef.current = 0;
          setLastTranscript(
            reachedSilenceWindow
              ? "息継ぎのタイミングで認識を最適化しています..."
              : "認識の安定化のため自動再起動しています...",
          );
          restartNativeRecognition(
            reachedSilenceWindow
              ? NATIVE_RESTART_RESUME_DELAY_MS
              : FOREGROUND_RECOVERY_DELAY_MS,
          );
          return;
        }
      }

      if (
        sinceSpeechMs <= NATIVE_STALL_WITH_SPEECH_MS &&
        sinceResultMs >= NATIVE_STALL_WITH_SPEECH_MS
      ) {
        setLastTranscript("音声入力は続いていますが認識が停止したため、自動復旧しています...");
        restartNativeRecognition(FOREGROUND_RECOVERY_DELAY_MS);
      }
    }, NATIVE_STALL_CHECK_INTERVAL_MS);
  }, [clearNativeStallCheckTimer, mode, restartNativeRecognition]);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    nativeLastResultAtRef.current = Date.now();
    scheduleNativeRecognitionWatchdog();
    startNativeStallMonitor();
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
    if (sessionActiveRef.current) {
      if (nativeRestartPendingRef.current) {
        resumeNativeRecognition(NATIVE_RESTART_RESUME_DELAY_MS);
        return;
      }
      counter.current.onRecognitionRestart();
      const delay = consecutiveErrorsRef.current === 0 ? 50 : Math.min(100 * Math.pow(2, consecutiveErrorsRef.current), 3000);
      resumeNativeRecognition(delay);
    }
  });

  useSpeechRecognitionEvent("result", (event: any) => {
    consecutiveErrorsRef.current = 0;
    nativeLastResultAtRef.current = Date.now();
    nativeLastSpeechDetectedAtRef.current = nativeLastResultAtRef.current;
    const transcript = selectBestDaimokuTranscript(event.results);
    const isFinal = event.isFinal;
    const newCount = counter.current.processResult(transcript, isFinal);
    nativeCountRef.current = newCount;
    setCountValueNonDecreasing(newCount + manualIncrementRef.current);
    setLastTranscript(transcript);
  });

  useSpeechRecognitionEvent("volumechange", (event: any) => {
    if (typeof event?.value === "number" && event.value > 0) {
      nativeLastSpeechDetectedAtRef.current = Date.now();
    }
  });

  useSpeechRecognitionEvent("error", (event: any) => {
    const errorCode = event?.error ?? event?.code ?? event?.message;
    if (errorCode === "aborted") {
      return;
    }
    consecutiveErrorsRef.current += 1;
    setError(event.message);
    if (sessionActiveRef.current && event.error !== "not-allowed") {
      if (consecutiveErrorsRef.current >= 5) {
        setError("音声認識の接続に繰り返し失敗しました。停止して再開してください。");
        setLastTranscript("音声認識エラーが続いています。一度停止してから再開してください。");
        return;
      }
      const delay = Math.min(200 * Math.pow(2, consecutiveErrorsRef.current - 1), 3000);
      counter.current.onRecognitionRestart();
      if (!nativeRestartPendingRef.current) {
        resumeNativeRecognition(delay);
      }
    }
  });

  // ===== クラウド音声認識 =====
  const processChunk = useCallback(async (uri: string) => {
    // Ref から最新の値を取得（stale closure 回避）
    const dgKey = deepgramKeyRef.current?.trim() || null;
    const oaKey = openaiKeyRef.current?.trim() || null;
    const getToken = getDeepgramTokenRef.current;

    const token = getToken && !dgKey ? await getToken() : null;
    const result = await transcribeAudio(uri, dgKey, oaKey, token);

    if (result.success) {
      const textCount = result.transcript
        ? countOccurrences(result.transcript)
        : 0;
      const chunkCount = result.searchHits ?? textCount;

      const debugInfo = result.searchHits != null
        ? `[音響:${result.searchHits} テキスト:${textCount}]`
        : `[テキスト:${textCount}]`;

      setLastTranscript(
        result.transcript
          ? `${debugInfo} ${result.transcript}`
          : "(無音)",
      );

      if (chunkCount > 0) {
        cloudCountRef.current += chunkCount;
        setCountValue(cloudCountRef.current);
      }
    } else {
      setError(result.error ?? "文字起こしエラー");
      setLastTranscript(`エラー: ${result.error}`);
    }
  }, []);

  const startCloudChunk = useCallback(async () => {
    if (!sessionActiveRef.current) return;

    try {
      const recorderEngine = await startCloudRecording();
      setIsListening(true);
      setError(null);
      setLastTranscript(`録音中... (${recorderEngine})`);

      chunkTimerRef.current = setTimeout(async () => {
        if (!sessionActiveRef.current) return;

        try {
          const uri = await stopCloudRecordingInternal();

          if (uri) {
            setLastTranscript("文字起こし中...");
            await processChunk(uri);
          } else {
            setLastTranscript("録音データが取得できませんでした");
          }
        } catch (stopError: any) {
          setError(`録音停止エラー: ${stopError?.message ?? "unknown"}`);
          setLastTranscript("録音停止エラー");
        }

        if (sessionActiveRef.current) {
          startCloudChunk();
        }
      }, CHUNK_DURATION_MS);
    } catch (e: any) {
      setError(`録音エラー: ${e.message}`);
      setLastTranscript(`録音エラー詳細: ${e.message}`);
      setIsListening(false);
    }
  }, [processChunk, startCloudRecording, stopCloudRecordingInternal]);

  const stopCloudRecording = useCallback(async () => {
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    try {
      const uri = await stopCloudRecordingInternal();

      if (uri) {
        setLastTranscript("最後のチャンクを処理中...");
        await processChunk(uri);
      }
    } catch (err) {
      console.warn("stopCloudRecording error:", err);
      // Don't throw — just log so the stop flow continues
    }
    setIsListening(false);
  }, [processChunk, stopCloudRecordingInternal]);

  // ===== ローカルWhisper音声認識 (iPhone向け) =====
  const processWhisperChunk = useCallback(async (uri: string) => {
    const result = await transcribeWithLocalWhisper(uri);

    if (result.success) {
      const chunkCount = countOccurrences(result.transcript);
      setLastTranscript(
        result.transcript
          ? `[whisper:${chunkCount}] ${result.transcript}`
          : "(無音)",
      );

      if (chunkCount > 0) {
        whisperCountRef.current += chunkCount;
        setCountValue(whisperCountRef.current);
      }
      return;
    }

    setError(result.error ?? "音声検証エラー");
    setLastTranscript(`検証エラー: ${result.error}`);
  }, []);

  const startWhisperChunk = useCallback(async () => {
    if (!sessionActiveRef.current) return;

    try {
      const recorderEngine = await startCloudRecording();
      setIsListening(true);
      setError(null);
      setLastTranscript(`録音中... (${recorderEngine} / whisper)`);

      chunkTimerRef.current = setTimeout(async () => {
        if (!sessionActiveRef.current) return;

        try {
          const uri = await stopCloudRecordingInternal();

          if (uri) {
            setLastTranscript("Whisperで文字起こし中...");
            await processWhisperChunk(uri);
          } else {
            setLastTranscript("録音データが取得できませんでした");
          }
        } catch (stopError: any) {
          setError(`録音停止エラー: ${stopError?.message ?? "unknown"}`);
          setLastTranscript("録音停止エラー");
        }

        if (sessionActiveRef.current) {
          startWhisperChunk();
        }
      }, CHUNK_DURATION_MS);
    } catch (e: any) {
      setError(`録音エラー: ${e.message}`);
      setLastTranscript(`録音エラー詳細: ${e.message}`);
      setIsListening(false);
    }
  }, [processWhisperChunk, startCloudRecording, stopCloudRecordingInternal]);

  const stopWhisperRecording = useCallback(async () => {
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    try {
      const uri = await stopCloudRecordingInternal();
      lastRecordingUriRef.current = uri ?? null;

      if (uri) {
        setLastTranscript("最後のWhisperチャンクを処理中...");
        await processWhisperChunk(uri);
      }
    } catch (err) {
      console.warn("stopWhisperRecording error:", err);
      // Don't throw — just log so the stop flow continues
    }
    setIsListening(false);
  }, [processWhisperChunk, stopCloudRecordingInternal]);

  const resetHybridSegmentationState = useCallback(() => {
    hybridNoiseFloorDbRef.current = -55;
    hybridLastSpeechAtMsRef.current = 0;
    hybridSegmentStartedAtMsRef.current = 0;
    hybridSawSpeechRef.current = false;
  }, []);

  const startHybridRecording = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync(HYBRID_AUDIO_MODE);

      resetHybridSegmentationState();

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recording.setProgressUpdateInterval(HYBRID_PROGRESS_UPDATE_MS);
      recording.setOnRecordingStatusUpdate((status) => {
        if (!sessionActiveRef.current || !status.isRecording) return;
        if (typeof status.metering !== "number") return;
        if (hybridSplittingRef.current) return;

        const now = Date.now();
        const db = status.metering;
        const noiseAlpha = db < hybridNoiseFloorDbRef.current + HYBRID_SPEECH_MARGIN_DB ? 0.04 : 0.01;
        hybridNoiseFloorDbRef.current =
          hybridNoiseFloorDbRef.current * (1 - noiseAlpha) + db * noiseAlpha;

        const speechThreshold = Math.max(HYBRID_NOISE_FLOOR_DB, hybridNoiseFloorDbRef.current + HYBRID_SPEECH_MARGIN_DB);
        if (db >= speechThreshold) {
          hybridSawSpeechRef.current = true;
          hybridLastSpeechAtMsRef.current = now;
          nativeLastSpeechDetectedAtRef.current = now;
          return;
        }
      });

      await recording.startAsync();
      hybridRecordingRef.current = recording;
      hybridSegmentStartedAtMsRef.current = Date.now();
      setIsListening(true);
      return true;
    } catch (e: any) {
      setError(`ハイブリッド録音エラー: ${e?.message ?? "unknown"}`);
      return false;
    }
  }, [resetHybridSegmentationState]);

  const finalizeHybridRecordingUri = useCallback(async (
    uri: string,
    fallbackNativeCount: number,
    fallbackManualIncrement: number,
    reason: "stop" | "resume",
  ) => {
    hybridFinalizationInFlightRef.current = true;
    let backgroundTaskId: number | null = null;

    try {
      await savePendingHybridFinalization({
        uri,
        nativeCount: fallbackNativeCount,
        manualIncrement: fallbackManualIncrement,
        createdAt: Date.now(),
      });

      backgroundTaskId = await beginIosBackgroundTask("daimoku-final-whisper");
      setLastTranscript(
        reason === "resume"
          ? "前回セッションのWhisper確定を再開中です..."
          : "セッション全体をWhisperで検証中です。アプリを移動しても可能な限り継続します。",
      );

      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        await clearPendingHybridFinalization();
        throw new Error("最終検証用の録音ファイルが見つかりません");
      }

      const result = await transcribeWithLocalWhisper(uri);
      if (!result.success) {
        setError(result.error ?? "音声検証エラー");
        setLastTranscript(`検証エラー: ${result.error}`);
        return fallbackNativeCount + fallbackManualIncrement;
      }

      const verifiedCount = countOccurrences(result.transcript);
      hybridWhisperChunksRef.current = 1;
      hybridWhisperCountRef.current = verifiedCount;
      nativeCountRef.current = Math.max(nativeCountRef.current, fallbackNativeCount);
      manualIncrementRef.current = fallbackManualIncrement;

      const finalCount =
        Math.max(fallbackNativeCount, verifiedCount) + fallbackManualIncrement;
      setCountValue(finalCount);
      setLastTranscript(
        `確定: ${finalCount}遍 (リアルタイム:${fallbackNativeCount} / 検証:${verifiedCount} / 手動:${fallbackManualIncrement})`,
      );
      await clearPendingHybridFinalization();
      return finalCount;
    } finally {
      await endIosBackgroundTask(backgroundTaskId);
      hybridFinalizationInFlightRef.current = false;
    }
  }, [clearPendingHybridFinalization, savePendingHybridFinalization, setCountValue]);

  const stopHybridRecordingAndFinalize = useCallback(async () => {
    await waitForHybridSplitSettle();
    const recording = hybridRecordingRef.current;
    let uri: string | null = null;
    if (recording) {
      try {
        recording.setOnRecordingStatusUpdate(null);
        await recording.stopAndUnloadAsync();
        uri = recording.getURI();
        lastRecordingUriRef.current = uri ?? null;
      } catch (err) {
        console.warn("stopHybridRecordingAndFinalize error:", err);
        // Don't throw — just log so the stop flow continues
      } finally {
        hybridRecordingRef.current = null;
      }
    }

    if (uri) {
      return finalizeHybridRecordingUri(
        uri,
        nativeCountRef.current,
        manualIncrementRef.current,
        "stop",
      );
    }

    const baseCount =
      hybridWhisperChunksRef.current > 0
        ? Math.max(hybridWhisperCountRef.current, nativeCountRef.current)
        : nativeCountRef.current;
    const finalCount = baseCount + manualIncrementRef.current;
    setCountValue(finalCount);
    setLastTranscript(
      `確定: ${finalCount}遍 (リアルタイム:${nativeCountRef.current} / 検証:${hybridWhisperCountRef.current} / 手動:${manualIncrementRef.current})`,
    );
    setIsListening(false);
    return finalCount;
  }, [finalizeHybridRecordingUri, waitForHybridSplitSettle]);

  const resumePendingHybridFinalization = useCallback(async () => {
    if (
      Platform.OS !== "ios" ||
      sessionActiveRef.current ||
      stopInProgressRef.current ||
      hybridFinalizationInFlightRef.current
    ) {
      return false;
    }

    const pending = await loadPendingHybridFinalization();
    if (!pending) return false;

    nativeCountRef.current = pending.nativeCount;
    manualIncrementRef.current = pending.manualIncrement;
    setCountValue(pending.nativeCount + pending.manualIncrement);
    setError(null);

    try {
      await finalizeHybridRecordingUri(
        pending.uri,
        pending.nativeCount,
        pending.manualIncrement,
        "resume",
      );
      return true;
    } catch (resumeError: any) {
      console.warn("resumePendingHybridFinalization error:", resumeError);
      setError(resumeError?.message ?? "前回セッションの最終検証を再開できませんでした");
      return false;
    }
  }, [finalizeHybridRecordingUri, loadPendingHybridFinalization, setCountValue]);

  // ===== ローカル推定音声認識 (Expo Go 向け) =====
  const getLocalThresholdDb = useCallback(() => {
    return Math.max(
      LOCAL_THRESHOLD_FLOOR_DB,
      localNoiseFloorDbRef.current + LOCAL_THRESHOLD_OFFSET_DB,
    );
  }, []);

  const getAdaptiveMinGapMs = useCallback(() => {
    const samples = localRecentIntervalsRef.current;
    if (samples.length < 3) return LOCAL_MIN_GAP_MS;

    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const adaptive = median * 0.72;
    return Math.max(LOCAL_MIN_GAP_MS, Math.min(900, adaptive));
  }, []);

  const resetLocalPulseState = useCallback(() => {
    localLastPulseAtMsRef.current = 0;
    localPrevDbRef.current = null;
    localPrevPrevDbRef.current = null;
    localPrevSampleTimeMsRef.current = null;
    localRecentIntervalsRef.current = [];
  }, []);

  const startLocalRecognition = useCallback(async (): Promise<boolean> => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
        shouldDuckAndroid: true,
      });

      resetLocalPulseState();
      localNoiseFloorDbRef.current = -50;

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });

      recording.setProgressUpdateInterval(LOCAL_PROGRESS_UPDATE_MS);
      recording.setOnRecordingStatusUpdate((status) => {
        if (!sessionActiveRef.current || !status.isRecording) return;
        if (typeof status.metering !== "number") return;

        const nowMs = Date.now();
        const db = status.metering;
        const thresholdDb = getLocalThresholdDb();

        // 適応ノイズフロア: 非音声時は速く追従、音声時は遅く追従
        const noiseAlpha = db < thresholdDb ? 0.05 : 0.01;
        localNoiseFloorDbRef.current =
          localNoiseFloorDbRef.current * (1 - noiseAlpha) + db * noiseAlpha;

        const prev = localPrevDbRef.current;
        const prevPrev = localPrevPrevDbRef.current;
        const prevTimeMs = localPrevSampleTimeMsRef.current;

        const registerPulse = (
          pulseAtMs: number,
          levelDb: number,
          reason: "peak" | "edge",
        ) => {
          const hasPrevPulse = localLastPulseAtMsRef.current > 0;
          const gapMs = hasPrevPulse
            ? pulseAtMs - localLastPulseAtMsRef.current
            : Infinity;
          const minGapMs = getAdaptiveMinGapMs();

          if (gapMs < minGapMs) return;

          if (hasPrevPulse && gapMs <= LOCAL_MAX_GAP_MS * 1.5) {
            localRecentIntervalsRef.current.push(gapMs);
            if (localRecentIntervalsRef.current.length > 12) {
              localRecentIntervalsRef.current.shift();
            }
          }

          localLastPulseAtMsRef.current = pulseAtMs;
          incrementCountValue();

          const gapLabel = Number.isFinite(gapMs)
            ? `${(gapMs / 1000).toFixed(2)}s`
            : "--";
          setLastTranscript(
            `[local/${reason}] +1 (gap ${gapLabel}, level ${levelDb.toFixed(1)}dB, thr ${thresholdDb.toFixed(1)}dB)`,
          );
        };

        if (prev != null && prevPrev != null && prevTimeMs != null) {
          const prominence = prev - Math.min(prevPrev, db);
          const isLocalPeak =
            prev >= thresholdDb &&
            prev >= prevPrev &&
            prev > db &&
            prominence >= LOCAL_PEAK_PROMINENCE_DB;

          if (isLocalPeak) {
            registerPulse(prevTimeMs, prev, "peak");
          } else {
            const isRisingEdge =
              prev < thresholdDb - 0.8 &&
              db >= thresholdDb + 0.8;
            if (isRisingEdge) {
              registerPulse(nowMs, db, "edge");
            }
          }
        }

        localPrevPrevDbRef.current = prev;
        localPrevDbRef.current = db;
        localPrevSampleTimeMsRef.current = nowMs;
      });

      await recording.startAsync();
      localRecordingRef.current = recording;
      setIsListening(true);
      setError(null);
      setLastTranscript("ローカル推定モードで認識中（ピーク検出）...");
      return true;
    } catch (e: any) {
      setIsListening(false);
      setError(`ローカル認識を開始できません: ${e?.message ?? "unknown"}`);
      setLastTranscript("ローカル認識開始エラー");
      return false;
    }
  }, [getAdaptiveMinGapMs, getLocalThresholdDb, incrementCountValue, resetLocalPulseState]);

  const stopLocalRecognition = useCallback(async () => {
    const recording = localRecordingRef.current;
    if (!recording) {
      setIsListening(false);
      return;
    }

    try {
      recording.setOnRecordingStatusUpdate(null);
      await recording.stopAndUnloadAsync();
      lastRecordingUriRef.current = recording.getURI() ?? null;
    } catch {
      // ignore
    } finally {
      localRecordingRef.current = null;
      setIsListening(false);
      resetLocalPulseState();
    }
  }, [resetLocalPulseState]);

  // ===== 共通タイマー =====
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(
          Math.floor((Date.now() - startTimeRef.current) / 1000),
        );
      }
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    void resumePendingHybridFinalization();
  }, [resumePendingHybridFinalization]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      const returnedToForeground =
        (previousState === "inactive" || previousState === "background") &&
        nextState === "active";

      if (!returnedToForeground) return;

      if (!sessionActiveRef.current) {
        void resumePendingHybridFinalization();
        return;
      }

      if (mode === "native") {
        clearNativeRestartTimer();
        if (!isListening && !nativeRestartPendingRef.current) {
          counter.current.onRecognitionRestart();
          resumeNativeRecognition(FOREGROUND_RECOVERY_DELAY_MS);
        }
        return;
      }

      if (mode === "hybrid") {
        clearNativeRestartTimer();
        if (!hybridRecordingRef.current) {
          void startHybridRecording().then((started) => {
            if (started && sessionActiveRef.current && !nativeRestartPendingRef.current) {
              counter.current.onRecognitionRestart();
              resumeNativeRecognition(FOREGROUND_RECOVERY_DELAY_MS);
            }
          });
          return;
        }

        if (!isListening && !nativeRestartPendingRef.current) {
          counter.current.onRecognitionRestart();
          resumeNativeRecognition(FOREGROUND_RECOVERY_DELAY_MS);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [
    clearNativeRestartTimer,
    isListening,
    mode,
    resumePendingHybridFinalization,
    resumeNativeRecognition,
    startHybridRecording,
  ]);

  // ===== 開始・停止・リセット =====
  const start = useCallback(async () => {
    if (stopInProgressRef.current) {
      setError("停止処理中です。完了までしばらくお待ちください。");
      return;
    }

    if (mode === "cloud" || mode === "local" || mode === "whisper" || mode === "hybrid") {
      const granted = await ensureCloudRecordingPermission();
      if (!granted) {
        setError("マイクの権限が必要です");
        return;
      }
    }

    if ((mode === "native" || mode === "hybrid") && ExpoSpeechRecognitionModule) {
      let granted = false;

      if (typeof ExpoSpeechRecognitionModule.requestPermissionsAsync === "function") {
        const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        granted = Boolean(permission?.granted);
      } else {
        const microphonePermission =
          typeof ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync === "function"
            ? await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync()
            : { granted: false };
        const speechPermission =
          typeof ExpoSpeechRecognitionModule.requestSpeechRecognizerPermissionsAsync === "function"
            ? await ExpoSpeechRecognitionModule.requestSpeechRecognizerPermissionsAsync()
            : { granted: false };
        granted = Boolean(microphonePermission.granted && speechPermission.granted);
      }

      if (!granted) {
        setError("マイクと音声認識の権限が必要です");
        return;
      }
    }

    if (mode === "whisper" || mode === "hybrid") {
      setError(null);
      setLastTranscript("音声認識モデルを準備中...");
      const warmupResult = await warmupLocalWhisper();
      if (!warmupResult.success) {
        setError(`音声認識の準備エラー: ${warmupResult.error}`);
        return;
      }
      if (warmupResult.downloaded) {
        setLastTranscript("音声認識モデルの準備が完了しました。録音を開始します...");
      }
    }

    counter.current.reset();
    consecutiveErrorsRef.current = 0;
    cloudCountRef.current = 0;
    whisperCountRef.current = 0;
    nativeCountRef.current = 0;
    hybridWhisperCountRef.current = 0;
    hybridWhisperChunksRef.current = 0;
    hybridWhisperQueueRef.current = Promise.resolve();
    manualIncrementRef.current = 0;
    lastRecordingUriRef.current = null;
    nativeSoftRestartRequestedAtRef.current = 0;
    nativeHardRestartDeadlineAtRef.current = 0;
    nativeLastResultAtRef.current = 0;
    nativeLastSpeechDetectedAtRef.current = 0;
    clearNativeRestartTimer();
    clearNativeResumeTimer();
    clearNativeStallCheckTimer();
    nativeRestartPendingRef.current = false;
    setCountValue(0);
    setError(null);
    setLastTranscript("");
    setElapsedSeconds(0);
    sessionActiveRef.current = true;
    setIsSessionActive(true);
    startTimer();

    if (mode === "native") {
      startRecognition();
    } else if (mode === "hybrid") {
      setLastTranscript("リアルタイム認識を開始します...");
      const started = await startHybridRecording();
      if (!started) {
        setIsListening(false);
        sessionActiveRef.current = false;
        setIsSessionActive(false);
        stopTimer();
        return;
      }
      // AudioSessionが安定してからネイティブ認識を起動
      await new Promise<void>(r => setTimeout(r, 100));
      if (sessionActiveRef.current) {
        startRecognition();
      }
    } else if (mode === "cloud") {
      switchCloudRecorderEngine("expo-audio");
      startCloudChunk();
    } else if (mode === "whisper") {
      switchCloudRecorderEngine("expo-audio");
      startWhisperChunk();
    } else if (mode === "local") {
      const started = await startLocalRecognition();
      if (!started) {
        sessionActiveRef.current = false;
        setIsSessionActive(false);
        stopTimer();
      }
    }
  }, [clearNativeRestartTimer, clearNativeResumeTimer, clearNativeStallCheckTimer, mode, ensureCloudRecordingPermission, startRecognition, startCloudChunk, startLocalRecognition, startTimer, stopTimer, startWhisperChunk, switchCloudRecorderEngine, startHybridRecording]);

  const stop = useCallback(async () => {
    if (stopInProgressRef.current) return latestCountRef.current;
    stopInProgressRef.current = true;
    const floorCount =
      mode === "native" || mode === "hybrid"
        ? nativeCountRef.current + manualIncrementRef.current
        : latestCountRef.current;
    let finalCount = floorCount;
    try {
      setLastTranscript("停止処理中...");
      setIsListening(false);
      stopTimer();
      clearNativeRestartTimer();
      clearNativeResumeTimer();
      clearNativeStallCheckTimer();
      nativeRestartPendingRef.current = false;
      nativeSoftRestartRequestedAtRef.current = 0;
      nativeHardRestartDeadlineAtRef.current = 0;

      if ((mode === "native" || mode === "hybrid") && ExpoSpeechRecognitionModule) {
        ExpoSpeechRecognitionModule.stop();
        if (mode === "hybrid") {
          sessionActiveRef.current = false;
          setIsSessionActive(false);
          finalCount = await stopHybridRecordingAndFinalize();
          finalCount = Math.max(floorCount, finalCount);
        } else {
          sessionActiveRef.current = false;
          setIsSessionActive(false);
          finalCount = Math.max(
            floorCount,
            nativeCountRef.current + manualIncrementRef.current,
          );
        }
      } else if (mode === "cloud") {
        // Clear chunk timer BEFORE marking session inactive
        if (chunkTimerRef.current) {
          clearTimeout(chunkTimerRef.current);
          chunkTimerRef.current = null;
        }
        sessionActiveRef.current = false;
        setIsSessionActive(false);
        await stopCloudRecording();
        finalCount = Math.max(floorCount, latestCountRef.current);
      } else if (mode === "whisper") {
        if (chunkTimerRef.current) {
          clearTimeout(chunkTimerRef.current);
          chunkTimerRef.current = null;
        }
        sessionActiveRef.current = false;
        setIsSessionActive(false);
        await stopWhisperRecording();
        finalCount = Math.max(floorCount, latestCountRef.current);
      } else if (mode === "local") {
        sessionActiveRef.current = false;
        setIsSessionActive(false);
        await stopLocalRecognition();
        finalCount = latestCountRef.current;
      } else {
        sessionActiveRef.current = false;
        setIsSessionActive(false);
        finalCount = latestCountRef.current;
      }

      setCountValue(finalCount);
      setLastTranscript(finalCount > 0 ? `${finalCount}遍 確定` : "");
      return finalCount;
    } catch (err) {
      console.warn("stop() error:", err);
      // Even on error, return the floor count so it's not lost
      finalCount = Math.max(floorCount, latestCountRef.current);
      setCountValue(finalCount);
      return finalCount;
    } finally {
      sessionActiveRef.current = false;
      setIsSessionActive(false);
      setIsListening(false);
      stopInProgressRef.current = false;
    }
  }, [clearNativeRestartTimer, clearNativeResumeTimer, clearNativeStallCheckTimer, mode, stopLocalRecognition, stopTimer, stopCloudRecording, stopWhisperRecording, stopHybridRecordingAndFinalize, setCountValue]);

  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      clearNativeRestartTimer();
      clearNativeResumeTimer();
      clearNativeStallCheckTimer();
      nativeSoftRestartRequestedAtRef.current = 0;
      nativeHardRestartDeadlineAtRef.current = 0;
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      if (localRecordingRef.current) {
        localRecordingRef.current.setOnRecordingStatusUpdate(null);
        localRecordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
      if (hybridRecordingRef.current) {
        hybridRecordingRef.current.setOnRecordingStatusUpdate(null);
        hybridRecordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [clearNativeRestartTimer, clearNativeResumeTimer, clearNativeStallCheckTimer]);

  const reset = useCallback(() => {
    stop();
    counter.current.reset();
    cloudCountRef.current = 0;
    whisperCountRef.current = 0;
    manualIncrementRef.current = 0;
    lastRecordingUriRef.current = null;
    setCountValue(0);
    setElapsedSeconds(0);
    setLastTranscript("");
    startTimeRef.current = null;
  }, [stop]);

  const increment = useCallback(() => {
    if (sessionActiveRef.current) {
      manualIncrementRef.current += 1;
    }
    incrementCountValue();
  }, [incrementCountValue]);

  const getLastRecordingUri = useCallback(() => lastRecordingUriRef.current, []);

  return {
    count,
    isListening,
    isSessionActive,
    elapsedSeconds,
    start,
    stop,
    reset,
    increment,
    error,
    speechAvailable: speechAvailable ?? false,
    mode,
    lastTranscript,
    cloudRecorderEngine,
    getLastRecordingUri,
  };
}
