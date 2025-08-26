import React, { createContext, useContext, ReactNode } from 'react';
import { IdentityCaptureConfig, DEFAULT_CONFIG } from '../types/config';
import { ConfigurableLocalizationManager } from '../localization/ConfigurableLocalization';
import { VerifiedDocType } from '../types/extraction';

// Deep merge utility function
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] !== undefined && source[key] !== null) {
      if (typeof source[key] === 'object' && !Array.isArray(source[key]) && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        result[key] = deepMerge(target[key], source[key] as any);
      } else {
        result[key] = source[key] as any;
      }
    }
  }
  
  return result;
}

interface ConfigContextType {
  config: Required<IdentityCaptureConfig>;
  updateConfig: (newConfig: Partial<IdentityCaptureConfig>) => void;
  localizationManager: ConfigurableLocalizationManager;
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

interface ConfigProviderProps {
  children: ReactNode;
  config?: IdentityCaptureConfig;
}

export const ConfigProvider: React.FC<ConfigProviderProps> = ({ children, config = {} }) => {
  // Merge provided config with defaults
  const mergedConfig = React.useMemo(() => {
    return deepMerge(DEFAULT_CONFIG, config);
  }, [config]);

  const [currentConfig, setCurrentConfig] = React.useState(mergedConfig);
  
  // Create localization manager
  const localizationManager = React.useMemo(() => {
    return new ConfigurableLocalizationManager(currentConfig.localization);
  }, [currentConfig.localization]);

  const updateConfig = React.useCallback((newConfig: Partial<IdentityCaptureConfig>) => {
    setCurrentConfig(prevConfig => deepMerge(prevConfig, newConfig) as Required<IdentityCaptureConfig>);
  }, []);

  const contextValue = React.useMemo(() => ({
    config: currentConfig,
    updateConfig,
    localizationManager,
  }), [currentConfig, updateConfig, localizationManager]);

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = (): ConfigContextType => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
};

// Convenience hooks for specific config sections
export const useThemeConfig = () => {
  const { config } = useConfig();
  return config.theme;
};

export const useLocalizationConfig = () => {
  const { config } = useConfig();
  return config.localization;
};

export const useBehaviorConfig = () => {
  const { config } = useConfig();
  return config.behavior;
};

export const useDocumentConfig = () => {
  const { config } = useConfig();
  return config.documents;
};

// Helper hook to get localized strings
export const useLocalizedStrings = () => {
  const { localizationManager } = useConfig();
  
  const getDocumentLabel = React.useCallback((docType: VerifiedDocType) => {
    return localizationManager.getDocumentLabel(docType);
  }, [localizationManager]);
  
  const getInstructionText = React.useCallback((docType: VerifiedDocType) => {
    return localizationManager.getInstructionText(docType);
  }, [localizationManager]);
  
  const getAlertMessage = React.useCallback((key: string) => {
    return localizationManager.getAlertMessage(key as any);
  }, [localizationManager]);
  
  const getUIText = React.useCallback((key: string) => {
    return localizationManager.getUIText(key);
  }, [localizationManager]);
  
  // Legacy method for backward compatibility
  const getLocalizedString = React.useCallback((
    key: string,
    section: 'documentLabels' | 'instructions' | 'alerts' | 'ui',
    fallback: string
  ) => {
    switch (section) {
      case 'documentLabels':
        return getDocumentLabel(key as VerifiedDocType);
      case 'instructions':
        return getInstructionText(key as VerifiedDocType);
      case 'alerts':
        return getAlertMessage(key);
      case 'ui':
        return getUIText(key);
      default:
        return fallback;
    }
  }, [getDocumentLabel, getInstructionText, getAlertMessage, getUIText]);

  return { 
    getLocalizedString, 
    getDocumentLabel,
    getInstructionText,
    getAlertMessage,
    getUIText,
    currentLanguage: localizationManager.getCurrentLanguage(),
  };
};