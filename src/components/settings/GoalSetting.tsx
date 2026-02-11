import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import { useState } from "react";
import { COLORS, FONT_SIZE, SPACING, TOUCH_TARGET } from "@/src/constants/theme";

interface Props {
  currentTarget: number;
  onUpdate: (target: number) => void;
}

const PRESETS = [100, 300, 500, 1000, 3000];

export function GoalSetting({ currentTarget, onUpdate }: Props) {
  const [customValue, setCustomValue] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const handlePreset = (value: number) => {
    setShowCustom(false);
    onUpdate(value);
  };

  const handleCustomSubmit = () => {
    const num = parseInt(customValue, 10);
    if (num > 0) {
      onUpdate(num);
      setCustomValue("");
      setShowCustom(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>日々の目標</Text>
      <Text style={styles.current}>
        現在: {currentTarget.toLocaleString()}遍/日
      </Text>

      <View style={styles.presets}>
        {PRESETS.map((value) => (
          <Pressable
            key={value}
            style={[
              styles.preset,
              value === currentTarget && styles.presetActive,
            ]}
            onPress={() => handlePreset(value)}
          >
            <Text
              style={[
                styles.presetText,
                value === currentTarget && styles.presetTextActive,
              ]}
            >
              {value.toLocaleString()}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.preset, showCustom && styles.presetActive]}
          onPress={() => setShowCustom(true)}
        >
          <Text
            style={[
              styles.presetText,
              showCustom && styles.presetTextActive,
            ]}
          >
            カスタム
          </Text>
        </Pressable>
      </View>

      {showCustom && (
        <View style={styles.customRow}>
          <TextInput
            style={styles.input}
            value={customValue}
            onChangeText={setCustomValue}
            placeholder="目標数を入力"
            placeholderTextColor={COLORS.textTertiary}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={handleCustomSubmit}
          />
          <Pressable style={styles.submitButton} onPress={handleCustomSubmit}>
            <Text style={styles.submitText}>設定</Text>
          </Pressable>
        </View>
      )}
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
  current: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  preset: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    minHeight: TOUCH_TARGET.minimum,
    justifyContent: "center",
  },
  presetActive: {
    backgroundColor: COLORS.text,
    borderColor: COLORS.text,
  },
  presetText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
  },
  presetTextActive: {
    color: COLORS.background,
  },
  customRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  input: {
    flex: 1,
    height: TOUCH_TARGET.minimum,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  submitButton: {
    height: TOUCH_TARGET.minimum,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.text,
    borderRadius: 8,
    justifyContent: "center",
  },
  submitText: {
    color: COLORS.background,
    fontSize: FONT_SIZE.md,
    fontWeight: "600",
  },
});
