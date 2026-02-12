import { useRef, useState, useCallback, useEffect } from "react";
import { DaimokuCounter } from "@/src/lib/daimokuCounter";

// expo-speech-recognition をランタイムで安全にインポート
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = () => {};

try {
  const mod = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = mod.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = mod.useSpeechRecognitionEvent;
} catch {
  // Expo Go では利用不可 → 手動モードにフォールバック
}

export function useDaimokuRecognition() {
  const [count, setCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speechAvailable, setSpeechAvailable] = useState<boolean | null>(null);

  const sessionActiveRef = useRef(false);
  const counter = useRef(new DaimokuCounter());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // 起動時に音声認識の利用可否を判定
  useEffect(() => {
    setSpeechAvailable(ExpoSpeechRecognitionModule != null);
  }, []);

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

  // 音声認識イベント（利用可能な場合のみ動作）
  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
    if (sessionActiveRef.current) {
      counter.current.onRecognitionRestart();
      setTimeout(() => {
        if (sessionActiveRef.current) {
          startRecognition();
        }
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

  // タイマー開始の共通処理
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

  // 音声認識モードの開始
  const start = useCallback(async () => {
    if (ExpoSpeechRecognitionModule) {
      const { granted } =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        setError("マイクと音声認識の権限が必要です");
        return;
      }
    }

    counter.current.reset();
    setCount(0);
    setError(null);
    setElapsedSeconds(0);
    sessionActiveRef.current = true;
    setIsSessionActive(true);
    startTimer();

    if (ExpoSpeechRecognitionModule) {
      startRecognition();
    }
  }, [startRecognition, startTimer]);

  const stop = useCallback(() => {
    sessionActiveRef.current = false;
    setIsSessionActive(false);
    stopTimer();

    if (ExpoSpeechRecognitionModule) {
      ExpoSpeechRecognitionModule.stop();
    }
  }, [stopTimer]);

  const reset = useCallback(() => {
    stop();
    counter.current.reset();
    setCount(0);
    setElapsedSeconds(0);
    startTimeRef.current = null;
  }, [stop]);

  // 手動タップでカウントを+1
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
  };
}
