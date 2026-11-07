/**
 * Document Reader
 *
 * Reads an identity document photo on the device: the platform's text recognition (Apple Vision on iOS,
 * ML Kit through Google Play services on Android), then the MRZ parser. Nothing leaves the phone.
 *
 * Uses this package's own recognizer (DocumentTextRecognizer), set up for documents; in an app whose native code
 * predates it, the optional peer `expo-text-extractor`.
 *
 * @module DocumentReader
 */

import { documentTextRecognizer, rowsOf } from '../core/DocumentTextRecognizer';
import { detectAndParseMRZ, type ParsedMRZ } from './MRZParser';

import type { DocumentTextRecognizer, TextRegion } from '../core/DocumentTextRecognizer';

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
  /** Everything the text recognition read, a line per row, for apps that read more fields themselves */
  text: string;
}

export interface ReadIdentityDocumentOptions {
  /**
   * Logs every line the OCR read and what the MRZ parser made of it, to map new document types. The lines are
   * the document's personal data: turn it on in development builds only.
   */
  debug?: boolean;
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
/**
 * The '<<' between surname and given names misread as '<' and a letter ("EL<HAYEK<CROY" for "EL<HAYEK<<ROY"): the names
 * line has no check digit, so the printed names on the page decide. With no given names read, the first surname word
 * after the first that isn't printed, but is once its first letter goes, starts the given names.
 */
function splitMisreadNames(
  surname: string | null,
  givenNames: string | null,
  text: string
): { surname: string | null; givenNames: string | null } {
  if (!surname || givenNames) return { surname, givenNames };
  // The words printed on the page, the MRZ lines themselves left out
  const printed = new Set(
    text
      .split('\n')
      .filter((line) => !line.includes('<'))
      .join(' ')
      .toUpperCase()
      .split(/[^A-Z]+/)
      .filter(Boolean)
  );
  const words = surname.split(' ');
  const at = words.findIndex(
    (word, index) => index > 0 && word.length > 2 && !printed.has(word) && printed.has(word.slice(1))
  );
  if (at < 0) return { surname, givenNames };
  return {
    surname: words.slice(0, at).join(' '),
    givenNames: [words[at].slice(1), ...words.slice(at + 1)].join(' '),
  };
}

export function readingFromText(text: string): IdentityDocumentReading {
  const detection = detectAndParseMRZ(text);
  const mrz = detection.found ? detection.parsed ?? null : null;
  if (!mrz?.isValid) {
    return { ...EMPTY_READING, mrz, text };
  }
  const clean = (value: string | undefined) => (value ? value.replace(/</g, ' ').replace(/\s+/g, ' ').trim() || null : null);
  const names = splitMisreadNames(clean(mrz.surname), clean(mrz.givenNames), text);
  return {
    isValid: true,
    mrz,
    issuingCountry: normalizeMrzCountry(mrz.issuingCountry),
    nationality: normalizeMrzCountry(mrz.nationality),
    surname: names.surname,
    givenNames: names.givenNames,
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
export async function readIdentityDocument(
  imageUri: string,
  { debug = false }: ReadIdentityDocumentOptions = {}
): Promise<IdentityDocumentReading> {
  const recognizer = documentTextRecognizer();
  const { reading, engine, pass } = recognizer
    ? await readNatively(recognizer, imageUri)
    : { reading: await readWithTextExtractor(imageUri), engine: 'expo-text-extractor', pass: 'whole photo' };
  if (debug) {
    const { text, mrz, ...fields } = reading;
    console.log(
      '[OCR] reading',
      JSON.stringify(
        { imageUri, engine, pass, lines: text.split('\n'), mrzFound: mrz !== null, mrzLines: mrz?.raw.split('\n') ?? [], ...fields },
        null,
        2
      )
    );
  }
  return reading;
}

/** Where an MRZ sits on a document filling the photo: its bottom part (a passport's data page, an ID card's back) */
const MRZ_BAND: TextRegion = { x: 0, y: 0.5, width: 1, height: 0.5 };

/**
 * The whole photo first; without a valid MRZ, its bottom band again, read at a higher resolution, with the photo's
 * printed lines kept (they settle a name split the MRZ misread).
 */
async function readNatively(recognizer: DocumentTextRecognizer, imageUri: string) {
  try {
    const rows = rowsOf(await recognizer.recognize(imageUri));
    const whole = readingFromText(rows.join('\n'));
    if (whole.isValid) return { reading: whole, engine: 'native', pass: 'whole photo' };
    const band = rowsOf(await recognizer.recognize(imageUri, MRZ_BAND));
    const printed = rows.filter((row) => !row.includes('<'));
    const banded = readingFromText([...printed, ...band].join('\n'));
    return { reading: banded.isValid || banded.mrz ? banded : whole, engine: 'native', pass: 'whole photo, then the MRZ band' };
  } catch (error) {
    throw { code: 'OCR_FAILED', message: error instanceof Error ? error.message : String(error) } as DocumentReaderError;
  }
}

/** The fallback for a build without this package's recognizer */
async function readWithTextExtractor(imageUri: string): Promise<IdentityDocumentReading> {
  let textExtractor: typeof import('expo-text-extractor');
  try {
    textExtractor = require('expo-text-extractor');
  } catch {
    throw { code: 'OCR_UNAVAILABLE', message: 'expo-text-extractor is not installed' } as DocumentReaderError;
  }
  if (!textExtractor.isSupported) {
    throw { code: 'OCR_UNAVAILABLE', message: 'Text recognition is not supported on this device' } as DocumentReaderError;
  }
  try {
    // A string per recognised line (iOS) or block (Android): the MRZ parser reads them one row each
    const lines = await textExtractor.extractTextFromImage(imageUri);
    return readingFromText(lines.join('\n'));
  } catch (error) {
    throw { code: 'OCR_FAILED', message: error instanceof Error ? error.message : String(error) } as DocumentReaderError;
  }
}
