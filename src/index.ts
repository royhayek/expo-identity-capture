export { DocumentCaptureAPI } from "./api/documentCapture";
export { SelfieCaptureAPI } from "./api/selfieCapture";
export { IdentityCaptureProvider } from "./components/IdentityCaptureProvider";
export { LocalizationManager, createLocalizedStrings } from "./localization";
export { arabicStrings } from "./localization/languages/arabic";
export { frenchStrings } from "./localization/languages/french";
export { FlowRules } from "./utils/flowRules";
export { ImageProcessor } from "./utils/imageProcessor";
export { PassportDetector } from "./utils/passportDetector";

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

export type { PassportDetectionResult } from "./utils/passportDetector";

import { DocumentCaptureAPI } from "./api/documentCapture";
import { SelfieCaptureAPI } from "./api/selfieCapture";
import {
  DocumentType,
  DocumentCaptureOptions,
  SelfieCaptureOptions,
  DocumentCaptureResult,
  SelfieCaptureResult,
} from "./types";

// Properly typed function exports
export const captureDocument = (
  type: DocumentType,
  options?: Partial<DocumentCaptureOptions>
): Promise<DocumentCaptureResult> => {
  return DocumentCaptureAPI.captureDocument(type, options);
};

export const captureSelfie = (options?: Partial<SelfieCaptureOptions>): Promise<SelfieCaptureResult> => {
  return SelfieCaptureAPI.captureSelfie(options);
};

// Main API object with proper typing
export const IdentityCapture = {
  captureDocument: (type: DocumentType, options?: Partial<DocumentCaptureOptions>): Promise<DocumentCaptureResult> => {
    return DocumentCaptureAPI.captureDocument(type, options);
  },
  captureSelfie: (options?: Partial<SelfieCaptureOptions>): Promise<SelfieCaptureResult> => {
    return SelfieCaptureAPI.captureSelfie(options);
  },
  isCapturing: (): boolean => DocumentCaptureAPI.isCapturing() || SelfieCaptureAPI.isCapturing(),
  cancelCurrentCapture: (): void => {
    DocumentCaptureAPI.cancelCurrentCapture();
    SelfieCaptureAPI.cancelCurrentCapture();
  },
};
