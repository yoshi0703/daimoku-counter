import { ScrollView, StyleSheet, RefreshControl } from "react-native";
import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DailyChart } from "@/src/components/history/DailyChart";
import { StatsSummary } from "@/src/components/history/StatsSummary";
import { SessionList } from "@/src/components/history/SessionList";
import { useStats } from "@/src/hooks/useStats";
import { useSessionManager } from "@/src/hooks/useSessionManager";
import { useTheme } from "@/src/contexts/ThemeContext";
import { SPACING } from "@/src/constants/theme";
import type { Session } from "@/src/types";

export default function HistoryScreen() {
  const { colors } = useTheme();
  const { dailyRecords, fetchDailyRecords } = useStats();
  const { getSessions } = useSessionManager();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    await fetchDailyRecords(30);
    const s = await getSessions(20);
    setSessions(s);
  }, [fetchDailyRecords, getSessions]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scroll: {
          flex: 1,
        },
        content: {
          padding: SPACING.lg,
          gap: SPACING.lg,
          paddingBottom: SPACING.xxl,
        },
      }),
    [colors],
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <StatsSummary records={dailyRecords} />
        <DailyChart records={dailyRecords} />
        <SessionList sessions={sessions} />
      </ScrollView>
    </SafeAreaView>
  );
}
