/**
 * Document Reader
 *
 * Reads an identity document photo on the device: ML Kit text recognition (Latin script, so the MRZ and
 * Latin fields), then the MRZ parser. Nothing leaves the phone.
 *
 * Requires the optional peer `react-native-vision-camera-mlkit` (with its text recognition enabled).
 *
 * @module DocumentReader
 */

import { detectAndParseMRZ, type ParsedMRZ } from './MRZParser';

// ============================================================================
// Types
// ============================================================================

/** What could be read off a document photo */
export interface IdentityDocumentReading {
  /** Whether a machine-readable zone was found and every check digit passed */
  isValid: boolean;
  /** The parsed MRZ, valid or not; null when none was found */
  mrz: ParsedMRZ | null;
  /** Issuing state, ISO 3166-1 alpha-3 (ICAO-only codes normalised); null unless the MRZ is valid */
  issuingCountry: string | null;
  /** Nationality, ISO 3166-1 alpha-3; null unless the MRZ is valid */
  nationality: string | null;
  /** Family name(s), as printed in the MRZ */
  surname: string | null;
  /** Given name(s), as printed in the MRZ */
  givenNames: string | null;
  /** YYYY-MM-DD */
  dateOfBirth: string | null;
  /** 'M', 'F' or null (unspecified) */
  sex: 'M' | 'F' | null;
  documentNumber: string | null;
  /** YYYY-MM-DD */
  dateOfExpiry: string | null;
  /** Everything ML Kit recognised, for apps that read more fields themselves */
  text: string;
}

export interface DocumentReaderError {
  code: 'OCR_UNAVAILABLE' | 'OCR_FAILED';
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

/** ICAO 9303 codes that aren't ISO 3166-1 alpha-3, as their country's ISO code */
const ICAO_TO_ISO: Record<string, string> = {
  D: 'DEU',
  GBD: 'GBR',
  GBN: 'GBR',
  GBO: 'GBR',
  GBP: 'GBR',
  GBS: 'GBR',
};

const EMPTY_READING: Omit<IdentityDocumentReading, 'text'> = {
  isValid: false,
  mrz: null,
  issuingCountry: null,
  nationality: null,
  surname: null,
  givenNames: null,
  dateOfBirth: null,
  sex: null,
  documentNumber: null,
  dateOfExpiry: null,
};

// ============================================================================
// Helpers
// ============================================================================

/** An MRZ country code as ISO alpha-3 ('LBN', 'D<<' → 'DEU'); null when empty */
export function normalizeMrzCountry(code: string | null | undefined): string | null {
  const cleaned = (code ?? '').replace(/</g, '').trim().toUpperCase();
  if (!cleaned) return null;
  return ICAO_TO_ISO[cleaned] ?? cleaned;
}

/** Builds a reading from recognised text (exported for testing and for apps with their own OCR) */
export function readingFromText(text: string): IdentityDocumentReading {
  const detection = detectAndParseMRZ(text);
  const mrz = detection.found ? detection.parsed ?? null : null;
  if (!mrz?.isValid) {
    return { ...EMPTY_READING, mrz, text };
  }
  const clean = (value: string | undefined) => (value ? value.replace(/</g, ' ').replace(/\s+/g, ' ').trim() || null : null);
  return {
    isValid: true,
    mrz,
    issuingCountry: normalizeMrzCountry(mrz.issuingCountry),
    nationality: normalizeMrzCountry(mrz.nationality),
    surname: clean(mrz.surname),
    givenNames: clean(mrz.givenNames),
    dateOfBirth: mrz.dateOfBirth || null,
    sex: mrz.sex === 'M' || mrz.sex === 'F' ? mrz.sex : null,
    documentNumber: clean(mrz.documentNumber),
    dateOfExpiry: mrz.dateOfExpiry || null,
    text,
  };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Reads a document photo on the device.
 *
 * Resolves with an invalid reading (`isValid: false`) when no MRZ could be read; rejects with a
 * {@link DocumentReaderError} when on-device OCR isn't installed or fails.
 *
 * @param imageUri - file:// URI of the photo (the cropped capture works best)
 */
export async function readIdentityDocument(imageUri: string): Promise<IdentityDocumentReading> {
  let mlkit: typeof import('react-native-vision-camera-mlkit');
  try {
    mlkit = require('react-native-vision-camera-mlkit');
  } catch {
    throw { code: 'OCR_UNAVAILABLE', message: 'react-native-vision-camera-mlkit is not installed' } as DocumentReaderError;
  }
  if (!mlkit.isFeatureAvailable(mlkit.MLKIT_FEATURE_KEYS.TEXT_RECOGNITION)) {
    throw { code: 'OCR_UNAVAILABLE', message: 'ML Kit text recognition is not enabled in this build' } as DocumentReaderError;
  }
  try {
    const result = await mlkit.processImageTextRecognition(imageUri, { language: 'LATIN' });
    return readingFromText(result.text);
  } catch (error) {
    throw { code: 'OCR_FAILED', message: error instanceof Error ? error.message : String(error) } as DocumentReaderError;
  }
}
