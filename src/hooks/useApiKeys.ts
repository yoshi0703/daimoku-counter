import { useState, useEffect, useCallback, useRef } from "react";
import * as SecureStore from "expo-secure-store";

const KEYS = {
  deepgram: "daimoku_deepgram_key",
  openai: "daimoku_openai_key",
};

const SUPABASE_URL = "https://yydkvjaytggaqbhcookk.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5ZGt2amF5dGdnYXFiaGNvb2trIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5MTQ5NzEsImV4cCI6MjA4MjQ5MDk3MX0.a4U_5CpDag6nGQIaFTj9qwq3ajR6t9WhSjQpBPNnB2k";

interface TokenCache {
  token: string;
  expiresAt: number; // Unix ms
}

export function useApiKeys() {
  const [deepgramKey, setDeepgramKey] = useState<string | null>(null);
  const [openaiKey, setOpenaiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Deepgram JWT トークンキャッシュ
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
    // キー変更時はトークンキャッシュをクリア
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

  /**
   * Supabase Edge Function 経由で Deepgram 短期トークンを取得。
   * キャッシュが有効ならそれを返す（期限の2分前に更新）。
   */
  const getDeepgramToken = useCallback(async (): Promise<string | null> => {
    // キャッシュが有効（期限の2分前まで）ならそのまま返す
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

      if (!response.ok) {
        console.warn("Token fetch failed:", response.status);
        return null;
      }

      const data = await response.json();
      if (data.token) {
        tokenCacheRef.current = {
          token: data.token,
          expiresAt: Date.now() + (data.expires_in ?? 600) * 1000,
        };
        return data.token;
      }
      return null;
    } catch (e) {
      console.warn("Token fetch error:", e);
      return null;
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
    getDeepgramToken,
  };
}
