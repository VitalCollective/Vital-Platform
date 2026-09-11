import { useWindowDimensions } from 'react-native';

import { breakpoints, layout } from '@/theme/tokens';

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const isDesktop = width >= breakpoints.desktop;
  const isTablet = width >= breakpoints.tablet;

  return {
    width,
    height,
    isDesktop,
    isTablet,
    horizontalPadding: isDesktop
      ? layout.desktopGutter
      : isTablet
        ? layout.tabletGutter
        : layout.mobileGutter,
  };
}
