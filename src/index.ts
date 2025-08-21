export { DocumentCaptureAPI } from "./api/documentCapture";
export { SelfieCaptureAPI } from "./api/selfieCapture";
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

import { DocumentCaptureAPI } from "./api/documentCapture";
import { SelfieCaptureAPI } from "./api/selfieCapture";

export const captureDocument = DocumentCaptureAPI.captureDocument.bind(DocumentCaptureAPI);
export const captureSelfie = SelfieCaptureAPI.captureSelfie.bind(SelfieCaptureAPI);

export const IdentityCapture = {
  captureDocument,
  captureSelfie,
  isCapturing: () => DocumentCaptureAPI.isCapturing() || SelfieCaptureAPI.isCapturing(),
  cancelCurrentCapture: () => {
    DocumentCaptureAPI.cancelCurrentCapture();
    SelfieCaptureAPI.cancelCurrentCapture();
  },
};
