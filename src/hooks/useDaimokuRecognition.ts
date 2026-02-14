import { useRef, useState, useCallback, useEffect } from "react";
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from "expo-audio";
import { Audio } from "expo-av";
import type { AudioRecorder } from "expo-audio";
import type { RecognitionModePreference } from "@/src/hooks/useApiKeys";
import { DaimokuCounter, countOccurrences } from "@/src/lib/daimokuCounter";
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

/** 録音チャンクの長さ（ミリ秒） */
const CHUNK_DURATION_MS = 15000;
type CloudRecorderEngine = "expo-audio" | "expo-av";
type RecognitionMode = "native" | "cloud" | "local" | "manual";

// Expo Go 向けローカル推定モード（メータリングベース）
// v2: 実録音(51回/60秒)で検証済みパラメータ — 高速唱題(~1.18s/cycle)対応
const LOCAL_PROGRESS_UPDATE_MS = 120;
const LOCAL_MIN_GAP_MS = 480;
const LOCAL_MAX_GAP_MS = 1700;
const LOCAL_THRESHOLD_OFFSET_DB = 2.0;   // 1.0→2.0: ノイズ耐性向上
const LOCAL_THRESHOLD_FLOOR_DB = -35;    // -38→-35: 微弱ノイズ除外
const LOCAL_PEAK_PROMINENCE_DB = 2.5;    // 0.30→2.5: 偽陽性の大幅削減

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
    });

    const rec = recorderRef.current;
    await rec.prepareToRecordAsync();
    rec.record();
  }, []);

  const startExpoAvRecording = useCallback(async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
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
    const nativeAvailable = ExpoSpeechRecognitionModule != null;
    const localAvailable = true;
    setSpeechAvailable(nativeAvailable || cloudAvailable || localAvailable);

    if (preferredMode === "cloud" && cloudAvailable) {
      setMode("cloud");
    } else if (localAvailable) {
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
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: false,
      contextualStrings: ["南無妙法蓮華経", "なむみょうほうれんげきょう"],
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
      }, 300);
    }
  });

  useSpeechRecognitionEvent("result", (event: any) => {
    const transcript = event.results[0]?.transcript ?? "";
    const isFinal = event.isFinal;
    const newCount = counter.current.processResult(transcript, isFinal);
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
      }, 1000);
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

        if (prev != null && prevPrev != null && prevTimeMs != null) {
          const prominence = prev - Math.min(prevPrev, db);
          const isLocalPeak =
            prev >= thresholdDb &&
            prev >= prevPrev &&
            prev > db &&
            prominence >= LOCAL_PEAK_PROMINENCE_DB;

          if (isLocalPeak) {
            const hasPrevPulse = localLastPulseAtMsRef.current > 0;
            const gapMs = hasPrevPulse
              ? prevTimeMs - localLastPulseAtMsRef.current
              : Infinity;
            const minGapMs = getAdaptiveMinGapMs();

            if (gapMs >= minGapMs) {
              if (hasPrevPulse && gapMs <= LOCAL_MAX_GAP_MS * 1.5) {
                localRecentIntervalsRef.current.push(gapMs);
                if (localRecentIntervalsRef.current.length > 12) {
                  localRecentIntervalsRef.current.shift();
                }
              }

              localLastPulseAtMsRef.current = prevTimeMs;
              setCount((prevCount) => prevCount + 1);

              const gapLabel = Number.isFinite(gapMs)
                ? `${(gapMs / 1000).toFixed(2)}s`
                : "--";
              setLastTranscript(
                `[local] +1 (gap ${gapLabel}, peak ${prev.toFixed(1)}dB, thr ${thresholdDb.toFixed(1)}dB)`,
              );
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
    if (mode === "cloud" || mode === "local") {
      const granted = await ensureCloudRecordingPermission();
      if (!granted) {
        setError("マイクの権限が必要です");
        return;
      }
    }

    if (mode === "native" && ExpoSpeechRecognitionModule) {
      const { granted } =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setError("マイクと音声認識の権限が必要です");
        return;
      }
    }

    counter.current.reset();
    cloudCountRef.current = 0;
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
    } else if (mode === "cloud") {
      switchCloudRecorderEngine("expo-audio");
      startCloudChunk();
    } else if (mode === "local") {
      const started = await startLocalRecognition();
      if (!started) {
        sessionActiveRef.current = false;
        setIsSessionActive(false);
        stopTimer();
      }
    }
  }, [mode, ensureCloudRecordingPermission, startRecognition, startCloudChunk, startLocalRecognition, startTimer, stopTimer, switchCloudRecorderEngine]);

  const stop = useCallback(async () => {
    sessionActiveRef.current = false;
    setIsSessionActive(false);
    stopTimer();

    if (mode === "native" && ExpoSpeechRecognitionModule) {
      ExpoSpeechRecognitionModule.stop();
    } else if (mode === "cloud") {
      await stopCloudRecording();
    } else if (mode === "local") {
      await stopLocalRecognition();
    }
  }, [mode, stopLocalRecognition, stopTimer, stopCloudRecording]);

  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current);
      if (localRecordingRef.current) {
        localRecordingRef.current.setOnRecordingStatusUpdate(null);
        localRecordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const reset = useCallback(() => {
    stop();
    counter.current.reset();
    cloudCountRef.current = 0;
    lastRecordingUriRef.current = null;
    setCount(0);
    setElapsedSeconds(0);
    setLastTranscript("");
    startTimeRef.current = null;
  }, [stop]);

  const increment = useCallback(() => {
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
