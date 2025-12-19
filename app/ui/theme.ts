// app/ui/theme.ts
// CampusRide design tokens (colors, spacing, typography, shadows)

export const Colors = {
  primary: '#FF8347',
  primaryDark: '#E96A2D',
  primaryLight: '#FFC5A0',
  secondary: '#F1B6FF',
  secondaryDark: '#DFA0F2',
  secondaryLight: '#F9DDFF',
  accent: '#A685FF',
  accentSoft: '#EEE6FF',
  white: '#FFFFFF',
  ink: '#1E2235',
  inkSoft: '#3D425C',
  gray900: '#1F2234',
  gray700: '#4A4E68',
  gray600: '#5F637C',
  gray500: '#7B8097',
  gray400: '#A2A7BA',
  gray300: '#D4D7E3',
  gray200: '#E6E8F2',
  gray150: '#EEF0F9',
  gray100: '#F6F6FB',
  gray50: '#FFFFFF',
  bg: 'rgba(255, 255, 255, 0.08)',
  card: '#FFFFFF',
  success: '#4CC38A',
  successLight: '#DAF5E8',
  warning: '#F9CB66',
  warningLight: '#FFF3D6',
  danger: '#F16B6B',
  dangerLight: '#FFE0E0',
};

type GradientStops = readonly [string, string, string?];

export const Gradients: Record<
  'sunset' | 'twilight' | 'lavender' | 'cta' | 'card' | 'soft' | 'danger' | 'success' | 'background' | 'tabBar' | 'ocean' | 'driver',
  GradientStops
> = {
  sunset: ['#FF8347', '#FF9864', '#F1B6FF'],
  twilight: ['#7A5FFF', '#7A5FFF', '#F1B6FF'],
  lavender: ['#F1B6FF', '#F9D6FF', '#FFFFFF'],
  cta: ['#FF8347', '#FF965B', '#FFB686'],
  card: ['#FFFFFF', '#FFF7FF', '#F9ECFF'],
  soft: ['#FFF4EC', '#FFF2FF', '#F8F9FF'],
  danger: ['#F16B6B', '#FF7F7F', '#FF9D9D'],
  success: ['#4CC38A', '#5ED09B', '#8BE7BB'],
  background: ['#7A5FFF', '#7A5FFF', '#F1B6FF'],
  tabBar: ['#7A5FFF', '#7A5FFF', '#F1B6FF'],
  ocean: ['#7A5FFF', '#7A5FFF', '#F1B6FF'],
  driver: ['#FF9052', '#FFAA6C', '#FFD2A6'],
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const Radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  '2xl': 30,
  pill: 999,
};

export const Typography = {
  heading: {
    fontWeight: "800" as const,
    letterSpacing: -0.2,
  },
  subheading: {
    fontWeight: "700" as const,
    letterSpacing: -0.15,
  },
  body: {
    fontWeight: "500" as const,
    letterSpacing: 0,
  },
  caption: {
    fontWeight: "600" as const,
    letterSpacing: 0.2,
    textTransform: "uppercase" as const,
  },
};

export const Shadows = {
  card: {
    shadowColor: "#0B2545",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  floating: {
    shadowColor: "#0B2545",
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 10,
  },
};
