/**
 * OCR Field Extractor Service
 *
 * Extracts structured fields from OCR text for various document types.
 * Handles Arabic, English, and French text patterns.
 *
 * @module OCRFieldExtractor
 */

import type { VerifiedDocType } from '../types/extraction';
import {
  normalizeNationality,
  normalizeGender,
  normalizePlaceName,
  normalizeDate,
  normalizeName,
  normalizeDocumentNumber,
  NormalizedField,
  NormalizedGender,
} from './DataNormalizer';

// ============================================================================
// Types
// ============================================================================

/** Raw extracted field (before normalization) */
export interface RawExtractedFields {
  documentNumber?: string;
  fullName?: string;
  fullNameArabic?: string;
  givenNames?: string;
  surname?: string;
  fatherName?: string;
  motherName?: string;
  dateOfBirth?: string;
  dateOfExpiry?: string;
  dateOfIssue?: string;
  placeOfBirth?: string;
  nationality?: string;
  gender?: string;
  profession?: string;
  issuingAuthority?: string;
}

/** Normalized extracted field with both raw and formatted values */
export interface ExtractedFieldsWithNormalization {
  raw: RawExtractedFields;
  normalized: {
    documentNumber?: NormalizedField;
    fullName?: NormalizedField;
    fullNameArabic?: NormalizedField;
    givenNames?: NormalizedField;
    surname?: NormalizedField;
    fatherName?: NormalizedField;
    motherName?: NormalizedField;
    dateOfBirth?: NormalizedField;
    dateOfExpiry?: NormalizedField;
    dateOfIssue?: NormalizedField;
    placeOfBirth?: NormalizedField;
    nationality?: NormalizedField;
    gender?: NormalizedField<NormalizedGender>;
    profession?: NormalizedField;
    issuingAuthority?: NormalizedField;
  };
}

// ============================================================================
// Extraction Patterns
// ============================================================================

/** Residence Permit specific patterns */
const RESIDENCE_PERMIT_PATTERNS = {
  // Name patterns - look for text after field labels
  nameArabic: [
    /الاسم\s*[:\-]?\s*([^\n]+)/i,
    /Name\/Prénom\s*[:\-]?\s*([A-Z][A-Za-z\s]+)/i,
    /الاسم\s*:\s*\n?\s*([A-Z][A-Za-z]+)/i,
  ],
  surname: [
    /الشهرة\s*[:\-]?\s*([^\n]+)/i,
    /Surname\/Nom\s*[:\-]?\s*([A-Z][A-Za-z\s\-]+)/i,
    /الشهرة\s*\n?\s*([A-Z][A-Za-z\s\-]+)/i,
    /([A-Z][A-Z\s\-]+)\s*[-–]\s*Surname/i,
  ],
  givenNames: [
    /Name\/Prénom\s*\n?\s*([A-Z][A-Za-z]+)/i,
    /([A-Z][A-Za-z]+)\s+الاسم/,
  ],
  fatherName: [
    /(?:والأب|والاب|اسم الاب|اسم الأب)\s*[:\-]?\s*([^\n]+)/i,
    /Father\/Pere\s*[:\-]?\s*([A-Za-z\s]+)/i,
  ],
  dateOfBirth: [
    /تاريخ الولادة\s*[:\-]?\s*([\d\/\-\.]+)/i,
    /Date of Birth\/Date de Naissance\s*[:\-]?\s*([\d\/\-\.]+)/i,
    /(?:تاريخ الولادة|Date of Birth)[:\s]*([\d]{1,2}[\/\-\.][\d]{1,2}[\/\-\.][\d]{2,4})/i,
  ],
  nationality: [
    /الجنسية\s*[:\-]?\s*([^\n]+)/i,
    /Nationality\/Nationalité\s*[:\-]?\s*([A-Za-z\s]+)/i,
    /الجنسية\s*:\s*\n?\s*([^\n\d]+)/i,
  ],
  profession: [
    /المهنة\s*[:\-]?\s*([^\n]+)/i,
    /Profession\s*[:\-]?\s*([^\n]+)/i,
  ],
  documentNumber: [
    /(\d{9,12})/,  // 9-12 digit number
  ],
  permitType: [
    /سنوية\s*[-–]\s*(\S+)/i,  // Annual - type
    /(عمل|دراسة|سياحة|إقامة)/i,  // Work, study, tourism, residence
  ],
};

/** Passport specific patterns */
const PASSPORT_PATTERNS = {
  passportNumber: [
    /([A-Z]{1,2}\d{6,9})/i,
  ],
  fullName: [
    /الاسم الكامل\s*[:\-]?\s*([^\n]+)/i,
  ],
  givenNames: [
    /الاسم\s*[:\-]?\s*([^\n]+)/i,
    /Given Names?\s*[:\-]?\s*([^\n]+)/i,
  ],
  surname: [
    /الشهرة\s*[:\-]?\s*([^\n]+)/i,
    /Surname\s*[:\-]?\s*([^\n]+)/i,
  ],
  dateOfBirth: [
    /تاريخ الولادة\s*[:\-]?\s*([\d\/\-\.]+)/i,
    /Date of Birth\s*[:\-]?\s*([\d\/\-\.]+)/i,
  ],
  placeOfBirth: [
    /محل الولادة\s*[:\-]?\s*([^\n]+)/i,
    /Place of Birth\s*[:\-]?\s*([^\n]+)/i,
  ],
  nationality: [
    /الجنسية\s*[:\-]?\s*([^\n]+)/i,
    /Nationality\s*[:\-]?\s*([^\n]+)/i,
  ],
  dateOfExpiry: [
    /تاريخ الانتهاء\s*[:\-]?\s*([\d\/\-\.]+)/i,
    /Date of Expiry\s*[:\-]?\s*([\d\/\-\.]+)/i,
  ],
  dateOfIssue: [
    /تاريخ الاصدار\s*[:\-]?\s*([\d\/\-\.]+)/i,
    /Date of Issue\s*[:\-]?\s*([\d\/\-\.]+)/i,
  ],
  sex: [
    /الجنس\s*[:\-]?\s*([^\n]+)/i,
    /Sex\s*[:\-]?\s*([MF])/i,
  ],
};

/** Civil ID specific patterns */
const CIVIL_ID_PATTERNS = {
  civilIdNumber: [
    /(\d{12})/,  // 12 digit civil ID
    /رقم مدني\s*[:\-]?\s*(\d+)/i,
  ],
  fullNameArabic: [
    /الاسم\s*[:\-]?\s*([^\n]+)/i,
  ],
  dateOfBirth: [
    /تاريخ الولادة\s*[:\-]?\s*([\d\/\-\.]+)/i,
  ],
  nationality: [
    /الجنسية\s*[:\-]?\s*([^\n]+)/i,
  ],
  sex: [
    /الجنس\s*[:\-]?\s*([^\n]+)/i,
  ],
};

// ============================================================================
// Extraction Functions
// ============================================================================

/**
 * Extract text following a pattern, looking at the full text
 */
function extractWithPatterns(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const value = match[1].trim();
      // Filter out noise
      if (value.length > 0 && value.length < 100 && !isNoise(value)) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * Check if extracted value is likely noise
 */
function isNoise(value: string): boolean {
  const noisePatterns = [
    /^[\d\s]+$/,  // Only numbers/spaces
    /window/i,
    /help/i,
    /\.tsx?$/i,  // File extensions
    /\.js$/i,
    /identity-verification/i,
    /CustomCamera/i,
    /build\.db/i,
  ];

  return noisePatterns.some(p => p.test(value));
}

/**
 * Extract name from residence permit format
 * Handles patterns like "DEBORAH" followed by "الاسم" or "Name/Prénom"
 */
function extractResidencePermitName(text: string): { givenNames?: string; surname?: string } {
  const result: { givenNames?: string; surname?: string } = {};

  // Look for name on line before or after label
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';

    // Check for given name pattern
    if (/Name\/Pr[eé]nom|الاسم/i.test(line)) {
      // Name might be on previous line or next line
      if (prevLine && /^[A-Z][A-Za-z\s]+$/.test(prevLine) && !isNoise(prevLine)) {
        result.givenNames = prevLine;
      } else if (nextLine && /^[A-Z][A-Za-z\s]+$/.test(nextLine) && !isNoise(nextLine)) {
        result.givenNames = nextLine;
      }
    }

    // Check for surname pattern
    if (/Surname\/Nom|الشهرة/i.test(line)) {
      // Check for "MC CONWAY- Surname/Nom" pattern
      const inlineMatch = line.match(/([A-Z][A-Z\s\-]+?)\s*[-–]\s*Surname/i);
      if (inlineMatch) {
        result.surname = inlineMatch[1].trim();
      } else if (prevLine && /^[A-Z][A-Za-z\s\-]+$/.test(prevLine) && !isNoise(prevLine)) {
        result.surname = prevLine;
      } else if (nextLine && /^[A-Z][A-Za-z\s\-]+$/.test(nextLine) && !isNoise(nextLine)) {
        result.surname = nextLine;
      }
    }
  }

  return result;
}

/**
 * Extract nationality from Arabic text
 * Handles patterns like "الجنسية :" followed by nationality on same or next line
 */
function extractNationalityArabic(text: string): string | undefined {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line contains nationality label
    if (/الجنسية|Nationality/i.test(line)) {
      // Check if nationality is on same line after colon
      const sameLine = line.match(/(?:الجنسية|Nationality)[:\s]*([^\d\n]+)/i);
      if (sameLine && sameLine[1].trim().length > 2) {
        const nationality = sameLine[1].trim();
        if (!isNoise(nationality)) {
          return nationality;
        }
      }

      // Check next line for nationality
      const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
      if (nextLine && !isNoise(nextLine) && nextLine.length > 2 && nextLine.length < 50) {
        // Next line should be the nationality
        return nextLine;
      }
    }
  }

  return undefined;
}

/**
 * Extract fields from Residence Permit OCR text
 */
function extractResidencePermitFields(text: string): RawExtractedFields {
  const fields: RawExtractedFields = {};

  // Extract names with special handling
  const names = extractResidencePermitName(text);
  if (names.givenNames) fields.givenNames = names.givenNames;
  if (names.surname) fields.surname = names.surname;

  // Combine into full name
  if (names.givenNames || names.surname) {
    fields.fullName = [names.givenNames, names.surname].filter(Boolean).join(' ');
  }

  // Extract other fields
  fields.dateOfBirth = extractWithPatterns(text, RESIDENCE_PERMIT_PATTERNS.dateOfBirth);
  fields.nationality = extractNationalityArabic(text) ||
    extractWithPatterns(text, RESIDENCE_PERMIT_PATTERNS.nationality);
  fields.fatherName = extractWithPatterns(text, RESIDENCE_PERMIT_PATTERNS.fatherName);
  fields.profession = extractWithPatterns(text, RESIDENCE_PERMIT_PATTERNS.profession);
  fields.documentNumber = extractWithPatterns(text, RESIDENCE_PERMIT_PATTERNS.documentNumber);

  return fields;
}

/**
 * Extract fields from Passport OCR text
 */
function extractPassportFields(text: string): RawExtractedFields {
  const fields: RawExtractedFields = {};

  fields.documentNumber = extractWithPatterns(text, PASSPORT_PATTERNS.passportNumber);
  fields.givenNames = extractWithPatterns(text, PASSPORT_PATTERNS.givenNames);
  fields.surname = extractWithPatterns(text, PASSPORT_PATTERNS.surname);
  fields.dateOfBirth = extractWithPatterns(text, PASSPORT_PATTERNS.dateOfBirth);
  fields.placeOfBirth = extractWithPatterns(text, PASSPORT_PATTERNS.placeOfBirth);
  fields.nationality = extractWithPatterns(text, PASSPORT_PATTERNS.nationality);
  fields.dateOfExpiry = extractWithPatterns(text, PASSPORT_PATTERNS.dateOfExpiry);
  fields.dateOfIssue = extractWithPatterns(text, PASSPORT_PATTERNS.dateOfIssue);
  fields.gender = extractWithPatterns(text, PASSPORT_PATTERNS.sex);

  // Combine names
  if (fields.givenNames || fields.surname) {
    fields.fullName = [fields.givenNames, fields.surname].filter(Boolean).join(' ');
  }

  return fields;
}

/**
 * Extract fields from Civil ID OCR text
 */
function extractCivilIdFields(text: string): RawExtractedFields {
  const fields: RawExtractedFields = {};

  fields.documentNumber = extractWithPatterns(text, CIVIL_ID_PATTERNS.civilIdNumber);
  fields.fullNameArabic = extractWithPatterns(text, CIVIL_ID_PATTERNS.fullNameArabic);
  fields.dateOfBirth = extractWithPatterns(text, CIVIL_ID_PATTERNS.dateOfBirth);
  fields.nationality = extractNationalityArabic(text) ||
    extractWithPatterns(text, CIVIL_ID_PATTERNS.nationality);
  fields.gender = extractWithPatterns(text, CIVIL_ID_PATTERNS.sex);

  return fields;
}

/**
 * Extract fields based on document type
 */
export function extractFieldsFromOCR(
  text: string,
  docType: VerifiedDocType
): ExtractedFieldsWithNormalization {
  let raw: RawExtractedFields;

  // Extract raw fields based on document type
  switch (docType) {
    case 'residence_permit':
      raw = extractResidencePermitFields(text);
      break;
    case 'passport':
      raw = extractPassportFields(text);
      break;
    case 'civil_id':
      raw = extractCivilIdFields(text);
      break;
    default:
      // Generic extraction
      raw = {
        ...extractPassportFields(text),
        ...extractResidencePermitFields(text),
      };
  }

  // Normalize all fields
  const normalized: ExtractedFieldsWithNormalization['normalized'] = {};

  if (raw.documentNumber) {
    normalized.documentNumber = normalizeDocumentNumber(raw.documentNumber);
  }
  if (raw.fullName) {
    normalized.fullName = normalizeName(raw.fullName);
  }
  if (raw.fullNameArabic) {
    normalized.fullNameArabic = normalizeName(raw.fullNameArabic);
  }
  if (raw.givenNames) {
    normalized.givenNames = normalizeName(raw.givenNames);
  }
  if (raw.surname) {
    normalized.surname = normalizeName(raw.surname);
  }
  if (raw.fatherName) {
    normalized.fatherName = normalizeName(raw.fatherName);
  }
  if (raw.motherName) {
    normalized.motherName = normalizeName(raw.motherName);
  }
  if (raw.dateOfBirth) {
    normalized.dateOfBirth = normalizeDate(raw.dateOfBirth);
  }
  if (raw.dateOfExpiry) {
    normalized.dateOfExpiry = normalizeDate(raw.dateOfExpiry);
  }
  if (raw.dateOfIssue) {
    normalized.dateOfIssue = normalizeDate(raw.dateOfIssue);
  }
  if (raw.placeOfBirth) {
    normalized.placeOfBirth = normalizePlaceName(raw.placeOfBirth);
  }
  if (raw.nationality) {
    normalized.nationality = normalizeNationality(raw.nationality);
  }
  if (raw.gender) {
    normalized.gender = normalizeGender(raw.gender);
  }
  if (raw.profession) {
    normalized.profession = normalizeName(raw.profession);
  }
  if (raw.issuingAuthority) {
    normalized.issuingAuthority = normalizeName(raw.issuingAuthority);
  }

  return { raw, normalized };
}

// ============================================================================
// Export
// ============================================================================

export default {
  extractFieldsFromOCR,
};
