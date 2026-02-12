import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
} from "react";
import type { ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import React from "react";

const KEYS = {
  deepgram: "daimoku_deepgram_key",
  openai: "daimoku_openai_key",
};

const SUPABASE_URL = "https://yydkvjaytggaqbhcookk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5ZGt2amF5dGdnYXFiaGNvb2trIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTQ5NzEsImV4cCI6MjA4MjQ5MDk3MX0.a4U_5CpDag6nGQIaFTj5qwq3ajR6t9WhSjQpBPNnB2k";

interface TokenCache {
  token: string;
  expiresAt: number;
}

interface ApiKeysContextValue {
  deepgramKey: string | null;
  openaiKey: string | null;
  loading: boolean;
  hasAnyKey: boolean;
  saveDeepgramKey: (key: string) => Promise<void>;
  saveOpenaiKey: (key: string) => Promise<void>;
  getDeepgramToken: () => Promise<string | null>;
}

const ApiKeysContext = createContext<ApiKeysContextValue | null>(null);

export function ApiKeysProvider({ children }: { children: ReactNode }) {
  const [deepgramKey, setDeepgramKey] = useState<string | null>(null);
  const [openaiKey, setOpenaiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const tokenCacheRef = useRef<TokenCache | null>(null);

  useEffect(() => {
    (async () => {
      const [dg, oa] = await Promise.all([
        SecureStore.getItemAsync(KEYS.deepgram),
        SecureStore.getItemAsync(KEYS.openai),
      ]);
      setDeepgramKey(dg);
      setOpenaiKey(oa);
      setLoading(false);
    })();
  }, []);

  const saveDeepgramKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (trimmed) {
      await SecureStore.setItemAsync(KEYS.deepgram, trimmed);
      setDeepgramKey(trimmed);
    } else {
      await SecureStore.deleteItemAsync(KEYS.deepgram);
      setDeepgramKey(null);
    }
    tokenCacheRef.current = null;
  }, []);

  const saveOpenaiKey = useCallback(async (key: string) => {
    const trimmed = key.trim();
    if (trimmed) {
      await SecureStore.setItemAsync(KEYS.openai, trimmed);
      setOpenaiKey(trimmed);
    } else {
      await SecureStore.deleteItemAsync(KEYS.openai);
      setOpenaiKey(null);
    }
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

  const hasAnyKey = deepgramKey != null || openaiKey != null;

  const value: ApiKeysContextValue = {
    deepgramKey,
    openaiKey,
    loading,
    hasAnyKey,
    saveDeepgramKey,
    saveOpenaiKey,
    getDeepgramToken,
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
