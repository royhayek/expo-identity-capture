// New unified API (recommended for new integrations)
export {
  captureAndExtract,
  captureMultipleDocuments,
  detectDocumentType,
  validateExtractedData
} from "./api/documentCapture";

export { SelfieCaptureAPI } from "./api/selfieCapture";

// Cloud Vision OCR (Arabic + multi-language support)
export {
  initCloudVision,
  recognizeText,
  recognizeTextSimple,
  getCloudVisionConfig,
} from "./services/CloudVisionOCR";
export type {
  CloudVisionConfig,
  CloudVisionResponse,
  CloudVisionError,
  TextAnnotation,
} from "./services/CloudVisionOCR";

// MRZ Parser (Machine Readable Zone for passports/IDs)
export {
  detectAndParseMRZ,
  calculateCheckDigit,
  validateCheckDigit,
  getCountryName,
  formatSex,
} from "./services/MRZParser";
export type {
  MRZType,
  MRZSex,
  MRZCheckDigits,
  ParsedMRZ,
  MRZDetectionResult,
} from "./services/MRZParser";

// Data Normalization (nationality, gender, dates, places)
export {
  normalizeNationality,
  normalizeGender,
  normalizePlaceName,
  normalizeDate,
  normalizeName,
  normalizeDocumentNumber,
  normalizeExtractedData,
  getCountryCode,
} from "./services/DataNormalizer";
export type {
  NormalizedGender,
  NormalizedField,
  NormalizedExtractedData,
} from "./services/DataNormalizer";

// On-device document reading (platform text recognition + MRZ); needs expo-text-extractor
export { readIdentityDocument, readingFromText, normalizeMrzCountry } from "./services/DocumentReader";
export type { IdentityDocumentReading, DocumentReaderError, ReadIdentityDocumentOptions } from "./services/DocumentReader";

// OCR Field Extraction
export { extractFieldsFromOCR } from "./services/OCRFieldExtractor";
export type {
  RawExtractedFields,
  ExtractedFieldsWithNormalization,
} from "./services/OCRFieldExtractor";

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

// OpenCV-based document detection
export { detectDocumentWithOpenCV, frameToProcessingBuffer } from "./core/OpenCVFrameProcessor";
export type { DetectedDocumentCorners, DocumentDetectionResult, ProcessingBuffer } from "./core/OpenCVFrameProcessor";

// Document detection hooks
export { useDocumentDetection } from "./hooks/useDocumentDetection";
export type { DetectionUpdate, DocumentDetectionConfig, UseDocumentDetectionReturn } from "./hooks/useDocumentDetection";

// Custom capture exports for host app integration
export { CameraManager, default as GlobalCameraManager } from "./core/CameraManager";
export { SelfieManager, default as GlobalSelfieManager } from "./core/SelfieManager";
export { default as CustomCameraView } from "./components/CustomCameraView";

// Embeddable live cameras: the preview and its overlay only; the host app draws the screen around them
export { DocumentScanView, guideBox, cropForGuide } from "./components/DocumentScanView";
export type {
  DocumentScanViewProps,
  DocumentScanViewRef,
  DocumentScanStatus,
  DocumentScanResult,
  DocumentScanError,
  DocumentPhotoCheck,
} from "./components/DocumentScanView";
export { SelfieLivenessView, toFaceSample } from "./components/SelfieLivenessView";
export { createFacePoseDetector } from "./core/FacePoseDetector";
export type { FacePose, FacePoseDetector } from "./core/FacePoseDetector";
export { documentTextRecognizer } from "./core/DocumentTextRecognizer";
export type { DocumentTextRecognizer, RecognizedTextLine, TextRegion } from "./core/DocumentTextRecognizer";
export type {
  SelfieLivenessViewProps,
  SelfieLivenessViewRef,
  SelfieLivenessState,
  SelfieLivenessResult,
  SelfieLivenessError,
  SelfieLivenessColors,
} from "./components/SelfieLivenessView";
export {
  advanceChallenge,
  startChallenge,
  shuffledDirections,
  directionProgress,
  isFaceInCircle,
  faceHint,
  currentDirection,
  DEFAULT_CHALLENGE_CONFIG,
} from "./services/LivenessChallenge";
export type {
  LivenessDirection,
  LivenessHint,
  LivenessPhase,
  FaceSample,
  LivenessChallengeConfig,
  LivenessChallengeState,
} from "./services/LivenessChallenge";
export { ModernSelfieCapture } from "./components/SelfieCapture";
export { CustomDocumentCapture } from "./core/CustomDocumentCapture";
export type { CustomCaptureOptions, CustomCaptureResult } from "./core/CustomDocumentCapture";
export type { CaptureResult, CaptureError, LivenessResult } from "./core/CameraManager";
export type { SelfieCaptureResult as CustomSelfieCaptureResult } from "./core/SelfieManager";

// Liveness Detection for screen capture/digital copy detection
export { LivenessDetection, scoreLiveness } from "./services/LivenessDetection";
export type {
  LivenessDetectionResult,
  LivenessDetectionConfig,
  DetectionMethodResult
} from "./services/LivenessDetection";

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
  FieldPosition,
  LivenessConfig
} from "./types/config";

// Configuration hooks and providers
export { ConfigProvider, useConfig, useThemeConfig, useLocalizedStrings } from "./context/ConfigContext";
export { useThemedStyles, useFrameStyle, useProgressColors } from "./utils/theme";

// Responsive scaling utilities
export { responsiveScale, useResponsiveTheme, getResponsiveFontSize, getResponsiveSpacing, RESPONSIVE_VALUES } from "./utils/responsiveTheme";

// Enhanced localization system
export { ConfigurableLocalizationManager, DEFAULT_STRINGS } from "./localization/ConfigurableLocalization";

// Direct DocumentScanner access for backwards compatibility
export { default as DocumentScanner } from "react-native-document-scanner-plugin";

// Main unified API object
export const IdentityCapture = {
  // New API methods (recommended)
  captureAndExtract,
  captureMultipleDocuments,
  detectDocumentType,
  validateExtractedData,
  captureSelfie: SelfieCaptureAPI.captureSelfie
};
