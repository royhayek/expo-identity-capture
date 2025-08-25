export type VerifiedDocType = 'passport' | 'residence_permit' | 'civil_id' | 'army_card';

export interface OcrField {
  value: string | null;
  confidence: number;   // 0..1
  source: 'mrz' | 'ocr' | 'derived';
}

export interface ExtractedIdResult {
  docType: VerifiedDocType;
  // Original & cleaned images
  originalImageUri: string;
  processedImageUri: string;
  // Crops per field (optional but useful for audit/manual review)
  crops?: Record<string, string>; // fieldName -> imageUri
  // Parsed fields
  fields: {
    documentNumber?: OcrField;
    fullNameArabic?: OcrField;
    fullNameLatin?: OcrField;
    givenNames?: OcrField;
    surname?: OcrField;
    dateOfBirth?: OcrField;   // ISO
    sex?: OcrField;
    nationality?: OcrField;
    placeOfBirth?: OcrField;
    dateOfIssue?: OcrField;   // ISO
    dateOfExpiry?: OcrField;  // ISO
    motherName?: OcrField;
    fatherName?: OcrField;
  };
  // MRZ raw if available
  mrz?: {
    raw: string;
    type: 'TD1' | 'TD2' | 'TD3';
    checks: { 
      documentNumber: boolean; 
      dob: boolean; 
      expiry: boolean; 
      composite: boolean; 
    };
  };
  quality: {
    blurScore: number;
    brightness: number;
    glareDetected: boolean;
  };
}

export interface DocumentTemplate {
  docType: string;
  size: { w: number; h: number };
  fields: Record<string, {
    x: number; // normalized 0-1
    y: number; // normalized 0-1
    w: number; // normalized 0-1
    h: number; // normalized 0-1
  }>;
}

export interface CaptureOptions {
  docHint?: VerifiedDocType;
  enableQualityCheck?: boolean;
  confidenceThreshold?: number;
  saveProcessedImages?: boolean;
  useCustomCapture?: boolean; // Enable custom OpenCV-based document capture
}

export interface QualityMetrics {
  blurScore: number;
  brightness: number;
  glareDetected: boolean;
  edgesDetected: boolean;
  isAcceptable: boolean;
}