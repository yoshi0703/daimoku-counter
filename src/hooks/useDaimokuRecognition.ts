import { useRef, useState, useCallback, useEffect } from "react";
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  RecordingPresets,
} from "expo-audio";
import type { AudioRecorder } from "expo-audio";
import { DaimokuCounter, countOccurrences } from "@/src/lib/daimokuCounter";
import { transcribeAudio } from "@/src/lib/transcriptionService";

// expo-speech-recognition をランタイムで安全にインポート
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = () => {};

try {
  const mod = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch {
  // Expo Go では利用不可
}

/** 録音チャンクの長さ（ミリ秒） */
const CHUNK_DURATION_MS = 15000;

export function useDaimokuRecognition(
  deepgramKey: string | null,
  openaiKey: string | null,
  getDeepgramToken?: () => Promise<string | null>,
) {
  const [count, setCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"native" | "cloud" | "manual">("manual");
  const [lastTranscript, setLastTranscript] = useState<string>("");

  const sessionActiveRef = useRef(false);
  const counter = useRef(new DaimokuCounter());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudCountRef = useRef(0);

  // expo-audio の AudioRecorder フック（HIGH_QUALITY プリセット使用）
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderRef = useRef<AudioRecorder>(recorder);
  recorderRef.current = recorder;

  // 起動時にモード判定
  useEffect(() => {
    const nativeAvailable = ExpoSpeechRecognitionModule != null;
    setSpeechAvailable(nativeAvailable);

    if (nativeAvailable) {
      setMode("native");
    } else if (deepgramKey || openaiKey) {
      setMode("cloud");
    } else {
      setMode("manual");
    }
  }, [deepgramKey, openaiKey]);

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
  const processChunk = useCallback(
    async (uri: string) => {
      // JWT トークンを取得（Edge Function 経由）
      const token = getDeepgramToken ? await getDeepgramToken() : null;
      const result = await transcribeAudio(uri, deepgramKey, openaiKey, token);

      if (result.success) {
        // searchHits（音響マッチング）があればそちらを優先、なければテキストマッチ
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
    },
    [deepgramKey, openaiKey, getDeepgramToken],
  );

  const startCloudChunk = useCallback(async () => {
    if (!sessionActiveRef.current) return;

    try {
      // 録音直前に AudioMode を設定（順序が重要）
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      const rec = recorderRef.current;
      await rec.prepareToRecordAsync();
      rec.record();
      setIsListening(true);
      setLastTranscript("録音中...");

      chunkTimerRef.current = setTimeout(async () => {
        if (!sessionActiveRef.current) return;

        try {
          await rec.stop();
          const uri = rec.uri;

          if (uri) {
            setLastTranscript("文字起こし中...");
            await processChunk(uri);
          }
        } catch {
          // ignore
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
  }, [processChunk]);

  const stopCloudRecording = useCallback(async () => {
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    try {
      const rec = recorderRef.current;
      await rec.stop();
      const uri = rec.uri;

      if (uri) {
        setLastTranscript("最後のチャンクを処理中...");
        await processChunk(uri);
      }
    } catch {
      // ignore
    }
    setIsListening(false);
  }, [processChunk]);

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
    if (mode === "cloud") {
      const { granted } = await requestRecordingPermissionsAsync();
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
      startCloudChunk();
    }
  }, [mode, startRecognition, startCloudChunk, startTimer]);

  const stop = useCallback(async () => {
    sessionActiveRef.current = false;
    setIsSessionActive(false);
    stopTimer();

    if (mode === "native" && ExpoSpeechRecognitionModule) {
      ExpoSpeechRecognitionModule.stop();
    } else if (mode === "cloud") {
      await stopCloudRecording();
    }
  }, [mode, stopTimer, stopCloudRecording]);

  const reset = useCallback(() => {
    stop();
    counter.current.reset();
    cloudCountRef.current = 0;
    setCount(0);
    setElapsedSeconds(0);
    setLastTranscript("");
    startTimeRef.current = null;
  }, [stop]);

  const increment = useCallback(() => {
    setCount((prev) => prev + 1);
  }, []);

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
  };
}
