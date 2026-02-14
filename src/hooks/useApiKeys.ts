import {
  default as React,
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
} from "react";
import type { ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

// SecureStore をランタイムで安全にインポート（Expo Go で失敗する場合あり）
let SecureStore: {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SecureStore = require("expo-secure-store");
} catch {
  // fallback to AsyncStorage
}

const KEYS = {
  deepgram: "daimoku_deepgram_key",
  openai: "daimoku_openai_key",
  recognitionMode: "daimoku_recognition_mode",
  audioContribution: "daimoku_audio_contribution",
};

export type RecognitionModePreference = "local" | "cloud";

const SUPABASE_URL = "https://yydkvjaytggaqbhcookk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5ZGt2amF5dGdnYXFiaGNvb2trIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTQ5NzEsImV4cCI6MjA4MjQ5MDk3MX0.a4U_5CpDag6nGQIaFTj5qwq3ajR6t9WhSjQpBPNnB2k";

// ストレージ抽象化: SecureStore → AsyncStorage フォールバック
async function storageGet(key: string): Promise<string | null> {
  try {
    if (SecureStore) return await SecureStore.getItemAsync(key);
  } catch {
    // SecureStore failed, try AsyncStorage
  }
  return AsyncStorage.getItem(key);
}

async function storageSet(key: string, value: string): Promise<void> {
  try {
    if (SecureStore) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
  } catch {
    // SecureStore failed, fall through to AsyncStorage
  }
  await AsyncStorage.setItem(key, value);
}

async function storageDelete(key: string): Promise<void> {
  try {
    if (SecureStore) {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {
    // ignore
  }
  // 両方から削除（移行時の残りデータもクリア）
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface ApiKeysContextValue {
  deepgramKey: string | null;
  openaiKey: string | null;
  recognitionMode: RecognitionModePreference;
  loading: boolean;
  hasAnyKey: boolean;
  saveDeepgramKey: (key: string) => Promise<void>;
  saveOpenaiKey: (key: string) => Promise<void>;
  saveRecognitionMode: (mode: RecognitionModePreference) => Promise<void>;
  getDeepgramToken: () => Promise<string | null>;
  audioContributionEnabled: boolean;
  saveAudioContribution: (enabled: boolean) => Promise<void>;
}

const ApiKeysContext = createContext<ApiKeysContextValue | null>(null);

export function ApiKeysProvider({ children }: { children: ReactNode }) {
  const [deepgramKey, setDeepgramKey] = useState<string | null>(null);
  const [openaiKey, setOpenaiKey] = useState<string | null>(null);
  const [recognitionMode, setRecognitionMode] =
    useState<RecognitionModePreference>("cloud");
  const [audioContributionEnabled, setAudioContributionEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const tokenCacheRef = useRef<TokenCache | null>(null);

  useEffect(() => {
    (async () => {
      const [dg, oa, rm, ac] = await Promise.all([
        storageGet(KEYS.deepgram),
        storageGet(KEYS.openai),
        storageGet(KEYS.recognitionMode),
        storageGet(KEYS.audioContribution),
      ]);
      setDeepgramKey(dg);
      setOpenaiKey(oa);
      setRecognitionMode(rm === "local" ? "local" : "cloud");
      setAudioContributionEnabled(ac === "true");
      setLoading(false);
    })();
  }, []);

  const saveDeepgramKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (trimmed) {
      await storageSet(KEYS.deepgram, trimmed);
      setDeepgramKey(trimmed);
    } else {
      await storageDelete(KEYS.deepgram);
      setDeepgramKey(null);
    }
    tokenCacheRef.current = null;
  }, []);

  const saveOpenaiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (trimmed) {
      await storageSet(KEYS.openai, trimmed);
      setOpenaiKey(trimmed);
    } else {
      await storageDelete(KEYS.openai);
      setOpenaiKey(null);
    }
  }, []);

  const saveRecognitionMode = useCallback(
    async (mode: RecognitionModePreference) => {
      await storageSet(KEYS.recognitionMode, mode);
      setRecognitionMode(mode);
    },
    [],
  );

  const saveAudioContribution = useCallback(async (enabled: boolean) => {
    await storageSet(KEYS.audioContribution, enabled ? "true" : "false");
    setAudioContributionEnabled(enabled);
  }, []);

  const getDeepgramToken = useCallback(async (): Promise<string | null> => {
    const cache = tokenCacheRef.current;
    if (cache && cache.expiresAt - Date.now() > 120_000) {
      return cache.token;
    }

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/deepgram-token`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) return null;

      const data = await response.json();
      if (data.token) {
        tokenCacheRef.current = {
          token: data.token,
          expiresAt: Date.now() + (data.expires_in ?? 600) * 1000,
        };
        return data.token;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const hasAnyKey = Boolean(deepgramKey?.trim() || openaiKey?.trim());

  const value: ApiKeysContextValue = {
    deepgramKey,
    openaiKey,
    recognitionMode,
    loading,
    hasAnyKey,
    saveDeepgramKey,
    saveOpenaiKey,
    saveRecognitionMode,
    getDeepgramToken,
    audioContributionEnabled,
    saveAudioContribution,
  };

  return React.createElement(ApiKeysContext.Provider, { value }, children);
}

export function useApiKeys(): ApiKeysContextValue {
  const ctx = useContext(ApiKeysContext);
  if (!ctx) {
    throw new Error("useApiKeys must be used within ApiKeysProvider");
  }
  return ctx;
}
