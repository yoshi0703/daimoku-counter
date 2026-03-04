import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/src/lib/supabase";
import type { Goal } from "@/src/types";

export function useGoal() {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActiveGoal = useCallback(async () => {
    const deviceId = await AsyncStorage.getItem("@device_id");
    if (!deviceId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("daimoku_goals")
      .select("*")
      .eq("is_active", true)
      .eq("device_id", deviceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Failed to fetch goal:", error);
    }
    setGoal(data as Goal | null);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchActiveGoal();
  }, [fetchActiveGoal]);

  const updateGoal = useCallback(
    async (dailyTarget: number) => {
      const deviceId = await AsyncStorage.getItem("@device_id");
      if (!deviceId) {
        console.error("device_id not found");
        return;
      }

      // 既存の目標を非アクティブに
      await supabase
        .from("daimoku_goals")
        .update({ is_active: false })
        .eq("is_active", true)
        .eq("device_id", deviceId);

      // 新しい目標を作成
      const { data, error } = await supabase
        .from("daimoku_goals")
        .insert({ daily_target: dailyTarget, is_active: true, device_id: deviceId })
        .select()
        .single();

      if (error) {
        console.error("Failed to update goal:", error);
        return;
      }
      setGoal(data as Goal);
    },
    [],
  );

  return { goal, loading, updateGoal, refreshGoal: fetchActiveGoal };
}
