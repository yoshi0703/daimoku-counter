import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/src/contexts/ThemeContext";
import { FONT_SIZE, SPACING, TOUCH_TARGET } from "@/src/constants/theme";

interface Props {
  deepgramKey: string | null;
  openaiKey: string | null;
  onSaveDeepgram: (key: string) => Promise<void>;
  onSaveOpenai: (key: string) => Promise<void>;
}

export function ApiKeySettings({
  deepgramKey,
  openaiKey,
  onSaveDeepgram,
  onSaveOpenai,
}: Props) {
  const { colors, isDark } = useTheme();
  const [dgInput, setDgInput] = useState(deepgramKey ?? "");
  const [oaInput, setOaInput] = useState(openaiKey ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setDgInput(deepgramKey ?? "");
  }, [deepgramKey]);

  useEffect(() => {
    setOaInput(openaiKey ?? "");
  }, [openaiKey]);

  const handleSave = async () => {
    setSaveState("saving");
    try {
      await Promise.all([
        onSaveDeepgram(dgInput),
        onSaveOpenai(oaInput),
      ]);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  };

  const dgStatus = deepgramKey ? `設定済み (${deepgramKey.slice(0, 6)}...)` : "未設定";
  const oaStatus = openaiKey ? `設定済み (${openaiKey.slice(0, 6)}...)` : "未設定";

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: SPACING.md,
        },
        title: {
          fontSize: FONT_SIZE.lg,
          fontWeight: "600",
          color: colors.text,
        },
        description: {
          fontSize: FONT_SIZE.sm,
          color: colors.textSecondary,
          marginTop: SPACING.xs,
          marginBottom: SPACING.md,
          lineHeight: 20,
        },
        field: {
          marginBottom: SPACING.md,
        },
        label: {
          fontSize: FONT_SIZE.sm,
          fontWeight: "500",
          color: colors.text,
          marginBottom: SPACING.xs,
        },
        input: {
          height: TOUCH_TARGET.minimum,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: SPACING.md,
          fontSize: FONT_SIZE.sm,
          color: colors.text,
          backgroundColor: colors.background,
        },
        hint: {
          fontSize: 11,
          color: colors.textTertiary,
          marginTop: SPACING.xs,
        },
        saveButton: {
          height: TOUCH_TARGET.minimum,
          backgroundColor: colors.text,
          borderRadius: 8,
          justifyContent: "center",
          alignItems: "center",
        },
        pressed: {
          opacity: 0.8,
        },
        disabled: {
          opacity: 0.6,
        },
        saveText: {
          color: colors.background,
          fontSize: FONT_SIZE.md,
          fontWeight: "600",
        },
        statusRow: {
          marginBottom: SPACING.md,
          gap: 4,
        },
        statusText: {
          fontSize: 12,
        },
        statusOk: {
          color: colors.green,
        },
        statusNg: {
          color: colors.textTertiary,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>音声認識 API</Text>
      <Text style={styles.description}>
        APIキーを設定すると、音声認識で自動カウントできます。
        Deepgram優先、なければOpenAIを使用します。
      </Text>
      <View style={styles.statusRow}>
        <Text style={[styles.statusText, deepgramKey ? styles.statusOk : styles.statusNg]}>
          Deepgram: {dgStatus}
        </Text>
        <Text style={[styles.statusText, openaiKey ? styles.statusOk : styles.statusNg]}>
          OpenAI: {oaStatus}
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Deepgram APIキー</Text>
        <TextInput
          style={styles.input}
          value={dgInput}
          onChangeText={setDgInput}
          placeholder="Deepgram APIキーを入力"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          keyboardAppearance={isDark ? "dark" : "light"}
        />
        <Text style={styles.hint}>
          deepgram.com で無料登録 → $200クレジット付き
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>OpenAI APIキー（フォールバック）</Text>
        <TextInput
          style={styles.input}
          value={oaInput}
          onChangeText={setOaInput}
          placeholder="OpenAI APIキーを入力"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          keyboardAppearance={isDark ? "dark" : "light"}
        />
        <Text style={styles.hint}>
          platform.openai.com でAPIキーを取得
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.saveButton,
          pressed && styles.pressed,
          saveState === "saving" && styles.disabled,
        ]}
        onPress={handleSave}
        disabled={saveState === "saving"}
      >
        <Text style={styles.saveText}>
          {saveState === "saving"
            ? "保存中..."
            : saveState === "saved"
              ? "保存しました"
              : saveState === "error"
                ? "保存に失敗しました"
                : "保存"}
        </Text>
      </Pressable>
    </View>
  );
}
