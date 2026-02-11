import { useState, useCallback } from "react";
import { supabase } from "@/src/lib/supabase";
import type { DailyRecord } from "@/src/types";
import { getDaysAgo } from "@/src/lib/dateUtils";

export function useStats() {
  const [dailyRecords, setDailyRecords] = useState<DailyRecord[]>([]);
  const [todayTotal, setTodayTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchDailyRecords = useCallback(async (days = 7) => {
    setLoading(true);
    const since = getDaysAgo(days);

    const { data, error } = await supabase
      .from("daimoku_sessions")
      .select("started_at, count, duration_seconds")
      .gte("started_at", since)
      .order("started_at", { ascending: true });

    if (error) {
      console.error("Failed to fetch stats:", error);
      setLoading(false);
      return;
    }

    // 日別に集計
    const byDate = new Map<string, DailyRecord>();

    for (const row of data ?? []) {
      const date = row.started_at.slice(0, 10);
      const existing = byDate.get(date);
      if (existing) {
        existing.total_count += row.count;
        existing.total_duration_seconds += row.duration_seconds;
        existing.session_count += 1;
      } else {
        byDate.set(date, {
          date,
          total_count: row.count,
          total_duration_seconds: row.duration_seconds,
          session_count: 1,
        });
      }
    }

    const records = Array.from(byDate.values());
    setDailyRecords(records);

    // 今日の合計
    const today = new Date().toISOString().slice(0, 10);
    const todayRecord = byDate.get(today);
    setTodayTotal(todayRecord?.total_count ?? 0);

    setLoading(false);
  }, []);

  const fetchTodayTotal = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const startOfDay = `${today}T00:00:00.000Z`;

    const { data, error } = await supabase
      .from("daimoku_sessions")
      .select("count")
      .gte("started_at", startOfDay);

    if (error) {
      console.error("Failed to fetch today total:", error);
      return;
    }

    const total = (data ?? []).reduce((sum, row) => sum + row.count, 0);
    setTodayTotal(total);
  }, []);

  return { dailyRecords, todayTotal, loading, fetchDailyRecords, fetchTodayTotal };
}
