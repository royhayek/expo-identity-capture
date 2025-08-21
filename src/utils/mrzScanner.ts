import { useFrameProcessor } from "react-native-vision-camera";

// MRZ Data interface
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
}

// MRZ character mappings for error correction
const MRZ_CORRECTIONS: { [key: string]: string } = {
  O: "0", // Letter O to number 0
  I: "1", // Letter I to number 1
  S: "5", // Letter S to number 5
  B: "8", // Letter B to number 8
  G: "6", // Letter G to number 6
};

export class MRZScanner {
  /**
   * Create MRZ frame processor for Vision Camera
   * This is a placeholder for real-time scanning - actual implementation would need OCR in frame processor
   * @param onMRZDetected Callback when MRZ is successfully detected
   * @returns Frame processor for Vision Camera
   */
  static createMRZFrameProcessor(onMRZDetected: (mrz: PassportMRZData) => void) {
    return useFrameProcessor(
      (_frame) => {
        "worklet";

        try {
          // Note: Real-time MRZ scanning in frame processor would require:
          // 1. OCR processing in worklet (not currently available with Tesseract)
          // 2. Or a native vision framework integration
          // For now, this is a placeholder that would need additional native implementation
          
          console.warn("Real-time MRZ scanning requires native OCR integration in frame processor");
        } catch (error) {
          console.warn("MRZ scanning error:", error);
        }
      },
      [onMRZDetected]
    );
  }

  /**
   * Parse MRZ lines from a passport using custom React Native-compatible parser
   * @param mrzLines Array of MRZ lines or single string with line breaks
   * @returns Parsed passport MRZ data
   */
  static parseMRZ(mrzLines: string[] | string): PassportMRZData {
    try {
      let lines: string[];
      
      if (typeof mrzLines === "string") {
        lines = mrzLines.split("\n").filter((line) => line.trim().length > 0);
      } else {
        lines = mrzLines.filter((line) => line.trim().length > 0);
      }

      if (lines.length !== 2) {
        throw new Error("MRZ must contain exactly 2 lines");
      }

      // Clean and correct MRZ lines
      const cleanedLines = lines.map(line => this.correctMRZText(line.trim()));
      
      console.log("Parsing MRZ lines:", cleanedLines);
      
      // Parse using our custom parser
      const result = this.parsePassportMRZLines(cleanedLines[0], cleanedLines[1]);
      
      console.log("MRZ parse result:", result);
      
      return result;
    } catch (error) {
      console.error("MRZ parsing failed:", error);
      throw new Error(`MRZ parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse passport MRZ lines using ICAO 9303 standard
   * @param line1 First MRZ line (P<ISSCOUNTRY<LASTNAME<<FIRSTNAME<...)
   * @param line2 Second MRZ line (PASSPORTNUMBER<CCOUNTRYYYMMDDXSEXYYMMDD...)
   * @returns Parsed passport data
   */
  private static parsePassportMRZLines(line1: string, line2: string): PassportMRZData {
    // Validate line lengths
    if (line1.length !== 44 || line2.length !== 44) {
      throw new Error(`Invalid MRZ line length. Expected 44 characters each, got ${line1.length} and ${line2.length}`);
    }

    // Parse Line 1: P<ISSCOUNTRY<LASTNAME<<FIRSTNAME<<<<<<<<<<<<<<<<<<<<<<
    const documentType = line1.substring(0, 1);
    const issuingCountry = line1.substring(2, 5);
    
    // Extract names (remove < padding)
    const nameSection = line1.substring(5, 44);
    const nameParts = nameSection.split('<<');
    const lastName = (nameParts[0] || '').replace(/</g, ' ').trim();
    const firstName = (nameParts[1] || '').replace(/</g, ' ').trim();

    // Parse Line 2: PASSPORTNUMBER<CCOUNTRYYYMMDDXSEXYYMMDDXPERSONALNUMBERXX<CCCCCCCCX
    const passportNumber = this.extractField(line2.substring(0, 9));
    const passportNumberCheck = line2.substring(9, 10);
    const nationality = line2.substring(10, 13);
    
    // Date parsing (YYMMDD)
    const dobString = line2.substring(13, 19);
    const dobCheck = line2.substring(19, 20);
    const sex = line2.substring(20, 21) === 'M' ? 'M' : line2.substring(20, 21) === 'F' ? 'F' : 'X';
    
    const expString = line2.substring(21, 27);
    const expCheck = line2.substring(27, 28);
    
    const personalNumber = this.extractField(line2.substring(28, 42));
    const personalNumberCheck = line2.substring(42, 43);
    const compositeCheck = line2.substring(43, 44);

    // Format dates
    const dateOfBirth = this.formatMRZDate(dobString);
    const expirationDate = this.formatMRZDate(expString);

    // Validate check digits
    const checkDigits = {
      passportNumber: passportNumberCheck,
      dateOfBirth: dobCheck,
      expirationDate: expCheck,
      personalNumber: personalNumberCheck,
      composite: compositeCheck,
    };

    // Calculate validity
    const valid = this.validateMRZChecksums(
      passportNumber,
      passportNumberCheck,
      dobString,
      dobCheck,
      expString,
      expCheck,
      personalNumber,
      personalNumberCheck,
      line2.substring(0, 10) + line2.substring(13, 20) + line2.substring(21, 43),
      compositeCheck
    );

    return {
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
      valid,
    };
  }

  /**
   * Extract field by removing < characters
   */
  private static extractField(field: string): string {
    return field.replace(/</g, '').trim();
  }

  /**
   * Format date from MRZ format (YYMMDD) to ISO format (YYYY-MM-DD)
   */
  private static formatMRZDate(dateString: string): string {
    if (!dateString || dateString.length !== 6) return "";

    const yy = parseInt(dateString.substring(0, 2));
    const mm = dateString.substring(2, 4);
    const dd = dateString.substring(4, 6);

    // Assume years 00-30 are 2000s, 31-99 are 1900s
    const year = yy <= 30 ? 2000 + yy : 1900 + yy;

    return `${year}-${mm}-${dd}`;
  }

  /**
   * Calculate check digit using ICAO 9303 algorithm
   */
  private static calculateCheckDigit(data: string): string {
    const weights = [7, 3, 1];
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
      let char = data[i];
      let value: number;

      if (char >= '0' && char <= '9') {
        value = parseInt(char);
      } else if (char >= 'A' && char <= 'Z') {
        value = char.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else if (char === '<') {
        value = 0;
      } else {
        value = 0; // Invalid character
      }

      sum += value * weights[i % 3];
    }

    return (sum % 10).toString();
  }

  /**
   * Validate all MRZ checksums
   */
  private static validateMRZChecksums(
    passportNumber: string,
    passportCheck: string,
    dob: string,
    dobCheck: string,
    exp: string,
    expCheck: string,
    personalNumber: string,
    personalCheck: string,
    composite: string,
    compositeCheck: string
  ): boolean {
    try {
      const passportValid = this.calculateCheckDigit(passportNumber.padEnd(9, '<')) === passportCheck;
      const dobValid = this.calculateCheckDigit(dob) === dobCheck;
      const expValid = this.calculateCheckDigit(exp) === expCheck;
      const personalValid = !personalNumber || this.calculateCheckDigit(personalNumber.padEnd(14, '<')) === personalCheck;
      const compositeValid = this.calculateCheckDigit(composite) === compositeCheck;

      console.log('MRZ Validation:', {
        passportValid,
        dobValid,
        expValid,
        personalValid,
        compositeValid
      });

      return passportValid && dobValid && expValid && personalValid && compositeValid;
    } catch (error) {
      console.error('MRZ validation error:', error);
      return false;
    }
  }

  /**
   * Detect and extract MRZ from image text (OCR result)
   * @param text OCR extracted text
   * @returns MRZ lines if found, null otherwise
   */
  static detectMRZFromText(text: string): string[] | null {
    const lines = text.split("\n").map((line) => line.trim());
    const potentialMRZLines: string[] = [];

    for (const line of lines) {
      // Look for lines that start with 'P<' (passport) and are around 44 characters
      if (line.startsWith("P<") && line.length >= 40) {
        potentialMRZLines.push(line);
      }
      // Look for second line pattern (starts with letters/numbers, contains check digits)
      else if (line.length >= 40 && /^[A-Z0-9]/.test(line) && potentialMRZLines.length === 1) {
        potentialMRZLines.push(line);
        break;
      }
    }

    return potentialMRZLines.length === 2 ? potentialMRZLines : null;
  }

  /**
   * Correct common OCR errors in MRZ text
   * @param mrzText Raw MRZ text from OCR
   * @returns Corrected MRZ text
   */
  static correctMRZText(mrzText: string): string {
    let corrected = mrzText.toUpperCase();

    // Apply character corrections
    for (const [wrong, correct] of Object.entries(MRZ_CORRECTIONS)) {
      corrected = corrected.replace(new RegExp(wrong, "g"), correct);
    }

    // Ensure proper length (44 characters for passport MRZ)
    if (corrected.length < 44) {
      corrected = corrected.padEnd(44, "<");
    } else if (corrected.length > 44) {
      corrected = corrected.substring(0, 44);
    }

    return corrected;
  }

  /**
   * Validate MRZ format before parsing
   * @param mrzLines MRZ lines to validate
   * @returns True if format appears valid
   */
  static validateMRZFormat(mrzLines: string[]): boolean {
    if (mrzLines.length !== 2) {
      return false;
    }

    const [line1, line2] = mrzLines;

    // Line 1 should start with 'P<' and be 44 characters
    if (!line1.startsWith("P<") || line1.length !== 44) {
      return false;
    }

    // Line 2 should be 44 characters and contain alphanumeric characters
    if (line2.length !== 44 || !/^[A-Z0-9<]+$/.test(line2)) {
      return false;
    }

    return true;
  }

  /**
   * Extract MRZ from image using OCR and parse it
   * @param imageUri URI of the passport image
   * @returns Parsed MRZ data or null if not found
   */
  static async extractMRZFromImage(imageUri: string): Promise<PassportMRZData | null> {
    try {
      // Use Google ML Kit for OCR
      let MLKitTextRecognition: any = null;
      try {
        const mlKit = require('react-native-google-ml-kit');
        MLKitTextRecognition = mlKit.MlKitTextRecognition;
      } catch (error) {
        console.warn('ML Kit not available, falling back to OCRProcessor');
        
        // Fallback to OCRProcessor if available
        try {
          const { OCRProcessor } = require('./ocrProcessor');
          const ocrResult = await OCRProcessor.extractText(imageUri, {
            language: 'en', // MRZ is typically in Latin characters
            enableOCR: true
          });
          
          // Detect MRZ lines in the OCR text
          const mrzLines = this.detectMRZFromText(ocrResult.text);
          
          if (!mrzLines) {
            console.log("No MRZ detected in image");
            return null;
          }

          // Validate MRZ format
          if (!this.validateMRZFormat(mrzLines)) {
            console.warn("Invalid MRZ format detected");
            return null;
          }

          // Parse MRZ using our custom parser
          return this.parseMRZ(mrzLines);
        } catch (fallbackError) {
          console.error('OCR fallback also failed:', fallbackError);
          throw new Error('No OCR engine available for MRZ extraction');
        }
      }

      // Extract text using ML Kit
      const result = await MLKitTextRecognition.recognize(imageUri);
      const text = result.text || '';

      // Detect MRZ lines in the OCR text
      const mrzLines = this.detectMRZFromText(text);
      
      if (!mrzLines) {
        console.log("No MRZ detected in image");
        return null;
      }

      // Validate MRZ format
      if (!this.validateMRZFormat(mrzLines)) {
        console.warn("Invalid MRZ format detected");
        return null;
      }

      // Parse MRZ using our custom parser
      return this.parseMRZ(mrzLines);
    } catch (error) {
      console.error("MRZ extraction from image failed:", error);
      return null;
    }
  }
}