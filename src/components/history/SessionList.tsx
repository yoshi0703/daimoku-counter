import { View, Text, FlatList, StyleSheet } from "react-native";
import { COLORS, FONT_SIZE, SPACING } from "@/src/constants/theme";
import { formatDate, formatTime, formatDuration } from "@/src/lib/dateUtils";
import type { Session } from "@/src/types";

interface Props {
  sessions: Session[];
}

function SessionItem({ item }: { item: Session }) {
  return (
    <View style={styles.item}>
      <View>
        <Text style={styles.date}>
          {formatDate(item.started_at)} {formatTime(item.started_at)}
        </Text>
        <Text style={styles.duration}>
          {formatDuration(item.duration_seconds)}
        </Text>
      </View>
      <Text style={styles.count}>{item.count.toLocaleString()}遍</Text>
    </View>
  );
}

export function SessionList({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>まだ記録がありません</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.title}>セッション履歴</Text>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SessionItem item={item} />}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textTertiary,
    marginBottom: SPACING.sm,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },
  date: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  duration: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  count: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "600",
    color: COLORS.text,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  empty: {
    padding: SPACING.xl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textTertiary,
  },
});
