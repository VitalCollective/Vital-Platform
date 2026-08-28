import { Platform, type ViewStyle } from 'react-native';

export const colors = {
  canvas: '#F7F2E8',
  surface: '#FFFDF8',
  surfaceRaised: '#FFFFFF',
  ink: '#27261F',
  inkMuted: '#666257',
  inkSubtle: '#837E72',
  border: '#D9D1C2',
  borderStrong: '#B9AF9D',
  brand: '#2F4B3C',
  brandPressed: '#22382D',
  brandSoft: '#DFE8DE',
  focus: '#315E7D',
  danger: '#9B342D',
  dangerSoft: '#F9E4E0',
  success: '#2E694F',
  successSoft: '#E0EEE5',
  warning: '#835F21',
  warningSoft: '#F5EACF',
  white: '#FFFFFF',
} as const;

export const sectionColors = {
  'Vital Kids': { accent: '#A84F35', soft: '#F2DED5' },
  'Vital Together': { accent: '#365F66', soft: '#DCE8E8' },
  'Vital Life': { accent: '#49633D', soft: '#E1E9DA' },
  'Vital Food': { accent: '#8A622A', soft: '#F1E5CF' },
  'Vital Mums': { accent: '#76506B', soft: '#EADDE7' },
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  headingFamily: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    web: 'Georgia, Times New Roman, serif',
    default: 'serif',
  }),
  bodyFamily: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    web: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    default: 'sans-serif',
  }),
  display: 40,
  title: 30,
  heading: 22,
  subheading: 18,
  body: 16,
  small: 14,
  eyebrow: 12,
} as const;

export const shadows: { card: ViewStyle } = {
  card: Platform.select<ViewStyle>({
    web: { boxShadow: '0 8px 24px rgba(55, 48, 37, 0.08)' },
    default: {
      shadowColor: '#372F25',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 2,
    },
  }) ?? {},
};

export const layout = {
  contentMaxWidth: 760,
  touchTarget: 48,
} as const;
