import { useCallback } from "react";
import { supabase } from "@/src/lib/supabase";
import type { Session } from "@/src/types";

export function useSessionManager() {
  const saveSession = useCallback(
    async (count: number, durationSeconds: number) => {
      if (count === 0) return null;

      const now = new Date().toISOString();
      const startedAt = new Date(
        Date.now() - durationSeconds * 1000,
      ).toISOString();

      const { data, error } = await supabase
        .from("daimoku_sessions")
        .insert({
          started_at: startedAt,
          ended_at: now,
          count,
          duration_seconds: durationSeconds,
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
      const { data, error } = await supabase
        .from("daimoku_sessions")
        .select("*")
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
      const startOfDay = `${date}T00:00:00.000Z`;
      const endOfDay = `${date}T23:59:59.999Z`;

      const { data, error } = await supabase
        .from("daimoku_sessions")
        .select("*")
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
    const { error } = await supabase
      .from("daimoku_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Failed to delete session:", error);
    }
  }, []);

  return { saveSession, getSessions, getSessionsForDate, deleteSession };
}
