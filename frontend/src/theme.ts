// CarryCue design tokens — calm, simple, utility-focused. No gradients.

export const colors = {
  background: "#F8F7F3",
  textPrimary: "#171717",
  textSecondary: "#737373",
  disabled: "#A3A3A3",
  accent: "#FF6B35",
  border: "#E7E5E1",
  surface: "#FFFFFF",
  backdrop: "rgba(23,23,23,0.35)",
  accentSoft: "#FFF1EB",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const type = {
  navTitle: 23, // 22-24
  contextTitle: 19, // 18-20
  checklistItem: 17,
  sectionLabel: 12.5, // 12-13 medium
  secondary: 14.5, // 14-15
  button: 16.5, // 16-17 semibold
};

export const font = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};
