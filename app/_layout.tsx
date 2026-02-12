import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { ApiKeysProvider } from "@/src/hooks/useApiKeys";

export default function RootLayout() {
  return (
    <ApiKeysProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="dark" />
    </ApiKeysProvider>
  );
}
