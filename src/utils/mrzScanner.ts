import { useFrameProcessor } from "react-native-vision-camera";

// MRZ Data interface based on ICAO 9303 specification
export interface PassportMRZData {
  documentType: string;
  issuingCountry: string;
  lastName: string;
  firstName: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth: string;
  sex: string;
  expirationDate: string;
  personalNumber?: string;
  checkDigits: {
    passportNumber: string;
    dateOfBirth: string;
    expirationDate: string;
    personalNumber?: string;
    composite: string;
  };
  valid: boolean;
  validationDetails: {
    passportNumberValid: boolean;
    dateOfBirthValid: boolean;
    expirationDateValid: boolean;
    personalNumberValid: boolean;
    compositeValid: boolean;
    formatValid: boolean;
  };
}

// Comprehensive MRZ character corrections based on common OCR errors
const MRZ_CHARACTER_MAP: { [key: string]: string } = {
  // Quotation marks and similar characters to MRZ filler
  "«": "<", "»": "<", "‹": "<", "›": "<", 
  "´": "<", "`": "<", "^": "<", "~": "<", "¨": "<", "°": "<",
  
  // Common number/letter confusions in MRZ context
  "O": "0", "o": "0", // Letter O to zero in numeric fields
  "I": "1", "l": "1", "|": "1", // Letter I/l to one in numeric fields
  "S": "5", "s": "5", // Letter S to five in numeric fields
  "B": "8", "b": "8", // Letter B to eight in numeric fields
  "G": "6", "g": "6", // Letter G to six in numeric fields
  "D": "0", "d": "0", // Letter D to zero in some contexts
  "Z": "2", "z": "2", // Letter Z to two in numeric fields
  
  // Space and dash handling
  " ": "", "-": "", "_": "", "–": "", "—": "",
  
  // Other common OCR artifacts
  ".": "", ",": "", ";": "", ":": "", "!": "1", "?": "",
  "(": "", ")": "", "[": "", "]": "", "{": "", "}": "",
  "+": "", "=": "", "*": "", "&": "", "%": "", "#": "",
};

export class MRZScanner {
  /**
   * Create MRZ frame processor for Vision Camera
   */
  static createMRZFrameProcessor(onMRZDetected: (mrz: PassportMRZData) => void) {
    return useFrameProcessor(
      (_frame) => {
        "worklet";
        try {
          console.warn("Real-time MRZ scanning requires native OCR integration in frame processor");
        } catch (error) {
          console.warn("MRZ scanning error:", error);
        }
      },
      [onMRZDetected]
    );
  }

  /**
   * Extract MRZ from image using OCR and parse it
   */
  static async extractMRZFromImage(imageUri: string): Promise<PassportMRZData | null> {
    try {
      console.log("🔍 Starting MRZ extraction from image...");
      
      // Try ML Kit first
      let ocrText = "";
      try {
        const MLKitTextRecognition = require("@react-native-ml-kit/text-recognition").default;
        const result = await MLKitTextRecognition.recognize(imageUri);
        ocrText = result.text || "";
        console.log(`📄 ML Kit extracted ${ocrText.length} characters`);
      } catch (error) {
        console.warn("ML Kit not available, trying OCRProcessor fallback");
        
        // Fallback to OCRProcessor
        try {
          const { OCRProcessor } = require("./ocrProcessor");
          const ocrResult = await OCRProcessor.extractText(imageUri, {
            language: "en",
            enableOCR: true,
          });
          ocrText = ocrResult.text;
          console.log(`📄 OCRProcessor extracted ${ocrText.length} characters`);
        } catch (fallbackError) {
          console.error("Both ML Kit and OCRProcessor failed:", fallbackError);
          throw new Error("No OCR engine available for MRZ extraction");
        }
      }

      if (!ocrText || ocrText.length < 50) {
        console.warn("OCR text too short for MRZ analysis:", ocrText);
        return null;
      }

      // Detect and extract MRZ lines
      const mrzLines = this.detectAndExtractMRZ(ocrText);
      if (!mrzLines) {
        console.log("No valid MRZ pattern found in OCR text");
        return null;
      }

      console.log("✅ MRZ lines detected:", mrzLines);

      // Parse the MRZ
      const mrzData = this.parseMRZ(mrzLines);
      console.log("📋 MRZ parsing result:", {
        valid: mrzData.valid,
        documentNumber: mrzData.passportNumber,
        name: `${mrzData.firstName} ${mrzData.lastName}`,
        validationDetails: mrzData.validationDetails
      });

      return mrzData;
    } catch (error) {
      console.error("❌ MRZ extraction failed:", error);
      return null;
    }
  }

  /**
   * Comprehensive MRZ detection and extraction from OCR text
   */
  private static detectAndExtractMRZ(text: string): string[] | null {
    console.log("🔍 Analyzing OCR text for MRZ patterns...");
    
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    console.log(`📝 Processing ${lines.length} text lines`);

    // Track potential MRZ components
    const mrzLine1Candidates: string[] = [];
    const mrzLine2Candidates: string[] = [];
    let bestScore = 0;
    let bestMRZ: string[] | null = null;

    // Analyze each line for MRZ patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i < lines.length - 1 ? lines[i + 1] : "";

      // Look for MRZ Line 1 pattern: P<COUNTRY<LASTNAME<<FIRSTNAME<...
      const line1Score = this.scoreMRZLine1(line);
      if (line1Score > 0.6) {
        mrzLine1Candidates.push(line);
        console.log(`📝 MRZ Line 1 candidate (score: ${line1Score.toFixed(2)}): ${line}`);
      }

      // Look for MRZ Line 2 pattern: PASSNUM<CNTRYYYMMDDXSEXYYMMDDX...
      const line2Score = this.scoreMRZLine2(line);
      if (line2Score > 0.6) {
        mrzLine2Candidates.push(line);
        console.log(`📝 MRZ Line 2 candidate (score: ${line2Score.toFixed(2)}): ${line}`);
      }

      // Check for adjacent line pairs
      if (line1Score > 0.5 && nextLine) {
        const nextLineScore = this.scoreMRZLine2(nextLine);
        const pairScore = (line1Score + nextLineScore) / 2;
        
        if (pairScore > bestScore && pairScore > 0.6) {
          bestScore = pairScore;
          bestMRZ = [line, nextLine];
          console.log(`🎯 Best MRZ pair found (score: ${pairScore.toFixed(2)}):`, bestMRZ);
        }
      }
    }

    // If we found a good pair, use it
    if (bestMRZ) {
      return bestMRZ.map(line => this.cleanAndCorrectMRZ(line));
    }

    // Otherwise, try to match best individual candidates
    if (mrzLine1Candidates.length > 0 && mrzLine2Candidates.length > 0) {
      const line1 = mrzLine1Candidates[0]; // Highest scored
      const line2 = mrzLine2Candidates[0]; // Highest scored
      console.log("🔧 Using best individual candidates");
      return [this.cleanAndCorrectMRZ(line1), this.cleanAndCorrectMRZ(line2)];
    }

    console.log("❌ No valid MRZ pattern detected");
    return null;
  }

  /**
   * Score how likely a line is to be MRZ Line 1
   */
  private static scoreMRZLine1(line: string): number {
    let score = 0;
    const cleanLine = line.replace(/\s+/g, "").toUpperCase();

    // Must start with P< or P«
    if (/^P[<«]/.test(cleanLine)) score += 0.3;
    else return 0; // Not a valid line 1

    // Should have country code (3 letters after P<)
    if (/^P[<«][A-Z]{3}/.test(cleanLine)) score += 0.2;

    // Should have name separators (<<)
    if (cleanLine.includes("<<") || cleanLine.includes("««")) score += 0.2;

    // Should be around 44 characters or have potential to be
    const expectedLength = Math.abs(cleanLine.length - 44);
    if (expectedLength <= 5) score += 0.2;
    else if (expectedLength <= 10) score += 0.1;

    // Should contain mostly valid MRZ characters
    const validChars = (cleanLine.match(/[A-Z0-9<«»]/g) || []).length;
    const charRatio = validChars / cleanLine.length;
    score += charRatio * 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Score how likely a line is to be MRZ Line 2
   */
  private static scoreMRZLine2(line: string): number {
    let score = 0;
    const cleanLine = line.replace(/\s+/g, "").toUpperCase();

    // Should start with document number (letters + numbers)
    if (/^[A-Z]{2}[0-9A-Z]{6,}/.test(cleanLine)) score += 0.3;

    // Should contain country code (3 letters)
    if (/[A-Z]{3}/.test(cleanLine)) score += 0.2;

    // Should contain dates (6 consecutive digits, appears twice)
    const dateMatches = (cleanLine.match(/\d{6}/g) || []).length;
    if (dateMatches >= 2) score += 0.2;
    else if (dateMatches >= 1) score += 0.1;

    // Should contain sex indicator (M or F)
    if (/[MF]/.test(cleanLine)) score += 0.1;

    // Should be around 44 characters
    const expectedLength = Math.abs(cleanLine.length - 44);
    if (expectedLength <= 5) score += 0.2;
    else if (expectedLength <= 10) score += 0.1;

    return Math.min(score, 1.0);
  }

  /**
   * Clean and correct MRZ line using comprehensive character mapping
   */
  private static cleanAndCorrectMRZ(line: string): string {
    let corrected = line.toUpperCase();
    
    console.log(`🧹 Cleaning MRZ line: "${line}"`);

    // Apply character corrections
    for (const [wrong, correct] of Object.entries(MRZ_CHARACTER_MAP)) {
      if (corrected.includes(wrong)) {
        corrected = corrected.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correct);
      }
    }

    // Normalize to exactly 44 characters
    if (corrected.length < 44) {
      corrected = corrected.padEnd(44, '<');
    } else if (corrected.length > 44) {
      // Smart truncation - prefer keeping data from the beginning
      corrected = corrected.substring(0, 44);
    }

    console.log(`✨ Cleaned result: "${corrected}"`);
    return corrected;
  }

  /**
   * Parse MRZ lines according to ICAO 9303 TD3 specification
   */
  static parseMRZ(mrzLines: string[] | string): PassportMRZData {
    try {
      let lines: string[];
      
      if (typeof mrzLines === "string") {
        lines = mrzLines.split("\n").filter(line => line.trim().length > 0);
      } else {
        lines = mrzLines.filter(line => line.trim().length > 0);
      }

      if (lines.length !== 2) {
        throw new Error(`MRZ must contain exactly 2 lines, got ${lines.length}`);
      }

      const [line1, line2] = lines.map(line => this.cleanAndCorrectMRZ(line.trim()));
      
      console.log("📋 Parsing ICAO 9303 TD3 MRZ:");
      console.log(`   Line 1: ${line1}`);
      console.log(`   Line 2: ${line2}`);

      // Validate line lengths
      if (line1.length !== 44 || line2.length !== 44) {
        throw new Error(`Invalid MRZ line lengths: ${line1.length}, ${line2.length} (expected 44 each)`);
      }

      // Parse Line 1: P<ISSCOUNTRY<LASTNAME<<FIRSTNAME<...
      const documentType = line1.substring(0, 1);
      const issuingCountry = line1.substring(2, 5);
      
      // Parse names from position 5-44
      const nameField = line1.substring(5, 44).replace(/</g, ' ').trim();
      const nameParts = nameField.split('  '); // Double space separates last and first names
      const lastName = (nameParts[0] || '').trim();
      const firstName = (nameParts[1] || '').trim();

      // Parse Line 2: PASSNUM<CNTRYYYMMDDXSEXYYMMDDX...
      const passportNumber = this.extractAlphanumericField(line2.substring(0, 9));
      const passportCheckDigit = line2.substring(9, 10);
      const nationality = line2.substring(10, 13);
      
      // Parse dates
      const dobString = line2.substring(13, 19);
      const dobCheckDigit = line2.substring(19, 20);
      const sex = this.parseSex(line2.substring(20, 21));
      const expiryString = line2.substring(21, 27);
      const expiryCheckDigit = line2.substring(27, 28);
      
      // Personal number (optional)
      const personalNumberField = line2.substring(28, 42);
      const personalNumber = this.extractAlphanumericField(personalNumberField);
      const personalCheckDigit = line2.substring(42, 43);
      const compositeCheckDigit = line2.substring(43, 44);

      // Format dates
      const dateOfBirth = this.formatMRZDate(dobString);
      const expirationDate = this.formatMRZDate(expiryString);

      // Validate all check digits
      const validationDetails = this.validateAllChecksums(
        passportNumber, passportCheckDigit,
        dobString, dobCheckDigit,
        expiryString, expiryCheckDigit,
        personalNumberField, personalCheckDigit,
        line2, compositeCheckDigit
      );

      const checkDigits = {
        passportNumber: passportCheckDigit,
        dateOfBirth: dobCheckDigit,
        expirationDate: expiryCheckDigit,
        personalNumber: personalCheckDigit,
        composite: compositeCheckDigit,
      };

      const result: PassportMRZData = {
        documentType,
        issuingCountry,
        lastName,
        firstName,
        passportNumber,
        nationality,
        dateOfBirth,
        sex,
        expirationDate,
        personalNumber: personalNumber || undefined,
        checkDigits,
        valid: validationDetails.formatValid && Object.values(validationDetails).every(v => v === true),
        validationDetails,
      };

      console.log("✅ MRZ parsing completed:", {
        valid: result.valid,
        name: `${firstName} ${lastName}`,
        document: passportNumber,
        validation: validationDetails
      });

      return result;
    } catch (error) {
      console.error("❌ MRZ parsing failed:", error);
      throw new Error(`MRZ parsing failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Extract alphanumeric field removing filler characters
   */
  private static extractAlphanumericField(field: string): string {
    return field.replace(/</g, '').trim();
  }

  /**
   * Parse sex field with fallback handling
   */
  private static parseSex(sexChar: string): string {
    switch (sexChar.toUpperCase()) {
      case 'M': return 'M';
      case 'F': return 'F';
      case '<': return 'X'; // Unspecified
      default: return 'X';
    }
  }

  /**
   * Format MRZ date (YYMMDD) to ISO format (YYYY-MM-DD)
   */
  private static formatMRZDate(dateString: string): string {
    if (!dateString || dateString.length !== 6 || !/^\d{6}$/.test(dateString)) {
      console.warn(`Invalid MRZ date format: "${dateString}"`);
      return "";
    }

    const yy = parseInt(dateString.substring(0, 2));
    const mm = dateString.substring(2, 4);
    const dd = dateString.substring(4, 6);

    // Smart year calculation: assume dates in future refer to 1900s
    const currentYear = new Date().getFullYear() % 100;
    let fullYear: number;
    
    if (yy <= currentYear + 10) {
      fullYear = 2000 + yy; // Recent past or near future
    } else {
      fullYear = 1900 + yy; // Distant past
    }

    // Validate month and day
    const monthNum = parseInt(mm);
    const dayNum = parseInt(dd);
    
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      console.warn(`Invalid date components: ${dd}/${mm}/${fullYear}`);
      return "";
    }

    return `${fullYear}-${mm}-${dd}`;
  }

  /**
   * Calculate MRZ check digit according to ICAO 9303
   */
  private static calculateCheckDigit(data: string): string {
    const weights = [7, 3, 1];
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      let value: number;

      if (char >= '0' && char <= '9') {
        value = parseInt(char);
      } else if (char >= 'A' && char <= 'Z') {
        value = char.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else if (char === '<') {
        value = 0;
      } else {
        console.warn(`Unexpected character in check digit calculation: "${char}"`);
        value = 0;
      }

      sum += value * weights[i % 3];
    }

    return (sum % 10).toString();
  }

  /**
   * Comprehensive validation of all MRZ checksums
   */
  private static validateAllChecksums(
    passportNumber: string, passportCheck: string,
    dobString: string, dobCheck: string,
    expiryString: string, expiryCheck: string,
    personalField: string, personalCheck: string,
    line2: string, compositeCheck: string
  ) {
    const results = {
      passportNumberValid: false,
      dateOfBirthValid: false,
      expirationDateValid: false,
      personalNumberValid: false,
      compositeValid: false,
      formatValid: true,
    };

    try {
      // Validate passport number check digit
      const passportData = passportNumber.padEnd(9, '<');
      results.passportNumberValid = this.calculateCheckDigit(passportData) === passportCheck;

      // Validate date of birth check digit
      results.dateOfBirthValid = this.calculateCheckDigit(dobString) === dobCheck;

      // Validate expiry date check digit
      results.expirationDateValid = this.calculateCheckDigit(expiryString) === expiryCheck;

      // Validate personal number check digit (if present)
      if (personalField.replace(/</g, '').length > 0) {
        const personalData = personalField.padEnd(14, '<');
        results.personalNumberValid = this.calculateCheckDigit(personalData) === personalCheck;
      } else {
        results.personalNumberValid = personalCheck === '<';
      }

      // Validate composite check digit
      const compositeData = line2.substring(0, 10) + line2.substring(13, 20) + line2.substring(21, 43);
      results.compositeValid = this.calculateCheckDigit(compositeData) === compositeCheck;

      console.log("🔍 MRZ validation results:", results);
      
    } catch (error) {
      console.error("❌ MRZ validation error:", error);
      results.formatValid = false;
    }

    return results;
  }

  /**
   * Validate MRZ format before parsing (basic format check)
   */
  static validateMRZFormat(mrzLines: string[]): boolean {
    if (mrzLines.length !== 2) return false;
    
    const [line1, line2] = mrzLines;
    
    // Basic format validation
    if (line1.length !== 44 || line2.length !== 44) return false;
    if (!line1.startsWith('P<')) return false;
    if (!/^[A-Z0-9<]+$/.test(line1) || !/^[A-Z0-9<]+$/.test(line2)) return false;
    
    return true;
  }
}