import { Platform, type ViewStyle } from 'react-native';

export const colors = {
  canvas: '#FDF5E7',
  surface: '#FFFCF6',
  surfaceRaised: '#FFFFFF',
  ink: '#344834',
  inkMuted: '#596859',
  inkSubtle: '#778277',
  border: '#D8DCCF',
  borderStrong: '#B8C1B3',
  brand: '#344834',
  brandPressed: '#253625',
  brandSoft: '#E8EDE6',
  onBrand: '#FFFFFF',
  onBrandMuted: '#E8EDE6',
  plum: '#783F49',
  plumPressed: '#60323A',
  plumSoft: '#F1E6E8',
  focus: '#783F49',
  danger: '#9B342D',
  dangerSoft: '#F9E4E0',
  success: '#344834',
  successSoft: '#E8EDE6',
  warning: '#783F49',
  warningSoft: '#F1E6E8',
  white: '#FFFFFF',
} as const;

export const backgrounds = {
  app: colors.canvas,
  card: colors.surface,
  raised: colors.surfaceRaised,
  softGreen: colors.brandSoft,
  softPlum: colors.plumSoft,
} as const;

export const sectionColors = {
  'Vital Kids': { accent: colors.brand, soft: colors.brandSoft },
  'Vital Together': { accent: colors.plum, soft: colors.plumSoft },
  'Vital Life': { accent: colors.brand, soft: colors.brandSoft },
  'Vital Food': { accent: colors.plum, soft: colors.plumSoft },
  'Vital Mums': { accent: colors.plum, soft: colors.plumSoft },
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  section: 40,
  xxl: 48,
  xxxl: 64,
  page: 80,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const fontFamilies = {
  heading: 'DMSerifDisplay_400Regular',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const typography = {
  headingFamily: fontFamilies.heading,
  bodyFamily: fontFamilies.body,
  bodyMediumFamily: fontFamilies.bodyMedium,
  bodySemiboldFamily: fontFamilies.bodySemibold,
  bodyBoldFamily: fontFamilies.bodyBold,
  display: 48,
  title: 34,
  heading: 26,
  subheading: 20,
  body: 16,
  small: 14,
  eyebrow: 12,
} as const;

export const shadows: { card: ViewStyle } = {
  card: Platform.select<ViewStyle>({
    web: { boxShadow: '0 6px 18px rgba(52, 72, 52, 0.06)' },
    default: {
      shadowColor: colors.brand,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 10,
      elevation: 1,
    },
  }) ?? {},
};

export const breakpoints = {
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

export const layout = {
  contentMaxWidth: 1040,
  readingMaxWidth: 720,
  headerMaxWidth: 1400,
  headerHeight: 72,
  mobileGutter: 20,
  tabletGutter: 32,
  desktopGutter: 48,
  touchTarget: 48,
} as const;
