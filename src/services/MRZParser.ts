/**
 * MRZ (Machine Readable Zone) Parser Service
 *
 * Detects, parses, and validates MRZ data from passport and ID card images.
 * Supports TD1 (ID cards), TD2 (some IDs/visas), and TD3 (passports) formats.
 *
 * @module MRZParser
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

/** MRZ document format types */
export type MRZType = 'TD1' | 'TD2' | 'TD3';

/** Sex/Gender values in MRZ */
export type MRZSex = 'M' | 'F' | 'X' | '<';

/** Check digit validation results */
export interface MRZCheckDigits {
  documentNumber: boolean;
  dateOfBirth: boolean;
  dateOfExpiry: boolean;
  personalNumber?: boolean;
  composite: boolean;
}

/** Parsed MRZ data */
export interface ParsedMRZ {
  /** Raw MRZ lines */
  raw: string;
  /** MRZ format type */
  type: MRZType;
  /** Document type code (P=Passport, I=ID, etc.) */
  documentType: string;
  /** Issuing country/state (3-letter code) */
  issuingCountry: string;
  /** Surname (family name) */
  surname: string;
  /** Given names */
  givenNames: string;
  /** Full name combined */
  fullName: string;
  /** Document/passport number */
  documentNumber: string;
  /** Nationality (3-letter code) */
  nationality: string;
  /** Date of birth (YYYY-MM-DD) */
  dateOfBirth: string;
  /** Date of birth raw (YYMMDD) */
  dateOfBirthRaw: string;
  /** Sex (M/F/X/<) */
  sex: MRZSex;
  /** Date of expiry (YYYY-MM-DD) */
  dateOfExpiry: string;
  /** Date of expiry raw (YYMMDD) */
  dateOfExpiryRaw: string;
  /** Personal number (optional, depends on country) */
  personalNumber?: string;
  /** Optional data field 1 */
  optionalData1?: string;
  /** Optional data field 2 (TD1 only) */
  optionalData2?: string;
  /** Check digit validation results */
  checkDigits: MRZCheckDigits;
  /** Whether all check digits passed */
  isValid: boolean;
  /** Confidence score (0-1) based on check digits */
  confidence: number;
}

/** MRZ detection result */
export interface MRZDetectionResult {
  /** Whether MRZ was found */
  found: boolean;
  /** Detected MRZ type */
  type?: MRZType;
  /** Raw MRZ lines */
  lines?: string[];
  /** Parsed MRZ data (if parsing succeeded) */
  parsed?: ParsedMRZ;
  /** Error message if detection/parsing failed */
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** MRZ character weights for check digit calculation */
const WEIGHTS = [7, 3, 1];

/** Valid MRZ characters and their numeric values */
const CHAR_VALUES: Record<string, number> = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '<': 0,
  'A': 10, 'B': 11, 'C': 12, 'D': 13, 'E': 14,
  'F': 15, 'G': 16, 'H': 17, 'I': 18, 'J': 19,
  'K': 20, 'L': 21, 'M': 22, 'N': 23, 'O': 24,
  'P': 25, 'Q': 26, 'R': 27, 'S': 28, 'T': 29,
  'U': 30, 'V': 31, 'W': 32, 'X': 33, 'Y': 34,
  'Z': 35,
};

/** Country code to full name mapping (common ones) */
const COUNTRY_NAMES: Record<string, string> = {
  'AFG': 'Afghanistan', 'ALB': 'Albania', 'DZA': 'Algeria', 'AND': 'Andorra',
  'AGO': 'Angola', 'ARG': 'Argentina', 'ARM': 'Armenia', 'AUS': 'Australia',
  'AUT': 'Austria', 'AZE': 'Azerbaijan', 'BHR': 'Bahrain', 'BGD': 'Bangladesh',
  'BLR': 'Belarus', 'BEL': 'Belgium', 'BRA': 'Brazil', 'BGR': 'Bulgaria',
  'CAN': 'Canada', 'CHN': 'China', 'COL': 'Colombia', 'HRV': 'Croatia',
  'CYP': 'Cyprus', 'CZE': 'Czech Republic', 'DNK': 'Denmark', 'EGY': 'Egypt',
  'EST': 'Estonia', 'FIN': 'Finland', 'FRA': 'France', 'DEU': 'Germany',
  'GRC': 'Greece', 'HUN': 'Hungary', 'ISL': 'Iceland', 'IND': 'India',
  'IDN': 'Indonesia', 'IRN': 'Iran', 'IRQ': 'Iraq', 'IRL': 'Ireland',
  'ISR': 'Israel', 'ITA': 'Italy', 'JPN': 'Japan', 'JOR': 'Jordan',
  'KAZ': 'Kazakhstan', 'KEN': 'Kenya', 'KWT': 'Kuwait', 'LVA': 'Latvia',
  'LBN': 'Lebanon', 'LBY': 'Libya', 'LTU': 'Lithuania', 'LUX': 'Luxembourg',
  'MYS': 'Malaysia', 'MLT': 'Malta', 'MEX': 'Mexico', 'MAR': 'Morocco',
  'NLD': 'Netherlands', 'NZL': 'New Zealand', 'NGA': 'Nigeria', 'NOR': 'Norway',
  'OMN': 'Oman', 'PAK': 'Pakistan', 'PHL': 'Philippines', 'POL': 'Poland',
  'PRT': 'Portugal', 'QAT': 'Qatar', 'ROU': 'Romania', 'RUS': 'Russia',
  'SAU': 'Saudi Arabia', 'SRB': 'Serbia', 'SGP': 'Singapore', 'SVK': 'Slovakia',
  'SVN': 'Slovenia', 'ZAF': 'South Africa', 'KOR': 'South Korea', 'ESP': 'Spain',
  'LKA': 'Sri Lanka', 'SWE': 'Sweden', 'CHE': 'Switzerland', 'SYR': 'Syria',
  'TWN': 'Taiwan', 'THA': 'Thailand', 'TUN': 'Tunisia', 'TUR': 'Turkey',
  'UKR': 'Ukraine', 'ARE': 'United Arab Emirates', 'GBR': 'United Kingdom',
  'USA': 'United States', 'VNM': 'Vietnam', 'YEM': 'Yemen',
  // Special codes
  'UTO': 'Utopia (Test)', 'XXX': 'Unspecified', 'D<<': 'Germany',
};

// ============================================================================
// Check Digit Calculation
// ============================================================================

/**
 * Calculate MRZ check digit for a given string
 * Uses the standard ICAO 9303 algorithm: weighted sum mod 10
 *
 * @param data - String to calculate check digit for
 * @returns Check digit (0-9)
 */
export function calculateCheckDigit(data: string): number {
  let sum = 0;
  const upperData = data.toUpperCase();

  for (let i = 0; i < upperData.length; i++) {
    const char = upperData[i];
    const value = CHAR_VALUES[char];

    if (value === undefined) {
      console.warn(`[MRZ] Invalid character in check digit calculation: '${char}'`);
      return -1;
    }

    sum += value * WEIGHTS[i % 3];
  }

  return sum % 10;
}

/**
 * Validate a check digit against calculated value
 *
 * @param data - String to validate
 * @param checkDigit - Expected check digit character
 * @returns true if valid
 */
export function validateCheckDigit(data: string, checkDigit: string): boolean {
  const expected = calculateCheckDigit(data);
  const actual = parseInt(checkDigit, 10);

  if (expected === -1 || isNaN(actual)) {
    return false;
  }

  return expected === actual;
}

// ============================================================================
// MRZ Detection
// ============================================================================

/**
 * Clean and normalize OCR text for MRZ detection
 * Handles common OCR errors and character substitutions
 */
function cleanMRZText(text: string): string {
  return text
    // Normalize whitespace
    .replace(/\s+/g, '\n')
    // Common OCR substitutions
    .replace(/0/g, 'O') // Then we'll handle O->0 for numbers
    .replace(/[Il|]/g, '1') // I, l, | often confused with 1
    .replace(/[oO]/g, '0') // o, O often confused with 0
    .replace(/[Ss]/g, '5') // S sometimes confused with 5
    .replace(/[Bb]/g, '8') // B sometimes confused with 8
    // Keep only valid MRZ characters
    .toUpperCase();
}

/**
 * Detect MRZ pattern in a single line
 */
function isMRZLine(line: string): boolean {
  // MRZ lines contain only A-Z, 0-9, and <
  // They typically have multiple < characters and specific patterns
  const cleanLine = line.replace(/\s/g, '').toUpperCase();

  // Must be mostly valid MRZ characters
  const validChars = cleanLine.replace(/[^A-Z0-9<]/g, '');
  if (validChars.length < cleanLine.length * 0.8) {
    return false;
  }

  // Must contain < characters (filler)
  if (!cleanLine.includes('<')) {
    return false;
  }

  // Check length matches MRZ formats
  const len = cleanLine.length;
  return len === 30 || len === 36 || len === 44;
}

/**
 * Extract potential MRZ lines from OCR text
 */
function extractMRZLines(text: string): string[] {
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
  const mrzLines: string[] = [];

  for (const line of lines) {
    // Clean the line; look-alike characters are repaired per field once the format is known (repairMRZLines)
    const cleanLine = line.replace(/\s/g, '').toUpperCase();

    // Check if it looks like MRZ
    if (isMRZLine(cleanLine)) {
      mrzLines.push(cleanLine);
    }
  }

  return mrzLines;
}

/**
 * Determine MRZ type from lines
 */
function determineMRZType(lines: string[]): MRZType | null {
  if (lines.length === 2) {
    const len = lines[0].length;
    if (len === 44) return 'TD3'; // Passport
    if (len === 36) return 'TD2'; // Some IDs
  } else if (lines.length === 3) {
    const len = lines[0].length;
    if (len === 30) return 'TD1'; // ID cards
  }
  return null;
}

// ============================================================================
// OCR Repair
// ============================================================================

/** Digits OCR reads in place of letters, and back */
const DIGIT_TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '6': 'G', '8': 'B' };
const LETTER_TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };

/**
 * What each position holds (ICAO 9303): A = letters (names, countries, sex), N = digits (dates, check digits),
 * X = either (document and personal numbers, guarded by their check digits). '<' is kept wherever it is.
 */
const POSITION_TEMPLATES: Record<MRZType, string[]> = {
  TD3: [
    'A'.repeat(44),
    'XXXXXXXXX' + 'N' + 'AAA' + 'NNNNNN' + 'N' + 'A' + 'NNNNNN' + 'N' + 'X'.repeat(14) + 'N' + 'N',
  ],
  TD2: [
    'A'.repeat(36),
    'XXXXXXXXX' + 'N' + 'AAA' + 'NNNNNN' + 'N' + 'A' + 'NNNNNN' + 'N' + 'X'.repeat(7) + 'N',
  ],
  TD1: [
    'AA' + 'AAA' + 'XXXXXXXXX' + 'N' + 'X'.repeat(15),
    'NNNNNN' + 'N' + 'A' + 'NNNNNN' + 'N' + 'AAA' + 'X'.repeat(11) + 'N',
    'A'.repeat(30),
  ],
};

/**
 * Repairs OCR look-alikes field by field: a digit read in a name or country becomes its letter, a letter read in a
 * date or check digit becomes its digit. Replacing them across the whole MRZ would corrupt one or the other.
 */
function repairMRZLines(lines: string[], type: MRZType): string[] {
  return lines.map((line, row) => {
    const template = POSITION_TEMPLATES[type][row] ?? '';
    return line
      .split('')
      .map((char, index) => {
        if (char === '<') return char;
        const kind = template[index];
        if (kind === 'A') return DIGIT_TO_LETTER[char] ?? char;
        if (kind === 'N') return LETTER_TO_DIGIT[char] ?? char;
        return char;
      })
      .join('');
  });
}

// ============================================================================
// MRZ Parsing
// ============================================================================

/**
 * Parse date from MRZ format (YYMMDD) to ISO format (YYYY-MM-DD)
 * Handles century determination (00-30 = 2000s, 31-99 = 1900s)
 */
function parseMRZDate(yymmdd: string): string {
  if (yymmdd.length !== 6 || yymmdd === '<<<<<<') {
    return '';
  }

  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = yymmdd.substring(2, 4);
  const dd = yymmdd.substring(4, 6);

  // Determine century: dates 00-30 are 2000s, 31-99 are 1900s
  const century = yy <= 30 ? 2000 : 1900;
  const yyyy = century + yy;

  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parse name field from MRZ (replace < with spaces, handle surname/given separation)
 */
function parseMRZName(nameField: string): { surname: string; givenNames: string; fullName: string } {
  // Names are separated by <<, individual parts by <
  const parts = nameField.split('<<').filter(p => p.length > 0);

  const surname = (parts[0] || '').replace(/</g, ' ').trim();
  const givenNames = (parts[1] || '').replace(/</g, ' ').trim();
  const fullName = givenNames ? `${givenNames} ${surname}` : surname;

  return { surname, givenNames, fullName };
}

/**
 * Parse TD3 (Passport) MRZ - 2 lines, 44 characters each
 *
 * Line 1: P<UTOSURNAME<<GIVEN<NAMES<<<<<<<<<<<<<<<<<<
 * Line 2: L898902C36UTO7408122F1204159ZE184226B<<<<<10
 *
 * Line 1 structure:
 * - Pos 0: Document type (P)
 * - Pos 1: Document subtype (<)
 * - Pos 2-4: Issuing country (3 chars)
 * - Pos 5-43: Name (surname<<given<names)
 *
 * Line 2 structure:
 * - Pos 0-8: Document number (9 chars)
 * - Pos 9: Document number check digit
 * - Pos 10-12: Nationality (3 chars)
 * - Pos 13-18: Date of birth (YYMMDD)
 * - Pos 19: DOB check digit
 * - Pos 20: Sex (M/F/<)
 * - Pos 21-26: Date of expiry (YYMMDD)
 * - Pos 27: Expiry check digit
 * - Pos 28-41: Personal number (14 chars)
 * - Pos 42: Personal number check digit
 * - Pos 43: Composite check digit
 */
function parseTD3(lines: string[]): ParsedMRZ {
  const line1 = lines[0];
  const line2 = lines[1];

  // Line 1 parsing
  const documentType = line1.substring(0, 2).replace(/</g, '').trim() || 'P';
  const issuingCountry = line1.substring(2, 5).replace(/</g, '');
  const nameField = line1.substring(5);
  const { surname, givenNames, fullName } = parseMRZName(nameField);

  // Line 2 parsing
  const documentNumber = line2.substring(0, 9).replace(/</g, '');
  const documentNumberCheck = line2.substring(9, 10);
  const nationality = line2.substring(10, 13).replace(/</g, '');
  const dateOfBirthRaw = line2.substring(13, 19);
  const dobCheck = line2.substring(19, 20);
  const sex = line2.substring(20, 21) as MRZSex;
  const dateOfExpiryRaw = line2.substring(21, 27);
  const expiryCheck = line2.substring(27, 28);
  const personalNumber = line2.substring(28, 42).replace(/</g, '').trim() || undefined;
  const personalNumberCheck = line2.substring(42, 43);
  const compositeCheck = line2.substring(43, 44);

  // Calculate check digits
  const documentNumberValid = validateCheckDigit(line2.substring(0, 9), documentNumberCheck);
  const dobValid = validateCheckDigit(dateOfBirthRaw, dobCheck);
  const expiryValid = validateCheckDigit(dateOfExpiryRaw, expiryCheck);

  // Personal number check (if present)
  const personalNumberValid = personalNumber
    ? validateCheckDigit(line2.substring(28, 42), personalNumberCheck)
    : true;

  // Composite check: positions 0-9, 13-19, 21-42 of line 2
  const compositeData = line2.substring(0, 10) + line2.substring(13, 20) + line2.substring(21, 43);
  const compositeValid = validateCheckDigit(compositeData, compositeCheck);

  const checkDigits: MRZCheckDigits = {
    documentNumber: documentNumberValid,
    dateOfBirth: dobValid,
    dateOfExpiry: expiryValid,
    personalNumber: personalNumberValid,
    composite: compositeValid,
  };

  // Calculate validity and confidence
  const validChecks = [documentNumberValid, dobValid, expiryValid, compositeValid].filter(Boolean).length;
  const isValid = validChecks === 4;
  const confidence = validChecks / 4;

  return {
    raw: lines.join('\n'),
    type: 'TD3',
    documentType,
    issuingCountry,
    surname,
    givenNames,
    fullName,
    documentNumber,
    nationality,
    dateOfBirth: parseMRZDate(dateOfBirthRaw),
    dateOfBirthRaw,
    sex,
    dateOfExpiry: parseMRZDate(dateOfExpiryRaw),
    dateOfExpiryRaw,
    personalNumber,
    checkDigits,
    isValid,
    confidence,
  };
}

/**
 * Parse TD2 MRZ - 2 lines, 36 characters each
 *
 * Line 1: I<UTOSURNAME<<GIVEN<NAMES<<<<<<<<<<<
 * Line 2: D231458907UTO7408122F1204159<<<<<<<6
 *
 * Similar to TD3 but shorter
 */
function parseTD2(lines: string[]): ParsedMRZ {
  const line1 = lines[0];
  const line2 = lines[1];

  // Line 1 parsing
  const documentType = line1.substring(0, 2).replace(/</g, '').trim() || 'I';
  const issuingCountry = line1.substring(2, 5).replace(/</g, '');
  const nameField = line1.substring(5);
  const { surname, givenNames, fullName } = parseMRZName(nameField);

  // Line 2 parsing
  const documentNumber = line2.substring(0, 9).replace(/</g, '');
  const documentNumberCheck = line2.substring(9, 10);
  const nationality = line2.substring(10, 13).replace(/</g, '');
  const dateOfBirthRaw = line2.substring(13, 19);
  const dobCheck = line2.substring(19, 20);
  const sex = line2.substring(20, 21) as MRZSex;
  const dateOfExpiryRaw = line2.substring(21, 27);
  const expiryCheck = line2.substring(27, 28);
  const optionalData1 = line2.substring(28, 35).replace(/</g, '').trim() || undefined;
  const compositeCheck = line2.substring(35, 36);

  // Validate check digits
  const documentNumberValid = validateCheckDigit(line2.substring(0, 9), documentNumberCheck);
  const dobValid = validateCheckDigit(dateOfBirthRaw, dobCheck);
  const expiryValid = validateCheckDigit(dateOfExpiryRaw, expiryCheck);

  // Composite check
  const compositeData = line2.substring(0, 10) + line2.substring(13, 20) + line2.substring(21, 35);
  const compositeValid = validateCheckDigit(compositeData, compositeCheck);

  const checkDigits: MRZCheckDigits = {
    documentNumber: documentNumberValid,
    dateOfBirth: dobValid,
    dateOfExpiry: expiryValid,
    composite: compositeValid,
  };

  const validChecks = [documentNumberValid, dobValid, expiryValid, compositeValid].filter(Boolean).length;
  const isValid = validChecks === 4;
  const confidence = validChecks / 4;

  return {
    raw: lines.join('\n'),
    type: 'TD2',
    documentType,
    issuingCountry,
    surname,
    givenNames,
    fullName,
    documentNumber,
    nationality,
    dateOfBirth: parseMRZDate(dateOfBirthRaw),
    dateOfBirthRaw,
    sex,
    dateOfExpiry: parseMRZDate(dateOfExpiryRaw),
    dateOfExpiryRaw,
    optionalData1,
    checkDigits,
    isValid,
    confidence,
  };
}

/**
 * Parse TD1 MRZ - 3 lines, 30 characters each
 *
 * Line 1: I<UTOD231458907<<<<<<<<<<<<<<<
 * Line 2: 7408122F1204159UTO<<<<<<<<<<<6
 * Line 3: SURNAME<<GIVEN<NAMES<<<<<<<<<
 */
function parseTD1(lines: string[]): ParsedMRZ {
  const line1 = lines[0];
  const line2 = lines[1];
  const line3 = lines[2];

  // Line 1 parsing
  const documentType = line1.substring(0, 2).replace(/</g, '').trim() || 'I';
  const issuingCountry = line1.substring(2, 5).replace(/</g, '');
  const documentNumber = line1.substring(5, 14).replace(/</g, '');
  const documentNumberCheck = line1.substring(14, 15);
  const optionalData1 = line1.substring(15, 30).replace(/</g, '').trim() || undefined;

  // Line 2 parsing
  const dateOfBirthRaw = line2.substring(0, 6);
  const dobCheck = line2.substring(6, 7);
  const sex = line2.substring(7, 8) as MRZSex;
  const dateOfExpiryRaw = line2.substring(8, 14);
  const expiryCheck = line2.substring(14, 15);
  const nationality = line2.substring(15, 18).replace(/</g, '');
  const optionalData2 = line2.substring(18, 29).replace(/</g, '').trim() || undefined;
  const compositeCheck = line2.substring(29, 30);

  // Line 3: Name
  const { surname, givenNames, fullName } = parseMRZName(line3);

  // Validate check digits
  const documentNumberValid = validateCheckDigit(line1.substring(5, 14), documentNumberCheck);
  const dobValid = validateCheckDigit(dateOfBirthRaw, dobCheck);
  const expiryValid = validateCheckDigit(dateOfExpiryRaw, expiryCheck);

  // Composite check for TD1 includes portions from all three lines
  const compositeData =
    line1.substring(5, 30) + // Doc number + optional data 1
    line2.substring(0, 7) + // DOB + check
    line2.substring(8, 15) + // Expiry + check
    line2.substring(18, 29); // Optional data 2
  const compositeValid = validateCheckDigit(compositeData, compositeCheck);

  const checkDigits: MRZCheckDigits = {
    documentNumber: documentNumberValid,
    dateOfBirth: dobValid,
    dateOfExpiry: expiryValid,
    composite: compositeValid,
  };

  const validChecks = [documentNumberValid, dobValid, expiryValid, compositeValid].filter(Boolean).length;
  const isValid = validChecks === 4;
  const confidence = validChecks / 4;

  return {
    raw: lines.join('\n'),
    type: 'TD1',
    documentType,
    issuingCountry,
    surname,
    givenNames,
    fullName,
    documentNumber,
    nationality,
    dateOfBirth: parseMRZDate(dateOfBirthRaw),
    dateOfBirthRaw,
    sex,
    dateOfExpiry: parseMRZDate(dateOfExpiryRaw),
    dateOfExpiryRaw,
    optionalData1,
    optionalData2,
    checkDigits,
    isValid,
    confidence,
  };
}

// ============================================================================
// Main API Functions
// ============================================================================

/**
 * Detect and parse MRZ from OCR text
 *
 * @param ocrText - Raw OCR text from document image
 * @returns MRZ detection result with parsed data if found
 */
export function detectAndParseMRZ(ocrText: string): MRZDetectionResult {
  try {
    console.log('[MRZ] Starting MRZ detection...');

    // Extract potential MRZ lines
    const mrzLines = extractMRZLines(ocrText);
    console.log(`[MRZ] Found ${mrzLines.length} potential MRZ lines`);

    if (mrzLines.length < 2) {
      // Try more aggressive detection
      const aggressiveLines = findMRZLinesAggressive(ocrText);
      if (aggressiveLines.length >= 2) {
        mrzLines.length = 0;
        mrzLines.push(...aggressiveLines);
        console.log(`[MRZ] Aggressive detection found ${mrzLines.length} lines`);
      }
    }

    if (mrzLines.length < 2) {
      return {
        found: false,
        error: 'No MRZ lines detected in OCR text',
      };
    }

    // Determine MRZ type
    const mrzType = determineMRZType(mrzLines);
    if (!mrzType) {
      return {
        found: false,
        lines: mrzLines,
        error: `Could not determine MRZ type from ${mrzLines.length} lines of lengths: ${mrzLines.map(l => l.length).join(', ')}`,
      };
    }

    console.log(`[MRZ] Detected MRZ type: ${mrzType}`);
    console.log(`[MRZ] Lines:\n${mrzLines.join('\n')}`);

    // Parse based on type
    const repaired = repairMRZLines(mrzLines, mrzType);
    let parsed: ParsedMRZ;
    switch (mrzType) {
      case 'TD3':
        parsed = parseTD3(repaired);
        break;
      case 'TD2':
        parsed = parseTD2(repaired);
        break;
      case 'TD1':
        parsed = parseTD1(repaired);
        break;
    }

    console.log(`[MRZ] Parsed successfully:`, {
      type: parsed.type,
      name: parsed.fullName,
      documentNumber: parsed.documentNumber,
      nationality: parsed.nationality,
      dob: parsed.dateOfBirth,
      expiry: parsed.dateOfExpiry,
      isValid: parsed.isValid,
      confidence: `${(parsed.confidence * 100).toFixed(0)}%`,
    });

    return {
      found: true,
      type: mrzType,
      lines: repaired,
      parsed,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MRZ] Detection error:', message);
    return {
      found: false,
      error: `MRZ detection failed: ${message}`,
    };
  }
}

/**
 * More aggressive MRZ line detection for poorly OCR'd documents
 */
function findMRZLinesAggressive(text: string): string[] {
  const lines: string[] = [];

  // Look for patterns that match MRZ structure
  // TD3 pattern: starts with P< or similar
  const td3Pattern = /[PIACVDSO][<A-Z][A-Z]{3}[A-Z<]{39}/g;
  const td3Line2Pattern = /[A-Z0-9<]{9}[0-9][A-Z]{3}[0-9]{6}[0-9][MF<][0-9]{6}[0-9][A-Z0-9<]{14}[0-9]/g;

  // Try to find TD3 passport patterns
  const line1Matches = text.match(td3Pattern);
  const line2Matches = text.match(td3Line2Pattern);

  if (line1Matches && line1Matches.length > 0) {
    lines.push(line1Matches[0]);
  }
  if (line2Matches && line2Matches.length > 0) {
    lines.push(line2Matches[0]);
  }

  // If we found 2 lines of 44 chars, we have a TD3
  if (lines.length === 2 && lines[0].length === 44 && lines[1].length === 44) {
    return lines;
  }

  // Fall back to looking for any lines with lots of < characters
  const allLines = text.split(/[\n\r]+/);
  const candidates: string[] = [];

  for (const line of allLines) {
    const clean = line.replace(/\s/g, '').toUpperCase();

    // Must have valid MRZ length and contain <
    if ((clean.length === 30 || clean.length === 36 || clean.length === 44) &&
        clean.includes('<') &&
        /^[A-Z0-9<]+$/.test(clean)) {
      candidates.push(clean);
    }
  }

  return candidates;
}

/**
 * Get country name from 3-letter code
 */
export function getCountryName(code: string): string {
  return COUNTRY_NAMES[code.toUpperCase()] || code;
}

/**
 * Format sex code to readable string
 */
export function formatSex(sex: MRZSex): string {
  switch (sex) {
    case 'M': return 'Male';
    case 'F': return 'Female';
    case 'X': return 'Unspecified';
    default: return 'Unknown';
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  detectAndParseMRZ,
  calculateCheckDigit,
  validateCheckDigit,
  getCountryName,
  formatSex,
};
