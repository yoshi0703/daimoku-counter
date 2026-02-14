import { useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, StyleSheet, Platform } from "react-native";
import Constants from "expo-constants";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING, TOUCH_TARGET } from "@/src/constants/theme";
import { supabase } from "@/src/lib/supabase";

type FeedbackType = "improvement" | "bug" | "inquiry";

const TYPE_LABELS: Record<FeedbackType, string> = {
  improvement: "改善提案",
  bug: "不具合報告",
  inquiry: "問い合わせ",
};

export function FeedbackForm() {
  const { colors, isDark } = useTheme();
  const [type, setType] = useState<FeedbackType>("improvement");
  const [summary, setSummary] = useState("");
  const [details, setDetails] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const remaining = useMemo(() => Math.max(0, 20 - details.trim().length), [details]);

  const handleSend = async () => {
    const trimmedDetails = details.trim();
    if (trimmedDetails.length < 20) {
      setError("内容は20文字以上で入力してください。");
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("sending");

    try {
      const { error: insertError } = await supabase
        .from("daimoku_feedback")
        .insert({
          feedback_type: type,
          summary: summary.trim() || null,
          details: trimmedDetails,
          contact: contact.trim() || null,
          app_version: Constants.expoConfig?.version ?? null,
          platform: Platform.OS,
        });

      if (insertError) {
        setStatus("error");
        setError(
          "送信に失敗しました。設定されたSupabaseテーブルとRLSを確認してください。",
        );
        return;
      }

      setStatus("saved");
      setSummary("");
      setDetails("");
      setContact("");
      setTimeout(() => {
        setStatus("idle");
      }, 2000);
    } catch {
      setStatus("error");
      setError("送信処理に失敗しました。時間をおいて再試行してください。");
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: SPACING.md,
          gap: SPACING.sm,
        },
        title: {
          fontSize: FONT_SIZE.lg,
          fontWeight: "600",
          color: colors.text,
        },
        description: {
          fontSize: FONT_SIZE.sm,
          color: colors.textSecondary,
          lineHeight: 20,
        },
        typeRow: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: SPACING.sm,
        },
        typeChip: {
          minHeight: TOUCH_TARGET.minimum,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
          paddingHorizontal: SPACING.md,
          justifyContent: "center",
        },
        typeChipActive: {
          borderColor: colors.text,
          backgroundColor: colors.text,
        },
        typeText: {
          fontSize: FONT_SIZE.sm,
          color: colors.text,
          fontWeight: "500",
        },
        typeTextActive: {
          color: colors.background,
        },
        field: {
          gap: SPACING.xs,
        },
        label: {
          fontSize: FONT_SIZE.sm,
          color: colors.text,
          fontWeight: "500",
        },
        input: {
          minHeight: TOUCH_TARGET.minimum,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: SPACING.md,
          paddingVertical: SPACING.sm,
          fontSize: FONT_SIZE.sm,
          color: colors.text,
          backgroundColor: colors.background,
        },
        textArea: {
          minHeight: 120,
        },
        hint: {
          fontSize: FONT_SIZE.xs,
          color: colors.textTertiary,
        },
        sendButton: {
          minHeight: TOUCH_TARGET.minimum,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.text,
        },
        pressed: {
          opacity: 0.85,
        },
        disabled: {
          opacity: 0.6,
        },
        sendText: {
          color: colors.background,
          fontSize: FONT_SIZE.md,
          fontWeight: "600",
        },
        error: {
          color: colors.red,
          fontSize: FONT_SIZE.xs,
        },
        note: {
          color: colors.textTertiary,
          fontSize: FONT_SIZE.xs,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>改善・問い合わせ</Text>
      <Text style={styles.description}>
        改善提案や不具合報告をアプリ内から送信できます。
      </Text>

      <View style={styles.typeRow}>
        {(Object.keys(TYPE_LABELS) as FeedbackType[]).map((key) => (
          <Pressable
            key={key}
            style={[styles.typeChip, type === key && styles.typeChipActive]}
            onPress={() => setType(key)}
          >
            <Text style={[styles.typeText, type === key && styles.typeTextActive]}>
              {TYPE_LABELS[key]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>概要（任意）</Text>
        <TextInput
          style={styles.input}
          value={summary}
          onChangeText={setSummary}
          placeholder="例: カウント精度の改善"
          placeholderTextColor={colors.textTertiary}
          keyboardAppearance={isDark ? "dark" : "light"}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>内容（必須）</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={details}
          onChangeText={setDetails}
          placeholder="状況や再現手順を具体的に書いてください"
          placeholderTextColor={colors.textTertiary}
          multiline
          textAlignVertical="top"
          keyboardAppearance={isDark ? "dark" : "light"}
        />
        <Text style={styles.hint}>
          {remaining > 0 ? `あと${remaining}文字で送信可能` : "送信可能です"}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>連絡先（任意）</Text>
        <TextInput
          style={styles.input}
          value={contact}
          onChangeText={setContact}
          placeholder="返信が必要な場合のみメールアドレスを入力"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardAppearance={isDark ? "dark" : "light"}
        />
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.sendButton,
          pressed && styles.pressed,
          status === "sending" && styles.disabled,
        ]}
        onPress={handleSend}
        disabled={status === "sending"}
      >
        <Text style={styles.sendText}>
          {status === "sending"
            ? "送信中..."
            : status === "saved"
              ? "送信しました"
              : "送信する"}
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.note}>
        送信内容は Supabase の `daimoku_feedback` テーブルに保存されます。
      </Text>
    </View>
  );
}
