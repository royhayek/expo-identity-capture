import { DocumentExtractor } from "../core/DocumentExtractor";
import { ExtractedIdResult, CaptureOptions, VerifiedDocType } from "../types/extraction";
import MLKit from "@react-native-ml-kit/text-recognition";

/**
 * Main API function: Capture and extract document data
 * This is the primary interface for the package
 *
 * @param options Capture configuration options
 * @returns Promise with extracted document data
 *
 * @example
 * ```typescript
 * import { captureAndExtract } from 'expo-identity-capture';
 *
 * const result = await captureAndExtract({
 *   docHint: 'civil_id',
 *   enableQualityCheck: true,
 *   confidenceThreshold: 0.8
 * });
 *
 * console.log('Document type:', result.docType);
 * console.log('Name:', result.fields.fullNameArabic?.value);
 * console.log('ID Number:', result.fields.documentNumber?.value);
 * ```
 */
export async function captureAndExtract(options: CaptureOptions = {}): Promise<ExtractedIdResult> {
  console.log("🔍 Starting document capture and extraction");

  try {
    const result = await DocumentExtractor.captureAndExtract(options);

    console.log("✅ Document extraction completed");
    console.log(`📄 Document type: ${result.docType}`);
    console.log(
      `⭐ Quality score: blur=${result.quality.blurScore.toFixed(2)}, brightness=${result.quality.brightness.toFixed(
        2
      )}`
    );

    // Log extracted fields summary
    const extractedFields = Object.keys(result.fields).filter((key) => result.fields[key]?.value);
    console.log(`📝 Extracted ${extractedFields.length} fields: ${extractedFields.join(", ")}`);

    return result;
  } catch (error) {
    console.error("❌ Document extraction failed:", error);
    throw error;
  }
}

/**
 * Capture and extract multiple documents (for front/back ID cards)
 *
 * @param docType Document type to extract
 * @param options Capture options
 * @returns Array of extraction results
 */
export async function captureMultipleDocuments(
  docType: VerifiedDocType,
  options: CaptureOptions = {}
): Promise<ExtractedIdResult[]> {
  console.log(`🔍 Starting multiple document capture for: ${docType}`);

  const results: ExtractedIdResult[] = [];

  try {
    // Determine number of sides based on document type
    const sides = getRequiredSides(docType);

    for (let i = 0; i < sides.length; i++) {
      const side = sides[i];
      console.log(`📸 Capturing ${side} side...`);

      const result = await captureAndExtract({
        ...options,
        docHint: docType,
      });

      results.push(result);
    }

    console.log(`✅ Captured ${results.length} documents`);
    return results;
  } catch (error) {
    console.error("❌ Multiple document capture failed:", error);
    throw error;
  }
}

/**
 * Get the required sides for a document type
 */
function getRequiredSides(docType: VerifiedDocType): string[] {
  switch (docType) {
    case "civil_id":
      return ["front", "back"];
    case "army_card":
      return ["front", "back"];
    case "passport":
    case "residence_permit":
      return ["main"]; // Single page with MRZ
    default:
      return ["front"];
  }
}

/**
 * Quick document type detection without full extraction
 * Useful for routing users to appropriate capture flows
 *
 * @param imageUri URI of document image
 * @returns Detected document type
 */
export async function detectDocumentType(imageUri: string): Promise<VerifiedDocType> {
  try {
    const result = await MLKit.recognize(imageUri);
    const text = result.text || "";

    // Simple heuristics for document type detection
    if (text.includes("P<") || /^[A-Z]{2}\d{7}/.test(text)) {
      return "passport";
    } else if (text.includes("الجيش") || text.includes("Army")) {
      return "army_card";
    } else if (text.includes("إقامة") || text.includes("Residence")) {
      return "residence_permit";
    } else {
      return "civil_id"; // Default
    }
  } catch (error) {
    console.warn("Document type detection failed:", error);
    return "civil_id"; // Default fallback
  }
}

/**
 * Validate extracted document data
 *
 * @param result Extraction result to validate
 * @returns Validation summary
 */
export function validateExtractedData(result: ExtractedIdResult): {
  isValid: boolean;
  issues: string[];
  confidence: number;
} {
  const issues: string[] = [];
  let totalConfidence = 0;
  let fieldCount = 0;

  // Check required fields based on document type
  const requiredFields = getRequiredFields(result.docType);

  for (const fieldName of requiredFields) {
    const field = result.fields[fieldName];

    if (!field || !field.value) {
      issues.push(`Missing required field: ${fieldName}`);
    } else {
      totalConfidence += field.confidence;
      fieldCount++;

      // Field-specific validation
      if (fieldName.includes("date") && !isValidDate(field.value)) {
        issues.push(`Invalid date format: ${fieldName}`);
      }

      if (field.confidence < 0.5) {
        issues.push(`Low confidence for field: ${fieldName} (${Math.round(field.confidence * 100)}%)`);
      }
    }
  }

  const averageConfidence = fieldCount > 0 ? totalConfidence / fieldCount : 0;

  return {
    isValid: issues.length === 0,
    issues,
    confidence: averageConfidence,
  };
}

function getRequiredFields(docType: VerifiedDocType): string[] {
  switch (docType) {
    case "passport":
      return ["documentNumber", "surname", "givenNames", "dateOfBirth", "nationality", "dateOfExpiry"];
    case "civil_id":
      return ["documentNumber", "fullNameArabic", "dateOfBirth", "nationality"];
    case "army_card":
      return ["documentNumber", "fullNameArabic", "rank"];
    case "residence_permit":
      return ["documentNumber", "fullNameArabic", "nationality", "dateOfExpiry"];
    default:
      return [];
  }
}

function isValidDate(dateString: string): boolean {
  // Check ISO date format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

// Re-export types for convenience
export * from "../types/extraction";
