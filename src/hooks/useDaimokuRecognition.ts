import { useRef, useState, useCallback } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { DaimokuCounter } from "@/src/lib/daimokuCounter";

export function useDaimokuRecognition() {
  const [count, setCount] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionActiveRef = useRef(false);
  const counter = useRef(new DaimokuCounter());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const startRecognition = useCallback(() => {
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
    // セッション継続中なら自動リスタート（60秒タイムアウト対策）
    if (sessionActiveRef.current) {
      counter.current.onRecognitionRestart();
      setTimeout(() => {
        if (sessionActiveRef.current) {
          startRecognition();
        }
      }, 300);
    }
  });

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results[0]?.transcript ?? "";
    const isFinal = event.isFinal;
    const newCount = counter.current.processResult(transcript, isFinal);
    setCount(newCount);
  });

  useSpeechRecognitionEvent("error", (event) => {
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

  const start = useCallback(async () => {
    const { granted } =
      await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      setError("マイクと音声認識の権限が必要です");
      return;
    }

    counter.current.reset();
    setCount(0);
    setError(null);
    setElapsedSeconds(0);
    sessionActiveRef.current = true;
    setIsSessionActive(true);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(
          Math.floor((Date.now() - startTimeRef.current) / 1000),
        );
      }
    }, 1000);

    startRecognition();
  }, [startRecognition]);

  const stop = useCallback(() => {
    sessionActiveRef.current = false;
    setIsSessionActive(false);
    ExpoSpeechRecognitionModule.stop();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    counter.current.reset();
    setCount(0);
    setElapsedSeconds(0);
    startTimeRef.current = null;
  }, [stop]);

  return {
    count,
    isListening,
    isSessionActive,
    elapsedSeconds,
    start,
    stop,
    reset,
    error,
  };
}
