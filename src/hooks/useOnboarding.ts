import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "daimoku_onboarding_completed";

export function useOnboarding() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((value) => {
      setHasCompletedOnboarding(value === "true");
      setIsLoading(false);
    });
  }, []);

  const completeOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(KEY, "true");
    setHasCompletedOnboarding(true);
  }, []);

  return { isLoading, hasCompletedOnboarding, completeOnboarding };
}
