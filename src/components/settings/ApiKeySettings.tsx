import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { useState } from "react";
import { COLORS, FONT_SIZE, SPACING, TOUCH_TARGET } from "@/src/constants/theme";

interface Props {
  deepgramKey: string | null;
  openaiKey: string | null;
  onSaveDeepgram: (key: string) => void;
  onSaveOpenai: (key: string) => void;
}

export function ApiKeySettings({
  deepgramKey,
  openaiKey,
  onSaveDeepgram,
  onSaveOpenai,
}: Props) {
  const [dgInput, setDgInput] = useState(deepgramKey ?? "");
  const [oaInput, setOaInput] = useState(openaiKey ?? "");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSaveDeepgram(dgInput);
    onSaveOpenai(oaInput);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>音声認識 API</Text>
      <Text style={styles.description}>
        APIキーを設定すると、音声認識で自動カウントできます。
        Deepgram優先、なければOpenAIを使用します。
      </Text>

      <View style={styles.field}>
        <Text style={styles.label}>Deepgram APIキー</Text>
        <TextInput
          style={styles.input}
          value={dgInput}
          onChangeText={setDgInput}
          placeholder="dg_..."
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
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
          placeholder="sk-..."
          placeholderTextColor={COLORS.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Text style={styles.hint}>
          platform.openai.com でAPIキーを取得
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.saveButton,
          pressed && styles.pressed,
        ]}
        onPress={handleSave}
      >
        <Text style={styles.saveText}>
          {saved ? "保存しました" : "保存"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.lg,
    fontWeight: "600",
    color: COLORS.text,
  },
  description: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
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
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  input: {
    height: TOUCH_TARGET.minimum,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  hint: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginTop: SPACING.xs,
  },
  saveButton: {
    height: TOUCH_TARGET.minimum,
    backgroundColor: COLORS.text,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  pressed: {
    opacity: 0.8,
  },
  saveText: {
    color: COLORS.background,
    fontSize: FONT_SIZE.md,
    fontWeight: "600",
  },
});
