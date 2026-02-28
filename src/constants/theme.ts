export const LIGHT_COLORS = {
  background: "#FFFFFF",
  surface: "#F7F8FC",           // Cool gray-blue tint
  text: "#1A1D26",              // Soft dark, not pure black
  textSecondary: "#6E7484",     // Medium gray
  textTertiary: "#A0A6B4",     // Light gray
  border: "#E8EAF0",           // Very subtle cool border

  // Brand colors - Lotus meets Mint/Teal
  primary: "#3CB8AD",          // Mint/teal - main accent
  primaryLight: "#EAF6F5",     // Very light teal for subtle backgrounds

  // Accent colors - softer, more cohesive
  red: "#D4727A",              // Soft rose (stop/error)
  orange: "#D4A853",           // Warm gold
  yellow: "#F0D68A",           // Soft gold
  green: "#6EC69A",            // Fresh mint-green (success/active)
  blue: "#7BAFD4",             // Sky blue
  purple: "#9B8EC4",           // Soft lavender
  pink: "#E8A0B4",             // Lotus pink

  // Gradient palette (for LinearGradient components)
  gradientStart: "#F0C4D0",    // Soft pink
  gradientMid: "#F5E6B8",      // Soft gold
  gradientEnd: "#A8D8EA",      // Soft sky blue

  // Elevated surface (for cards with shadows)
  cardBackground: "#FFFFFF",
} as const;

export type Colors = { [K in keyof typeof LIGHT_COLORS]: string };

export const DARK_COLORS: Colors = {
  background: "#0D0E12",       // Very dark blue-black
  surface: "#1A1C24",          // Dark surface with blue tint
  text: "#F0F1F5",             // Soft white
  textSecondary: "#8B8FA0",    // Medium gray
  textTertiary: "#5A5E6E",     // Dim gray
  border: "#2A2D38",           // Subtle dark border

  primary: "#4ECDC4",          // Brighter teal for dark mode
  primaryLight: "#1A2F2D",     // Very dark teal

  red: "#E07A82",
  orange: "#DEB060",
  yellow: "#F0D68A",
  green: "#7BD4A4",
  blue: "#8BBFDE",
  purple: "#A99BD0",
  pink: "#EDA8BC",

  gradientStart: "#D4727A",
  gradientMid: "#D4A853",
  gradientEnd: "#7BAFD4",

  cardBackground: "#1A1C24",
} as const;

/** 後方互換: 静的にライトカラーを参照する既存コードのため */
export const COLORS = LIGHT_COLORS;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FONT_SIZE = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
  counter: 80,
  counterUnit: 18,
} as const;

export const TOUCH_TARGET = {
  minimum: 44,
  recommended: 48,
} as const;

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const SHADOWS = {
  sm: {
    shadowColor: "#1A1D26",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  md: {
    shadowColor: "#1A1D26",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: "#1A1D26",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
} as const;

// Gradient presets for use with expo-linear-gradient
export const GRADIENTS = {
  // Aurora/holographic gradient (primary decorative)
  aurora: ['#F0C4D0', '#F5E6B8', '#A8D8EA'] as const,
  // Button gradient (pink to teal)
  button: ['#E8A0B4', '#A8D8C8', '#7BAFD4'] as const,
  // Subtle surface gradient
  surface: ['#FFF0F5', '#F0F8FF'] as const,
} as const;
