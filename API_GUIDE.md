# Expo Identity Capture - New API Guide

The new unified API provides professional-grade document extraction with quality control, template-based field extraction, and comprehensive validation.

## Quick Start

```typescript
import { captureAndExtract } from "expo-identity-capture";

// Simple document capture and extraction
const result = await captureAndExtract({
  docHint: "civil_id",
  enableQualityCheck: true,
  confidenceThreshold: 0.8,
});

console.log("Document type:", result.docType);
console.log("Name (Arabic):", result.fields.fullNameArabic?.value);
console.log("ID Number:", result.fields.documentNumber?.value);
console.log("Date of Birth:", result.fields.dateOfBirth?.value);
console.log("Quality Score:", result.quality.blurScore);
```

## Architecture Overview

### 1. Capture & Cleanup (Offline)

- **Document Scanner**: Uses `react-native-document-scanner-plugin` for auto-crop and perspective correction
- **Quality Control**: Blur detection, glare warnings, edge detection
- **Image Processing**: Auto-enhancement and format optimization

### 2. Document Type Routing

- **MRZ Detection**: Automatic detection of MRZ presence for passports/residence permits
- **Template Matching**: Lebanese document classification (Civil ID, Army Card, etc.)
- **Smart Routing**: Different extraction pipelines based on document type

### 3. Extraction Pipelines

#### MRZ Pipeline (Passports, Residence Permits)

- OCR on MRZ zone only for higher accuracy
- Custom ICAO 9303 compliant parser
- Checksum validation for data integrity

#### OCR Pipeline (Civil ID, Army Card)

- Google ML Kit Text Recognition v2 (Arabic + English)
- Template-based ROI extraction
- Field-specific validation and normalization

## API Reference

### Main Functions

#### `captureAndExtract(options?)`

Primary function for document capture and extraction.

```typescript
interface CaptureOptions {
  docHint?: "passport" | "civil_id" | "army_card" | "residence_permit";
  enableQualityCheck?: boolean;
  confidenceThreshold?: number;
  saveProcessedImages?: boolean;
}
```

#### `captureMultipleDocuments(docType, options?)`

Capture front/back for documents that require both sides.

```typescript
const results = await captureMultipleDocuments("civil_id", {
  enableQualityCheck: true,
});
// Returns array of ExtractedIdResult for front and back
```

#### `detectDocumentType(imageUri)`

Quick document type detection without full extraction.

```typescript
const docType = await detectDocumentType("file://document.jpg");
console.log("Detected:", docType); // 'passport' | 'civil_id' | etc.
```

#### `validateExtractedData(result)`

Validate extraction results and get confidence scores.

```typescript
const validation = validateExtractedData(result);
console.log("Valid:", validation.isValid);
console.log("Issues:", validation.issues);
console.log("Confidence:", validation.confidence);
```

## Result Schema

```typescript
interface ExtractedIdResult {
  docType: "passport" | "civil_id" | "army_card" | "residence_permit";
  originalImageUri: string;
  processedImageUri: string;
  crops?: Record<string, string>; // Field name -> cropped image URI

  fields: {
    documentNumber?: OcrField;
    fullNameArabic?: OcrField;
    fullNameLatin?: OcrField;
    givenNames?: OcrField;
    surname?: OcrField;
    dateOfBirth?: OcrField; // ISO format: YYYY-MM-DD
    sex?: OcrField;
    nationality?: OcrField;
    placeOfBirth?: OcrField;
    dateOfIssue?: OcrField; // ISO format: YYYY-MM-DD
    dateOfExpiry?: OcrField; // ISO format: YYYY-MM-DD
    motherName?: OcrField;
    fatherName?: OcrField;
  };

  mrz?: {
    raw: string;
    type: "TD1" | "TD2" | "TD3";
    checks: {
      documentNumber: boolean;
      dob: boolean;
      expiry: boolean;
      composite: boolean;
    };
  };

  quality: {
    blurScore: number; // 0-1, higher is better
    brightness: number; // 0-1, optimal around 0.7
    glareDetected: boolean;
  };
}

interface OcrField {
  value: string | null;
  confidence: number; // 0-1
  source: "mrz" | "ocr" | "derived";
}
```

## Document Types Supported

### Lebanese Documents

- **Civil ID (Front/Back)**: ID number, names (Arabic/English), DOB, nationality, parents
- **Army Card**: Military number, names, rank, unit, dates
- **Residence Permit**: Permit number, names, nationality, permit type, dates

### International Documents

- **Passport**: Full MRZ parsing with checksum validation
- **Residence Permit with MRZ**: MRZ-based extraction

## Dependencies Required

```json
{
  "react-native-vision-camera": ">=4.0.0",
  "react-native-document-scanner-plugin": ">=1.0.0",
  "@react-native-ml-kit/text-recognition": ">=1.0.0"
}
```

## Error Handling

```typescript
try {
  const result = await captureAndExtract({ docHint: "passport" });

  // Check validation
  const validation = validateExtractedData(result);
  if (!validation.isValid) {
    console.warn("Validation issues:", validation.issues);
  }

  // Use extracted data
  const name = result.fields.fullNameArabic?.value;
  const confidence = result.fields.fullNameArabic?.confidence;
} catch (error) {
  if (error.message.includes("Document scanner not available")) {
    // Handle missing dependency
  } else if (error.message.includes("Image quality too low")) {
    // Handle quality issues
  } else {
    // Handle other errors
  }
}
```

## Migration from Legacy API

### Old API

```typescript
import { extractDocument } from "expo-identity-capture";

const result = await extractDocument("file://image.jpg", "civil_id");
// Result had inconsistent structure and empty fields
```

### New API

```typescript
import { captureAndExtract } from "expo-identity-capture";

const result = await captureAndExtract({
  docHint: "civil_id",
  enableQualityCheck: true,
});
// Result has consistent structure, real data, and quality metrics
```

## Quality Control

The new API includes comprehensive quality control:

- **Blur Detection**: Prevents capture of blurry images
- **Glare Detection**: Warns about reflections that affect OCR
- **Edge Detection**: Ensures document is properly framed
- **Confidence Thresholds**: Configurable minimum confidence levels
- **Field Validation**: Format and content validation per field type

This professional-grade system ensures reliable extraction suitable for production applications.
