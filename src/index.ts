// New unified API (recommended for new integrations)
export {
  captureAndExtract,
  captureMultipleDocuments,
  detectDocumentType,
  validateExtractedData
} from "./api/documentCapture";

// Import for the unified API object
import { 
  captureAndExtract,
  captureMultipleDocuments,
  detectDocumentType,
  validateExtractedData
} from "./api/documentCapture";

// Component and utility exports
export { IdentityCaptureProvider } from "./components/IdentityCaptureProvider";
export { LocalizationManager, createLocalizedStrings } from "./localization";
export { arabicStrings } from "./localization/languages/arabic";
export { frenchStrings } from "./localization/languages/french";
export { FlowRules } from "./utils/flowRules";
export { ImageProcessor } from "./utils/imageProcessor";

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
  validateExtractedData
};
