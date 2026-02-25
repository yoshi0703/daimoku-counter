import { useRef, useState, useCallback, useEffect } from "react";
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

  const sessionActiveRef = useRef(false);
  const counter = useRef(new DaimokuCounter());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const manualIncrementRef = useRef(0);
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

  const switchCloudRecorderEngine = useCallback((engine: CloudRecorderEngine) => {
    cloudRecorderEngineRef.current = engine;
    setCloudRecorderEngine(engine);
  }, []);

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

    setSpeechAvailable(
      nativeAvailable ||
      cloudAvailable ||
      whisperAvailable ||
      localMeteringAvailable,
    );

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
      requiresOnDeviceRecognition: false,
      addsPunctuation: false,
      iosTaskHint: "dictation",
      contextualStrings: getDaimokuContextualStrings(),
      iosCategory: {
        category: "playAndRecord",
        categoryOptions: ["defaultToSpeaker", "allowBluetooth", "mixWithOthers"],
        mode: "default",
      },
    });
  }, []);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
    if (sessionActiveRef.current) {
      counter.current.onRecognitionRestart();
      setTimeout(() => {
        if (sessionActiveRef.current) startRecognition();
      }, 50);
    }
  });

  useSpeechRecognitionEvent("result", (event: any) => {
    const transcript = selectBestDaimokuTranscript(event.results);
    const isFinal = event.isFinal;
    const newCount = counter.current.processResult(transcript, isFinal);
    nativeCountRef.current = newCount;
    setCount(newCount);
    setLastTranscript(transcript);
  });

  useSpeechRecognitionEvent("error", (event: any) => {
    setError(event.message);
    if (sessionActiveRef.current && event.error !== "not-allowed") {
      setTimeout(() => {
        if (sessionActiveRef.current) {
          counter.current.onRecognitionRestart();
          startRecognition();
        }
      }, 200);
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
        setCount(cloudCountRef.current);
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
    } catch {
      // ignore
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
        setCount(whisperCountRef.current);
      }
      return;
    }

    setError(result.error ?? "Whisper文字起こしエラー");
    setLastTranscript(`Whisperエラー: ${result.error}`);
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

      if (uri) {
        setLastTranscript("最後のWhisperチャンクを処理中...");
        await processWhisperChunk(uri);
      }
    } catch {
      // ignore
    }
    setIsListening(false);
  }, [processWhisperChunk, stopCloudRecordingInternal]);

  const queueHybridWhisperChunk = useCallback((uri: string) => {
    hybridWhisperQueueRef.current = hybridWhisperQueueRef.current
      .then(async () => {
        const result = await transcribeWithLocalWhisper(uri);
        if (result.success) {
          const chunkCount = countOccurrences(result.transcript);
          hybridWhisperChunksRef.current += 1;
          hybridWhisperCountRef.current += chunkCount;
          setLastTranscript(
            result.transcript
              ? `[hybrid/whisper:${chunkCount}] ${result.transcript}`
              : "[hybrid/whisper] (無音)",
          );
        } else {
          setError(result.error ?? "Whisper文字起こしエラー");
          setLastTranscript(`Whisperエラー: ${result.error}`);
        }
      })
      .catch((e: any) => {
        setError(`Whisperキュー処理エラー: ${e?.message ?? "unknown"}`);
        setLastTranscript("Whisperキュー処理で想定外エラーが発生しました");
      })
      .finally(async () => {
        try {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        } catch {
          // ignore
        }
      });

    return hybridWhisperQueueRef.current;
  }, []);

  const resetHybridSegmentationState = useCallback(() => {
    hybridNoiseFloorDbRef.current = -55;
    hybridLastSpeechAtMsRef.current = 0;
    hybridSegmentStartedAtMsRef.current = 0;
    hybridSawSpeechRef.current = false;
  }, []);

  const splitHybridSegment = useCallback(async () => {
    const current = hybridRecordingRef.current;
    if (!current || hybridSplittingRef.current || !sessionActiveRef.current) return;
    hybridSplittingRef.current = true;

    try {
      current.setOnRecordingStatusUpdate(null);
      await current.stopAndUnloadAsync();
      const uri = current.getURI();
      if (uri) {
        void queueHybridWhisperChunk(uri);
      }

      if (!sessionActiveRef.current) return;

      const next = new Audio.Recording();
      await next.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      if (!sessionActiveRef.current) {
        await next.stopAndUnloadAsync().catch(() => {});
        return;
      }
      next.setProgressUpdateInterval(HYBRID_PROGRESS_UPDATE_MS);
      next.setOnRecordingStatusUpdate((status) => {
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
          return;
        }

        const silenceMs = hybridLastSpeechAtMsRef.current > 0 ? now - hybridLastSpeechAtMsRef.current : 0;
        const segmentMs = hybridSegmentStartedAtMsRef.current > 0 ? now - hybridSegmentStartedAtMsRef.current : 0;

        if (
          hybridSawSpeechRef.current &&
          silenceMs >= HYBRID_SILENCE_HOLD_MS &&
          segmentMs >= HYBRID_MIN_SEGMENT_MS
        ) {
          void splitHybridSegment();
        }
      });
      await next.startAsync();
      if (!sessionActiveRef.current) {
        await next.stopAndUnloadAsync().catch(() => {});
        return;
      }
      hybridRecordingRef.current = next;
      hybridSegmentStartedAtMsRef.current = Date.now();
      hybridSawSpeechRef.current = false;
      hybridLastSpeechAtMsRef.current = 0;
    } catch (e: any) {
      setError(`ハイブリッド分割エラー: ${e?.message ?? "unknown"}`);
    } finally {
      hybridSplittingRef.current = false;
    }
  }, [queueHybridWhisperChunk]);

  const startHybridRecording = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        playThroughEarpieceAndroid: false,
        shouldDuckAndroid: true,
      });

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
          return;
        }

        const silenceMs = hybridLastSpeechAtMsRef.current > 0 ? now - hybridLastSpeechAtMsRef.current : 0;
        const segmentMs = hybridSegmentStartedAtMsRef.current > 0 ? now - hybridSegmentStartedAtMsRef.current : 0;

        if (
          hybridSawSpeechRef.current &&
          silenceMs >= HYBRID_SILENCE_HOLD_MS &&
          segmentMs >= HYBRID_MIN_SEGMENT_MS
        ) {
          void splitHybridSegment();
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
  }, [resetHybridSegmentationState, splitHybridSegment]);

  const stopHybridRecordingAndFinalize = useCallback(async () => {
    await waitForHybridSplitSettle();
    const recording = hybridRecordingRef.current;
    if (recording) {
      try {
        recording.setOnRecordingStatusUpdate(null);
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        if (uri) {
          void queueHybridWhisperChunk(uri);
        }
      } catch {
        // ignore
      } finally {
        hybridRecordingRef.current = null;
      }
    }

    setLastTranscript("正確なカウントを処理中です。アプリを閉じないでください。");
    await hybridWhisperQueueRef.current;

    const baseCount =
      hybridWhisperChunksRef.current > 0
        ? hybridWhisperCountRef.current
        : nativeCountRef.current;
    const finalCount = baseCount + manualIncrementRef.current;
    setCount(finalCount);
    setLastTranscript(
      `確定: ${finalCount}回 (リアルタイム:${nativeCountRef.current} / Whisper:${hybridWhisperCountRef.current} / 手動:${manualIncrementRef.current})`,
    );
    setIsListening(false);
    return finalCount;
  }, [queueHybridWhisperChunk, waitForHybridSplitSettle]);

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
          setCount((prevCount) => prevCount + 1);

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
  }, [getAdaptiveMinGapMs, getLocalThresholdDb, resetLocalPulseState]);

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
      if (!isNativeOnDeviceRecognitionAvailable()) {
        setError("この端末ではオンデバイス音声認識が利用できません");
        return;
      }

      const requestPermission =
        typeof ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync === "function"
          ? ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync.bind(
            ExpoSpeechRecognitionModule,
          )
          : ExpoSpeechRecognitionModule.requestPermissionsAsync.bind(
            ExpoSpeechRecognitionModule,
          );

      const { granted } = await requestPermission();
      if (!granted) {
        setError("マイクと音声認識の権限が必要です");
        return;
      }
    }

    if (mode === "whisper" || mode === "hybrid") {
      setError(null);
      setLastTranscript("Whisperモデルを準備中...");
      const warmupResult = await warmupLocalWhisper();
      if (!warmupResult.success) {
        setError(`Whisper準備エラー: ${warmupResult.error}`);
        return;
      }
      if (warmupResult.downloaded) {
        setLastTranscript("Whisperモデルの準備が完了しました。録音を開始します...");
      }
    }

    counter.current.reset();
    cloudCountRef.current = 0;
    whisperCountRef.current = 0;
    nativeCountRef.current = 0;
    hybridWhisperCountRef.current = 0;
    hybridWhisperChunksRef.current = 0;
    hybridWhisperQueueRef.current = Promise.resolve();
    manualIncrementRef.current = 0;
    lastRecordingUriRef.current = null;
    setCount(0);
    setError(null);
    setLastTranscript("");
    setElapsedSeconds(0);
    sessionActiveRef.current = true;
    setIsSessionActive(true);
    startTimer();

    if (mode === "native") {
      startRecognition();
    } else if (mode === "hybrid") {
      setLastTranscript("リアルタイム認識を開始し、無音区間ごとにWhisperで検証します...");
      startRecognition();
      const started = await startHybridRecording();
      if (!started) {
        if (ExpoSpeechRecognitionModule) {
          ExpoSpeechRecognitionModule.stop();
        }
        setIsListening(false);
        sessionActiveRef.current = false;
        setIsSessionActive(false);
        stopTimer();
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
  }, [mode, ensureCloudRecordingPermission, startRecognition, startCloudChunk, startLocalRecognition, startTimer, stopTimer, startWhisperChunk, switchCloudRecorderEngine, startHybridRecording]);

  const stop = useCallback(async () => {
    if (stopInProgressRef.current) return count;
    stopInProgressRef.current = true;
    let finalCount = count;
    try {
      sessionActiveRef.current = false;
      setIsSessionActive(false);
      setIsListening(false);
      setLastTranscript("停止処理中...");
      stopTimer();

      if ((mode === "native" || mode === "hybrid") && ExpoSpeechRecognitionModule) {
        ExpoSpeechRecognitionModule.stop();
        if (mode === "hybrid") {
          finalCount = await stopHybridRecordingAndFinalize();
        }
      } else if (mode === "cloud") {
        await stopCloudRecording();
      } else if (mode === "whisper") {
        await stopWhisperRecording();
      } else if (mode === "local") {
        await stopLocalRecognition();
      }
    } finally {
      stopInProgressRef.current = false;
    }
    return finalCount;
  }, [count, mode, stopLocalRecognition, stopTimer, stopCloudRecording, stopWhisperRecording, stopHybridRecordingAndFinalize]);

  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
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
  }, []);

  const reset = useCallback(() => {
    stop();
    counter.current.reset();
    cloudCountRef.current = 0;
    whisperCountRef.current = 0;
    manualIncrementRef.current = 0;
    lastRecordingUriRef.current = null;
    setCount(0);
    setElapsedSeconds(0);
    setLastTranscript("");
    startTimeRef.current = null;
  }, [stop]);

  const increment = useCallback(() => {
    if (sessionActiveRef.current) {
      manualIncrementRef.current += 1;
    }
    setCount((prev) => prev + 1);
  }, []);

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
