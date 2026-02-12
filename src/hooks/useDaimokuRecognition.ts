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

/** 録音チャンクの長さ（ミリ秒） */
const CHUNK_DURATION_MS = 15000;

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
  const [lastTranscript, setLastTranscript] = useState<string>("");

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
      const result = await transcribeAudio(uri, deepgramKey, openaiKey);

      if (result.success) {
        setLastTranscript(result.transcript || "(無音)");
        if (result.transcript) {
          const chunkCount = countOccurrences(result.transcript);
          if (chunkCount > 0) {
            cloudCountRef.current += chunkCount;
            setCount(cloudCountRef.current);
          }
        }
      } else {
        setError(result.error ?? "文字起こしエラー");
        setLastTranscript(`エラー: ${result.error}`);
      }
    },
    [deepgramKey, openaiKey],
  );

  const startCloudChunk = useCallback(async () => {
    if (!sessionActiveRef.current) return;

    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        isMeteringEnabled: false,
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.MEDIUM,
          sampleRate: 16000,
          numberOfChannels: 1,
          bitRate: 64000,
        },
        web: {
          mimeType: "audio/webm",
          bitsPerSecond: 64000,
        },
      });
      await recording.startAsync();
      recordingRef.current = recording;
      setIsListening(true);
      setLastTranscript("録音中...");

      chunkTimerRef.current = setTimeout(async () => {
        if (!sessionActiveRef.current) return;

        try {
          await recording.stopAndUnloadAsync();
          const uri = recording.getURI();
          recordingRef.current = null;

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
      setIsListening(false);
    }
  }, [processChunk]);

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

        if (uri) {
          setLastTranscript("最後のチャンクを処理中...");
          await processChunk(uri);
        }
      } catch {
        // ignore
      }
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
