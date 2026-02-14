import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";
import { ApiKeysProvider } from "@/src/hooks/useApiKeys";
import { ThemeProvider, useTheme } from "@/src/contexts/ThemeContext";
import { useOnboarding } from "@/src/hooks/useOnboarding";
import { OnboardingScreen } from "@/src/components/onboarding/OnboardingScreen";

function RootContent() {
  const { isDark } = useTheme();
  const { isLoading, hasCompletedOnboarding, completeOnboarding } =
    useOnboarding();

  if (isLoading) return null;

  if (!hasCompletedOnboarding) {
    return (
      <>
        <OnboardingScreen onComplete={completeOnboarding} />
        <StatusBar style={isDark ? "light" : "dark"} />
      </>
    );
  }

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
