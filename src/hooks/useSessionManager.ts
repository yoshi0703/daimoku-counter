import { useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase";
import type { Session } from "@/src/types";

async function getDeviceId(): Promise<string | null> {
  return AsyncStorage.getItem("@device_id");
}

export function useSessionManager() {
  const saveSession = useCallback(
    async (count: number, durationSeconds: number) => {
      if (count === 0) return null;

      const now = new Date().toISOString();
      const startedAt = new Date(
        Date.now() - durationSeconds * 1000,
      ).toISOString();

      const deviceId = await getDeviceId();
      const { data, error } = await supabase
        .from("daimoku_sessions")
        .insert({
          started_at: startedAt,
          ended_at: now,
          count,
          duration_seconds: durationSeconds,
          device_id: deviceId,
        })
        .select()
        .single();

      if (error) {
        console.error("Failed to save session:", error);
        return null;
      }
      return data as Session;
    },
    [],
  );

  const getSessions = useCallback(
    async (limit = 20): Promise<Session[]> => {
      const deviceId = await getDeviceId();
      if (!deviceId) return [];
      const { data, error } = await supabase
        .from("daimoku_sessions")
        .select("*")
        .eq("device_id", deviceId)
        .order("started_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Failed to fetch sessions:", error);
        return [];
      }
      return data as Session[];
    },
    [],
  );

  const getSessionsForDate = useCallback(
    async (date: string): Promise<Session[]> => {
      const deviceId = await getDeviceId();
      if (!deviceId) return [];
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from("daimoku_sessions")
        .select("*")
        .eq("device_id", deviceId)
        .gte("started_at", startOfDay)
        .lte("started_at", endOfDay)
        .order("started_at", { ascending: false });

      if (error) {
        console.error("Failed to fetch sessions for date:", error);
        return [];
      }
      return data as Session[];
    },
    [],
  );

  const deleteSession = useCallback(async (id: string) => {
    const deviceId = await getDeviceId();
    const { error } = await supabase
      .from("daimoku_sessions")
      .delete()
      .eq("id", id)
      .eq("device_id", deviceId);

    if (error) {
      console.error("Failed to delete session:", error);
    }
  }, []);

  return { saveSession, getSessions, getSessionsForDate, deleteSession };
}
