import { useRef, useState, useCallback, useEffect } from "react";
import { Audio } from "expo-av";
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

/** 録音チャンクの長さ（秒） */
const CHUNK_DURATION_MS = 12000;

export function useDaimokuRecognition(
  deepgramKey: string | null,
  openaiKey: string | null,
) {
  const [count, setCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"native" | "cloud" | "manual">("manual");

  const sessionActiveRef = useRef(false);
  const counter = useRef(new DaimokuCounter());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudCountRef = useRef(0);

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

  // ===== クラウド音声認識（チャンク録音 → API送信） =====
  const startCloudChunk = useCallback(async () => {
    if (!sessionActiveRef.current) return;

    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await recording.startAsync();
      recordingRef.current = recording;
      setIsListening(true);

      // チャンク時間後に停止して送信
      chunkTimerRef.current = setTimeout(async () => {
        if (!sessionActiveRef.current) return;

        try {
          await recording.stopAndUnloadAsync();
          const uri = recording.getURI();
          recordingRef.current = null;

          if (uri) {
            // 非同期で文字起こし（次のチャンク録音と並行）
            transcribeAudio(uri, deepgramKey, openaiKey).then((result) => {
              if (result.success && result.transcript) {
                const chunkCount = countOccurrences(result.transcript);
                cloudCountRef.current += chunkCount;
                setCount(cloudCountRef.current);
              }
              if (!result.success && result.error) {
                console.warn("Transcription error:", result.error);
              }
            });
          }
        } catch {
          // 録音停止エラーは無視
        }

        // 次のチャンクを開始
        if (sessionActiveRef.current) {
          startCloudChunk();
        }
      }, CHUNK_DURATION_MS);
    } catch (e: any) {
      setError(`録音エラー: ${e.message}`);
      setIsListening(false);
    }
  }, [deepgramKey, openaiKey]);

  const stopCloudRecording = useCallback(async () => {
    if (chunkTimerRef.current) {
      clearTimeout(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        recordingRef.current = null;

        // 最後のチャンクも文字起こし
        if (uri) {
          const result = await transcribeAudio(uri, deepgramKey, openaiKey);
          if (result.success && result.transcript) {
            const chunkCount = countOccurrences(result.transcript);
            cloudCountRef.current += chunkCount;
            setCount(cloudCountRef.current);
          }
        }
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  }, [deepgramKey, openaiKey]);

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
    // クラウドモードの場合、マイク権限を取得
    if (mode === "cloud") {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setError("マイクの権限が必要です");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    }

    // ネイティブモードの場合
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
    startTimeRef.current = null;
  }, [stop]);

  // 手動タップ
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
  };
}
