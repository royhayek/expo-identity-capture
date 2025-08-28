export type DocumentType = 'passport' | 'civil_id' | 'army_card' | 'residence_permit';

export type DocumentSide = 'front' | 'back';

export type OutputFormat = 'uri' | 'base64';

export interface DocumentCaptureResult {
  type: DocumentType;
  images: string[];
  originalImageUri?: string;
  croppedImageUri?: string;
  sides?: DocumentSide[];
  capturedAt: string;
  metadata?: {
    extractedFields?: number;
    quality?: {
      blurScore: number;
      brightness: number;
      glareDetected: boolean;
    };
  };
}

export interface SelfieCaptureResult {
  image: string;
  croppedImage?: string;
  capturedAt: string;
}

export interface CaptureConfig {
  output?: OutputFormat;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  strings?: LocalizedStrings;
}

export interface LocalizedStrings {
  capture?: string;
  retake?: string;
  flashOn?: string;
  flashOff?: string;
  captureDocument?: string;
  captureSelfie?: string;
  capturePassport?: string;
  captureCivilIdFront?: string;
  captureCivilIdBack?: string;
  captureArmyCard?: string;
  captureResidencePermit?: string;
  documentRequired?: string;
  selfieRequired?: string;
  cancel?: string;
  done?: string;
  loading?: string;
  error?: string;
  cameraPermissionDenied?: string;
  cameraNotAvailable?: string;
}

export interface CaptureCallbacks {
  onSuccess?: (result: DocumentCaptureResult | SelfieCaptureResult) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

export interface DocumentCaptureOptions extends CaptureConfig, CaptureCallbacks {
  type: DocumentType;
}

export interface SelfieCaptureOptions extends CaptureConfig, CaptureCallbacks {}

export interface FlowState {
  isNonLebanesePassport: boolean;
  hasPassport: boolean;
  hasResidencePermit: boolean;
  hasCivilIdFront: boolean;
  hasCivilIdBack: boolean;
  hasArmyCard: boolean;
}

export interface CaptureStep {
  type: DocumentType;
  side?: DocumentSide;
  required: boolean;
  completed: boolean;
}

export interface CameraFrameGuide {
  width: number;
  height: number;
  borderRadius: number;
  aspectRatio: number;
}