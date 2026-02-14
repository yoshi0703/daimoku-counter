import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useColorScheme } from "react-native";
import {
  LIGHT_COLORS,
  DARK_COLORS,
  type Colors,
} from "@/src/constants/theme";

interface ThemeContextValue {
  colors: Colors;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: LIGHT_COLORS,
  isDark: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark ? DARK_COLORS : LIGHT_COLORS,
      isDark,
    }),
    [isDark],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
