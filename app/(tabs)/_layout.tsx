import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet, View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { useTheme } from "@/src/contexts/ThemeContext";

function LiquidGlassTabBarBackground({ isDark }: { isDark: boolean }) {
  return (
    <View style={styles.glassContainer}>
      <View
        style={[
          styles.glassBase,
          isDark ? styles.glassBaseDark : styles.glassBaseLight,
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glassHighlight,
          isDark ? styles.glassHighlightDark : styles.glassHighlightLight,
        ]}
      />
      {!isDark && <View pointerEvents="none" style={styles.glassOrbBlue} />}
      {!isDark && <View pointerEvents="none" style={styles.glassOrbPurple} />}
    </View>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const isIOS = Platform.OS === "ios";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarHideOnKeyboard: true,
        tabBarStyle: isIOS
          ? [
            styles.iosTabBar,
            isDark ? styles.iosTabBarDark : styles.iosTabBarLight,
          ]
          : [
            styles.defaultTabBar,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ],
        tabBarBackground: isIOS
          ? () => <LiquidGlassTabBarBackground isDark={isDark} />
          : undefined,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
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

const styles = StyleSheet.create({
  defaultTabBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iosTabBar: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 10,
    borderTopWidth: 0,
    borderRadius: 24,
    backgroundColor: "transparent",
    elevation: 0,
  },
  iosTabBarLight: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
  },
  iosTabBarDark: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
  },
  tabBarItem: {
    paddingTop: 4,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  glassContainer: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
  },
  glassBase: {
    ...StyleSheet.absoluteFillObject,
  },
  glassBaseLight: {
    backgroundColor: "rgba(248, 250, 255, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.62)",
  },
  glassBaseDark: {
    backgroundColor: "rgba(28, 28, 30, 0.66)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
  },
  glassHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: 1,
  },
  glassHighlightLight: {
    borderTopColor: "rgba(255, 255, 255, 0.92)",
  },
  glassHighlightDark: {
    borderTopColor: "rgba(255, 255, 255, 0.24)",
  },
  glassOrbBlue: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(57, 133, 247, 0.11)",
    top: -72,
    left: -24,
  },
  glassOrbPurple: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(137, 86, 238, 0.10)",
    top: -64,
    right: -22,
  },
});
