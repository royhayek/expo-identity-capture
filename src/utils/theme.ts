import { useThemeConfig } from '../context/ConfigContext';
import { VerifiedDocType } from '../types/extraction';
import { useResponsiveTheme, getResponsiveFontSize, getResponsiveSpacing } from './responsiveTheme';

// Hook to get themed styles (now with responsive scaling)
export const useThemedStyles = () => {
  return useResponsiveTheme();
};

// Helper function to get frame style for document type
export const useFrameStyle = (docType: VerifiedDocType) => {
  const { layout } = useThemedStyles();
  
  // Get configured frame dimensions or use defaults
  const frameConfig = layout.frame?.[docType];
  
  return {
    top: frameConfig?.top || getDefaultFrameStyle(docType).top,
    left: frameConfig?.left || getDefaultFrameStyle(docType).left,
    right: frameConfig?.right || getDefaultFrameStyle(docType).right,
    height: frameConfig?.height || getDefaultFrameStyle(docType).height,
  };
};

// Default frame styles (current hardcoded values)
const getDefaultFrameStyle = (docType: VerifiedDocType) => {
  switch (docType) {
    case 'passport':
      return { top: '28%', left: '12%', right: '12%', height: '48%' };
    case 'civil_register':
      return { top: '35%', left: '10%', right: '10%', height: '30%' };
    default: // civil_id, army_card, residence_permit
      return { top: '35%', left: '8%', right: '8%', height: '25%' };
  }
};

// Helper function to get progress gradient colors
export const useProgressColors = () => {
  const { colors } = useThemedStyles();
  
  return {
    gradient: colors.progress?.gradient || ['#4CAF50', '#2196F3', '#9C27B0'],
    background: colors.progress?.background || 'rgba(255,255,255,0.3)',
  };
};

// Helper function to get button dimensions
export const useButtonDimensions = (type: 'capture' | 'header') => {
  const { layout } = useThemedStyles();
  
  const defaults = type === 'capture' 
    ? { width: 70, height: 70 }
    : { width: 60, height: 60 };
    
  return {
    width: layout.buttons?.[type]?.width || defaults.width,
    height: layout.buttons?.[type]?.height || defaults.height,
  };
};

// Helper function to get spacing value
export const useSpacing = (size: 'xs' | 'sm' | 'md' | 'lg' | 'xl') => {
  const { spacing } = useThemedStyles();
  
  return spacing[size];
};

// Helper to create dynamic styles based on theme
export const createThemedStyles = (theme: any) => ({
  // Common styled components
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.layout.borderRadius,
  },
  
  secondaryButton: {
    backgroundColor: theme.colors.secondary,
    borderRadius: theme.layout.borderRadius,
  },
  
  dangerButton: {
    backgroundColor: theme.colors.danger,
    borderRadius: theme.layout.borderRadius,
  },
  
  primaryText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.base,
    fontWeight: theme.typography.weights.normal,
    fontFamily: theme.typography.fonts.regular,
  },
  
  headerText: {
    color: theme.colors.text.primary,
    fontSize: theme.typography.sizes.xl,
    fontWeight: theme.typography.weights.bold,
    fontFamily: theme.typography.fonts.bold,
  },
  
  surface: {
    backgroundColor: theme.colors.surface,
  },
  
  overlay: {
    backgroundColor: theme.colors.overlay,
  },
  
  border: {
    borderColor: theme.colors.border.default,
    borderWidth: 2,
    borderRadius: theme.layout.borderRadius,
  },
  
  detectedBorder: {
    borderColor: theme.colors.border.detected,
    borderWidth: 3,
    borderRadius: theme.layout.borderRadius,
  },
});