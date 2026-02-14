import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { ApiKeysProvider } from "@/src/hooks/useApiKeys";
import { ThemeProvider, useTheme } from "@/src/contexts/ThemeContext";

function RootContent() {
  const { isDark } = useTheme();
  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={isDark ? "light" : "dark"} />
    </>
  );
}

export default function RootLayout() {
  return (
    <ApiKeysProvider>
      <ThemeProvider>
        <RootContent />
      </ThemeProvider>
    </ApiKeysProvider>
  );
}
