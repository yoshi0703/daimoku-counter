import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  deepgram: "daimoku_deepgram_key",
  openai: "daimoku_openai_key",
};

export function useApiKeys() {
  const [deepgramKey, setDeepgramKey] = useState<string | null>(null);
  const [openaiKey, setOpenaiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [dg, oa] = await Promise.all([
        AsyncStorage.getItem(KEYS.deepgram),
        AsyncStorage.getItem(KEYS.openai),
      ]);
      setDeepgramKey(dg);
      setOpenaiKey(oa);
      setLoading(false);
    })();
  }, []);

  const saveDeepgramKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (trimmed) {
      await AsyncStorage.setItem(KEYS.deepgram, trimmed);
      setDeepgramKey(trimmed);
    } else {
      await AsyncStorage.removeItem(KEYS.deepgram);
      setDeepgramKey(null);
    }
  }, []);

  const saveOpenaiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (trimmed) {
      await AsyncStorage.setItem(KEYS.openai, trimmed);
      setOpenaiKey(trimmed);
    } else {
      await AsyncStorage.removeItem(KEYS.openai);
      setOpenaiKey(null);
    }
  }, []);

  const hasAnyKey = deepgramKey != null || openaiKey != null;

  return {
    deepgramKey,
    openaiKey,
    loading,
    hasAnyKey,
    saveDeepgramKey,
    saveOpenaiKey,
  };
}
