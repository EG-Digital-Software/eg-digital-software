export const colors = {
  primary: '#0B1F3A',
  primaryLight: '#17355E',
  accent: '#2F80ED',
  accentSoft: '#E8F1FD',
  background: '#F5F7FA',
  surface: '#FFFFFF',
  border: '#E3E8EF',
  text: '#101828',
  textMuted: '#667085',
  success: '#12B76A',
  successSoft: '#E6F8EF',
  warning: '#F79009',
  warningSoft: '#FEF3E2',
  danger: '#F04438',
  dangerSoft: '#FEECEB',
  violet: '#7A5AF8',
  violetSoft: '#F0EDFF',
  mention: '#FDE68A',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
};
