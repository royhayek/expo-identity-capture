// New unified API (recommended for new integrations)
export {
  captureAndExtract,
  captureMultipleDocuments,
  detectDocumentType,
  validateExtractedData
} from "./api/documentCapture";

export { SelfieCaptureAPI } from "./api/selfieCapture";

// Import for the unified API object
import { 
  captureAndExtract,
  captureMultipleDocuments,
  detectDocumentType,
  validateExtractedData
} from "./api/documentCapture";

import { SelfieCaptureAPI } from "./api/selfieCapture";

// Component and utility exports
export { IdentityCaptureProvider } from "./components/IdentityCaptureProvider";
export { LocalizationManager, createLocalizedStrings } from "./localization";
export { arabicStrings } from "./localization/languages/arabic";
export { frenchStrings } from "./localization/languages/french";
export { FlowRules } from "./utils/flowRules";
export { ImageProcessor } from "./utils/imageProcessor";
export { TemplateLoader } from "./utils/templateLoader";
export { DocumentValidation } from "./utils/documentValidation";

// Custom capture exports for host app integration
export { CameraManager, default as GlobalCameraManager } from "./core/CameraManager";
export { SelfieManager, default as GlobalSelfieManager } from "./core/SelfieManager";
export { default as CustomCameraView } from "./components/CustomCameraView";
export { ModernSelfieCapture } from "./components/SelfieCapture";
export { CustomDocumentCapture } from "./core/CustomDocumentCapture";
export type { CustomCaptureOptions, CustomCaptureResult } from "./core/CustomDocumentCapture";
export type { CaptureResult } from "./core/CameraManager";
export type { SelfieCaptureResult as CustomSelfieCaptureResult } from "./core/SelfieManager";

export type {
  DocumentType,
  DocumentSide,
  OutputFormat,
  DocumentCaptureResult,
  SelfieCaptureResult,
  CaptureConfig,
  LocalizedStrings,
  CaptureCallbacks,
  DocumentCaptureOptions,
  SelfieCaptureOptions,
  FlowState,
  CaptureStep,
  CameraFrameGuide,
} from "./types";

// New extraction types
export type {
  VerifiedDocType,
  OcrField,
  ExtractedIdResult,
  DocumentTemplate,
  CaptureOptions,
  QualityMetrics
} from "./types/extraction";

// Configuration types
export type {
  IdentityCaptureConfig,
  ThemeColors,
  TypographyConfig,
  LayoutConfig,
  AnimationConfig,
  LocalizationConfig,
  DetectionConfig,
  CameraConfig,
  ImageProcessingConfig,
  ValidationConfig,
  FrameDimensions,
  FieldPosition
} from "./types/config";

// Configuration hooks and providers
export { ConfigProvider, useConfig, useThemeConfig, useLocalizedStrings } from "./context/ConfigContext";
export { useThemedStyles, useFrameStyle, useProgressColors } from "./utils/theme";

// Responsive scaling utilities
export { responsiveScale, useResponsiveTheme, getResponsiveFontSize, getResponsiveSpacing, RESPONSIVE_VALUES } from "./utils/responsiveTheme";

// Enhanced localization system
export { ConfigurableLocalizationManager, DEFAULT_STRINGS } from "./localization/ConfigurableLocalization";

// Direct DocumentScanner access for backwards compatibility
let DocumentScanner: any = null;
try {
  DocumentScanner = require("react-native-document-scanner-plugin");
} catch (error) {
  console.warn("react-native-document-scanner-plugin not available");
}

// Export DocumentScanner for direct access
export { DocumentScanner };

// Main unified API object
export const IdentityCapture = {
  // New API methods (recommended)
  captureAndExtract,
  captureMultipleDocuments,
  detectDocumentType,
  validateExtractedData,
  captureSelfie: SelfieCaptureAPI.captureSelfie
};
