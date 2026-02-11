import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/src/lib/supabase";
import type { Goal } from "@/src/types";

export function useGoal() {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchActiveGoal = useCallback(async () => {
    const { data, error } = await supabase
      .from("daimoku_goals")
      .select("*")
      .eq("is_active", true)
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
      // 既存の目標を非アクティブに
      await supabase
        .from("daimoku_goals")
        .update({ is_active: false })
        .eq("is_active", true);

      // 新しい目標を作成
      const { data, error } = await supabase
        .from("daimoku_goals")
        .insert({ daily_target: dailyTarget, is_active: true })
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
