import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

export const useBreakpoints = () => {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const isMobile = width < 640;
    const isTablet = width >= 640 && width < 1024;
    const isDesktop = width >= 1024;
    const responsiveSpacing = isDesktop ? 48 : isTablet ? 32 : 20;
    const maxContentWidth = 1280;

    return {
      width,
      height,
      isMobile,
      isTablet,
      isDesktop,
      responsiveSpacing,
      maxContentWidth,
    };
  }, [width, height]);
};

