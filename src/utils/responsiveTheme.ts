import { scale, verticalScale, moderateScale } from 'react-native-size-matters';
import { useThemeConfig } from '../context/ConfigContext';

// Responsive scaling functions
export const responsiveScale = {
  // For width-based scaling (buttons, icons)
  width: (size: number) => scale(size),
  
  // For height-based scaling (margins, paddings)
  height: (size: number) => verticalScale(size),
  
  // For font sizes (moderate scaling to avoid too large text on tablets)
  font: (size: number, factor?: number) => moderateScale(size, factor),
  
  // For mixed dimensions (squares, circles)
  moderate: (size: number, factor?: number) => moderateScale(size, factor),
};

// Hook to get responsive themed values
export const useResponsiveTheme = () => {
  const theme = useThemeConfig();
  
  return {
    // Responsive typography
    typography: {
      sizes: {
        xs: responsiveScale.font(theme.typography?.sizes?.xs || 12),
        sm: responsiveScale.font(theme.typography?.sizes?.sm || 14),
        base: responsiveScale.font(theme.typography?.sizes?.base || 16),
        lg: responsiveScale.font(theme.typography?.sizes?.lg || 18),
        xl: responsiveScale.font(theme.typography?.sizes?.xl || 24),
        xxl: responsiveScale.font(theme.typography?.sizes?.xxl || 28),
      },
      lineHeights: {
        tight: (theme.typography?.lineHeights?.tight || 1.2),
        normal: (theme.typography?.lineHeights?.normal || 1.4),
        relaxed: (theme.typography?.lineHeights?.relaxed || 1.6),
      },
      fonts: theme.typography?.fonts || {
        regular: 'System',
        medium: 'System',
        semibold: 'System',
        bold: 'System',
      },
      weights: theme.typography?.weights || {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
    },
    
    // Responsive spacing
    spacing: {
      xs: responsiveScale.height(theme.layout?.spacing?.xs || 4),
      sm: responsiveScale.height(theme.layout?.spacing?.sm || 8),
      md: responsiveScale.height(theme.layout?.spacing?.md || 16),
      lg: responsiveScale.height(theme.layout?.spacing?.lg || 24),
      xl: responsiveScale.height(theme.layout?.spacing?.xl || 32),
    },
    
    // Responsive layout
    layout: {
      borderRadius: responsiveScale.moderate(theme.layout?.borderRadius || 16, 0.2),
      buttons: {
        capture: {
          width: responsiveScale.moderate(theme.layout?.buttons?.capture?.width || 70, 0.2),
          height: responsiveScale.moderate(theme.layout?.buttons?.capture?.height || 70, 0.2),
        },
        header: {
          width: responsiveScale.moderate(theme.layout?.buttons?.header?.width || 60, 0.2),
          height: responsiveScale.moderate(theme.layout?.buttons?.header?.height || 60, 0.2),
        },
      },
      frame: theme.layout?.frame || {},
      overlay: theme.layout?.overlay || { opacity: 0.6 },
    },
    
    // Colors (no scaling needed)
    colors: theme.colors || {},
    
    // Animation (no scaling needed)
    animation: theme.animation || {},
  };
};

// Helper functions for responsive dimensions
export const getResponsiveFontSize = (size: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | 'xxl', customSize?: number) => {
  if (customSize) {
    return responsiveScale.font(customSize);
  }
  
  const sizes = {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 24,
    xxl: 28,
  };
  
  return responsiveScale.font(sizes[size]);
};

export const getResponsiveSpacing = (size: 'xs' | 'sm' | 'md' | 'lg' | 'xl', customSize?: number) => {
  if (customSize) {
    return responsiveScale.height(customSize);
  }
  
  const sizes = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  };
  
  return responsiveScale.height(sizes[size]);
};

export const getResponsiveWidth = (size: number) => responsiveScale.width(size);
export const getResponsiveHeight = (size: number) => responsiveScale.height(size);
export const getResponsiveModerate = (size: number, factor?: number) => responsiveScale.moderate(size, factor);

// Predefined responsive values for common use cases
export const RESPONSIVE_VALUES = {
  // Button dimensions
  captureButton: {
    width: responsiveScale.moderate(65, 0.2),
    height: responsiveScale.moderate(65, 0.2),
  },
  headerButton: {
    width: responsiveScale.moderate(60, 0.2),
    height: responsiveScale.moderate(60, 0.2),
  },
  
  // Border radius
  borderRadius: {
    small: responsiveScale.moderate(8, 0.2),
    medium: responsiveScale.moderate(16, 0.2),
    large: responsiveScale.moderate(24, 0.2),
  },
  
  // Margins and paddings
  margin: {
    xs: responsiveScale.height(4),
    sm: responsiveScale.height(8),
    md: responsiveScale.height(16),
    lg: responsiveScale.height(24),
    xl: responsiveScale.height(32),
  },
  
  padding: {
    xs: responsiveScale.height(4),
    sm: responsiveScale.height(8),
    md: responsiveScale.height(16),
    lg: responsiveScale.height(24),
    xl: responsiveScale.height(32),
  },
  
  // Font sizes
  fontSize: {
    xs: responsiveScale.font(12),
    sm: responsiveScale.font(14),
    base: responsiveScale.font(16),
    lg: responsiveScale.font(18),
    xl: responsiveScale.font(24),
    xxl: responsiveScale.font(28),
  },
  
  // Icon sizes
  iconSize: {
    small: responsiveScale.moderate(16, 0.2),
    medium: responsiveScale.moderate(24, 0.2),
    large: responsiveScale.moderate(32, 0.2),
  },
};

export default RESPONSIVE_VALUES;