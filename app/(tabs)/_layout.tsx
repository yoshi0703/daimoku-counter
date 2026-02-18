import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/src/contexts/ThemeContext";

export default function TabLayout() {
  const { colors } = useTheme();

  if (Platform.OS !== "ios") {
    return (
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.text,
          tabBarInactiveTintColor: colors.textTertiary,
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "カウンター",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="mic-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: "履歴",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="bar-chart-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "設定",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings-outline" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    );
  }

  return (
    <NativeTabs minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <Label>カウンター</Label>
        <Icon sf={{ default: "mic", selected: "mic.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="explore">
        <Label>履歴</Label>
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Label>設定</Label>
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
