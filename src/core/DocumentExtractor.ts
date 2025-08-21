import { ExtractedIdResult, CaptureOptions, VerifiedDocType, QualityMetrics, DocumentTemplate, OcrField } from '../types/extraction';

// Conditional imports for native dependencies
let DocumentScanner: any = null;
let MLKitTextRecognition: any = null;
let VisionCamera: any = null;

try {
  DocumentScanner = require('react-native-document-scanner-plugin');
} catch (error) {
  console.warn('react-native-document-scanner-plugin not available');
}

try {
  const mlKit = require('react-native-google-ml-kit');
  MLKitTextRecognition = mlKit.MlKitTextRecognition;
} catch (error) {
  console.warn('react-native-google-ml-kit not available');
}

try {
  VisionCamera = require('react-native-vision-camera');
} catch (error) {
  console.warn('react-native-vision-camera not available');
}

export class DocumentExtractor {
  private static templates: Map<string, DocumentTemplate> = new Map();

  /**
   * Main API function: Capture and extract document data
   * @param options Capture configuration
   * @returns Extracted document result
   */
  static async captureAndExtract(options: CaptureOptions = {}): Promise<ExtractedIdResult> {
    console.log('Starting document capture and extraction');

    try {
      // Step 1: Capture with quality checks
      const captureResult = await this.captureWithQualityControl(options);
      
      // Step 2: Document type routing
      const docType = await this.detectDocumentType(captureResult.processedImageUri, options.docHint);
      
      // Step 3: Route to appropriate extraction pipeline
      if (this.hasMRZ(docType)) {
        return await this.extractMRZDocument(captureResult, docType);
      } else {
        return await this.extractOCRDocument(captureResult, docType);
      }
    } catch (error) {
      console.error('Document extraction failed:', error);
      throw error;
    }
  }

  /**
   * Step 1: Capture with document scanner and quality control
   */
  private static async captureWithQualityControl(options: CaptureOptions) {
    if (!DocumentScanner) {
      throw new Error('Document scanner not available. Install react-native-document-scanner-plugin');
    }

    try {
      // Use document scanner for auto-crop and perspective correction
      const result = await DocumentScanner.scanDocument({
        croppedImageQuality: 100,
        maxNumDocuments: 1,
        letUserAdjustCrop: true,
        responseType: 'imageFilePath'
      });

      if (!result.scannedImages || result.scannedImages.length === 0) {
        throw new Error('No document captured');
      }

      const originalImageUri = result.scannedImages[0];
      const processedImageUri = originalImageUri; // Scanner already processes

      // Quality assessment
      const quality = await this.assessImageQuality(processedImageUri);
      
      if (options.enableQualityCheck !== false && !quality.isAcceptable) {
        throw new Error(`Image quality too low: blur=${quality.blurScore.toFixed(2)}, glare=${quality.glareDetected}`);
      }

      return {
        originalImageUri,
        processedImageUri,
        quality
      };
    } catch (error) {
      console.error('Document capture failed:', error);
      throw error;
    }
  }

  /**
   * Step 2: Detect document type
   */
  private static async detectDocumentType(imageUri: string, hint?: VerifiedDocType): Promise<VerifiedDocType> {
    if (hint) {
      console.log(`Using document type hint: ${hint}`);
      return hint;
    }

    try {
      // First check for MRZ presence
      const hasMRZ = await this.detectMRZPresence(imageUri);
      
      if (hasMRZ) {
        // Could be passport or residence permit - for now assume passport
        return 'passport';
      } else {
        // Non-MRZ Lebanese documents
        // Could implement template matching here for more precision
        return 'civil_id'; // Default assumption
      }
    } catch (error) {
      console.warn('Document type detection failed, using default:', error);
      return 'civil_id';
    }
  }

  /**
   * Check if document type has MRZ
   */
  private static hasMRZ(docType: VerifiedDocType): boolean {
    return docType === 'passport' || docType === 'residence_permit';
  }

  /**
   * Extract MRZ-based documents (passport, residence permit)
   */
  private static async extractMRZDocument(captureResult: any, docType: VerifiedDocType): Promise<ExtractedIdResult> {
    console.log(`Extracting MRZ document: ${docType}`);

    try {
      // Import MRZ scanner with error handling
      let MRZScanner: any = null;
      try {
        const mrzModule = require('../utils/mrzScanner');
        MRZScanner = mrzModule.MRZScanner;
      } catch (error) {
        console.warn('MRZ scanner not available:', error);
        throw new Error('MRZ scanner not available. Install required dependencies.');
      }
      
      // Extract MRZ data
      const mrzData = await MRZScanner.extractMRZFromImage(captureResult.processedImageUri);
      
      if (!mrzData) {
        throw new Error('No valid MRZ found in document');
      }

      // Convert to our standard format
      const fields = {
        documentNumber: this.createOcrField(mrzData.passportNumber, mrzData.valid ? 0.95 : 0.7, 'mrz'),
        surname: this.createOcrField(mrzData.lastName, mrzData.valid ? 0.95 : 0.7, 'mrz'),
        givenNames: this.createOcrField(mrzData.firstName, mrzData.valid ? 0.95 : 0.7, 'mrz'),
        dateOfBirth: this.createOcrField(mrzData.dateOfBirth, mrzData.valid ? 0.95 : 0.7, 'mrz'),
        sex: this.createOcrField(mrzData.sex, mrzData.valid ? 0.95 : 0.7, 'mrz'),
        nationality: this.createOcrField(mrzData.nationality, mrzData.valid ? 0.95 : 0.7, 'mrz'),
        dateOfExpiry: this.createOcrField(mrzData.expirationDate, mrzData.valid ? 0.95 : 0.7, 'mrz'),
      };

      return {
        docType,
        originalImageUri: captureResult.originalImageUri,
        processedImageUri: captureResult.processedImageUri,
        fields,
        mrz: {
          raw: `${mrzData.documentType}<${mrzData.issuingCountry}<${mrzData.lastName}<<${mrzData.firstName}`,
          type: 'TD3', // Passport format
          checks: {
            documentNumber: mrzData.valid,
            dob: mrzData.valid,
            expiry: mrzData.valid,
            composite: mrzData.valid
          }
        },
        quality: captureResult.quality
      };
    } catch (error) {
      console.error('MRZ extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract OCR-based documents (civil ID, army card)
   */
  private static async extractOCRDocument(captureResult: any, docType: VerifiedDocType): Promise<ExtractedIdResult> {
    console.log(`Extracting OCR document: ${docType}`);

    try {
      // Load document template
      const template = await this.loadTemplate(docType);
      
      // Extract text using ML Kit
      const fullText = await this.extractTextWithMLKit(captureResult.processedImageUri);
      
      // Extract field-specific text using template ROIs
      const fieldTexts = await this.extractFieldTexts(captureResult.processedImageUri, template);
      
      // Process and validate fields
      const fields = await this.processExtractedFields(fieldTexts, docType);

      return {
        docType,
        originalImageUri: captureResult.originalImageUri,
        processedImageUri: captureResult.processedImageUri,
        fields,
        quality: captureResult.quality
      };
    } catch (error) {
      console.error('OCR extraction failed:', error);
      throw error;
    }
  }

  /**
   * Extract text using Google ML Kit
   */
  private static async extractTextWithMLKit(imageUri: string): Promise<string> {
    if (!MLKitTextRecognition) {
      throw new Error('ML Kit Text Recognition not available');
    }

    try {
      const result = await MLKitTextRecognition.recognize(imageUri);
      return result.text || '';
    } catch (error) {
      console.error('ML Kit OCR failed:', error);
      throw error;
    }
  }

  /**
   * Extract text from specific field regions using template
   */
  private static async extractFieldTexts(imageUri: string, template: DocumentTemplate): Promise<Record<string, string>> {
    // This would involve cropping ROIs and running OCR on each
    // For now, return empty object - implementation would require image manipulation
    console.log(`Extracting field texts using template: ${template.docType}`);
    return {};
  }

  /**
   * Process and validate extracted field texts
   */
  private static async processExtractedFields(fieldTexts: Record<string, string>, docType: VerifiedDocType): Promise<Record<string, OcrField>> {
    const fields: Record<string, OcrField> = {};
    
    // Apply document-specific processing rules
    for (const [fieldName, text] of Object.entries(fieldTexts)) {
      const processedField = this.processField(fieldName, text, docType);
      if (processedField.value) {
        fields[fieldName] = processedField;
      }
    }

    return fields;
  }

  /**
   * Process individual field with validation and normalization
   */
  private static processField(fieldName: string, text: string, docType: VerifiedDocType): OcrField {
    let processedValue = text.trim();
    let confidence = 0.8; // Default confidence

    // Apply field-specific processing
    switch (fieldName) {
      case 'dateOfBirth':
      case 'dateOfIssue':
      case 'dateOfExpiry':
        processedValue = this.normalizeDate(text);
        break;
      case 'documentNumber':
        processedValue = this.normalizeDocumentNumber(text, docType);
        break;
      case 'fullNameArabic':
        processedValue = this.normalizeArabicName(text);
        break;
      case 'fullNameLatin':
        processedValue = this.normalizeLatinName(text);
        break;
    }

    return this.createOcrField(processedValue, confidence, 'ocr');
  }

  /**
   * Utility methods
   */
  private static createOcrField(value: string | null, confidence: number, source: 'mrz' | 'ocr' | 'derived'): OcrField {
    return { value, confidence, source };
  }

  private static async loadTemplate(docType: VerifiedDocType): Promise<DocumentTemplate> {
    const templateKey = docType;
    
    if (this.templates.has(templateKey)) {
      return this.templates.get(templateKey)!;
    }

    // Load template from JSON files
    try {
      let templateData;
      switch (docType) {
        case 'civil_id':
          templateData = require('../templates/civil_id_front.json');
          break;
        case 'army_card':
          templateData = require('../templates/army_card.json');
          break;
        default:
          throw new Error(`No template available for document type: ${docType}`);
      }
      
      this.templates.set(templateKey, templateData);
      return templateData;
    } catch (error) {
      console.error(`Failed to load template for ${docType}:`, error);
      throw error;
    }
  }

  private static async detectMRZPresence(imageUri: string): Promise<boolean> {
    try {
      const text = await this.extractTextWithMLKit(imageUri);
      
      // Look for MRZ pattern
      const lines = text.split('\n');
      const mrzPattern = /^P<[A-Z]{3}/; // Passport MRZ first line pattern
      
      return lines.some(line => mrzPattern.test(line.trim()));
    } catch (error) {
      console.warn('MRZ detection failed:', error);
      return false;
    }
  }

  private static async assessImageQuality(imageUri: string): Promise<QualityMetrics> {
    // Simplified quality assessment
    // In production, you'd analyze actual image properties
    return {
      blurScore: 0.8, // Mock value
      brightness: 0.7, // Mock value
      glareDetected: false,
      edgesDetected: true,
      isAcceptable: true
    };
  }

  // Field normalization methods
  private static normalizeDate(dateText: string): string {
    // Extract date patterns and normalize to ISO format
    const datePatterns = [
      /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
      /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/
    ];

    for (const pattern of datePatterns) {
      const match = dateText.match(pattern);
      if (match) {
        const [, part1, part2, part3] = match;
        
        // Assume DD/MM/YYYY format for Lebanese documents
        if (part3.length === 4) {
          return `${part3}-${part2.padStart(2, '0')}-${part1.padStart(2, '0')}`;
        }
      }
    }

    return dateText;
  }

  private static normalizeDocumentNumber(text: string, docType: VerifiedDocType): string {
    // Remove non-alphanumeric characters and normalize
    return text.replace(/[^\w]/g, '').toUpperCase();
  }

  private static normalizeArabicName(text: string): string {
    // Clean Arabic text
    return text.trim();
  }

  private static normalizeLatinName(text: string): string {
    // Clean Latin text and capitalize properly
    return text.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}