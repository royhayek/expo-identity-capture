import * as React from 'react';

export type DocumentType = 'passport' | 'civil_id' | 'army_card' | 'residence_permit';
export type OutputFormat = 'uri' | 'base64';

export interface DocumentCaptureResult {
  type: DocumentType;
  images: string[];
  capturedAt: string;
}

export interface SelfieCaptureResult {
  image: string;
  capturedAt: string;
}

export interface LocalizedStrings {
  [key: string]: string;
}

export interface CaptureConfig {
  output?: OutputFormat;
  quality?: number;
  maxWidth?: number;
  maxHeight?: number;
  strings?: LocalizedStrings;
}

export interface CaptureCallbacks {
  onSuccess?: (result: any) => void;
  onCancel?: () => void;
  onError?: (error: Error) => void;
}

export interface DocumentCaptureOptions extends CaptureConfig, CaptureCallbacks {
  type: DocumentType;
}

export interface SelfieCaptureOptions extends CaptureConfig, CaptureCallbacks {}

export declare const IdentityCaptureProvider: React.FC<{ children: React.ReactNode }>;
export declare const captureDocument: (type: DocumentType, options?: Partial<DocumentCaptureOptions>) => Promise<DocumentCaptureResult>;
export declare const captureSelfie: (options?: Partial<SelfieCaptureOptions>) => Promise<SelfieCaptureResult>;
export declare const arabicStrings: LocalizedStrings;
export declare const frenchStrings: LocalizedStrings;
export declare const DocumentCaptureAPI: any;
export declare const SelfieCaptureAPI: any;
export declare const LocalizationManager: any;
export declare const createLocalizedStrings: any;
export declare const FlowRules: any;
export declare const ImageProcessor: any;