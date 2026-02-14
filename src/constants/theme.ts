export const LIGHT_COLORS = {
  background: "#FFFFFF",
  surface: "#F9FAFB",
  text: "#000000",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  border: "#E5E7EB",
  // アクセントカラー — 本当に必要な場所のみ
  red: "#E75248",
  orange: "#E97239",
  yellow: "#F6C443",
  green: "#53B559",
  blue: "#3985F7",
  purple: "#8956EE",
  pink: "#ED71AB",
} as const;

export type Colors = { [K in keyof typeof LIGHT_COLORS]: string };

export const DARK_COLORS: Colors = {
  background: "#000000",
  surface: "#1C1C1E",
  text: "#FFFFFF",
  textSecondary: "#98989D",
  textTertiary: "#636366",
  border: "#38383A",
  red: "#E75248",
  orange: "#E97239",
  yellow: "#F6C443",
  green: "#53B559",
  blue: "#3985F7",
  purple: "#8956EE",
  pink: "#ED71AB",
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
