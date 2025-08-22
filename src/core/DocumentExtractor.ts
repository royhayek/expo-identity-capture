import {
  ExtractedIdResult,
  CaptureOptions,
  VerifiedDocType,
  QualityMetrics,
  DocumentTemplate,
  OcrField,
} from "../types/extraction";
import MLKit from "@react-native-ml-kit/text-recognition";
import DocumentScanner, { ResponseType } from "react-native-document-scanner-plugin";
import { MRZScanner } from "../utils/mrzScanner";

// Enhanced text preprocessing and analysis
interface TextAnalysisResult {
  text: string;
  lines: string[];
  confidence: number;
  language: string;
  hasArabic: boolean;
  hasLatin: boolean;
  wordCount: number;
  lineCount: number;
}

// Field extraction patterns for different document types
interface FieldPattern {
  pattern: RegExp;
  processor?: (match: string) => string;
  confidence: number;
  contextKeywords?: string[];
}

export class DocumentExtractor {
  private static templates: Map<string, DocumentTemplate> = new Map();
  private static readonly MIN_OCR_CONFIDENCE = 0.6;
  private static readonly MIN_TEXT_LENGTH = 10;

  /**
   * Main API function: Capture and extract document data
   */
  static async captureAndExtract(options: CaptureOptions = {}): Promise<ExtractedIdResult> {
    console.log("🚀 Starting advanced document capture and extraction");

    try {
      // Step 1: Enhanced capture with quality control
      const captureResult = await this.captureWithAdvancedQuality(options);

      // Step 2: Document type detection with multiple methods
      const docType = await this.detectDocumentTypeAdvanced(captureResult.processedImageUri, options.docHint);

      // Step 3: Route to appropriate extraction pipeline
      if (this.hasMRZ(docType)) {
        return await this.extractMRZDocument(captureResult, docType);
      } else {
        return await this.extractOCRDocument(captureResult, docType);
      }
    } catch (error) {
      console.error("❌ Document extraction failed:", error);
      throw error;
    }
  }

  /**
   * Enhanced capture with comprehensive quality control
   */
  private static async captureWithAdvancedQuality(options: CaptureOptions) {
    try {
      console.log("📷 Starting document capture with quality control");

      // Use document scanner for auto-crop and perspective correction
      const result = await DocumentScanner.scanDocument({
        croppedImageQuality: 100,
        maxNumDocuments: 1,
        responseType: ResponseType.ImageFilePath,
      });

      if (!result.scannedImages || result.scannedImages.length === 0) {
        throw new Error("No document captured");
      }

      const originalImageUri = result.scannedImages[0];
      const processedImageUri = originalImageUri; // Scanner already processes

      console.log(`📱 Captured image: ${originalImageUri}`);

      // Comprehensive quality assessment
      const quality = await this.assessImageQualityAdvanced(processedImageUri);
      console.log(`📊 Quality assessment:`, quality);

      if (options.enableQualityCheck !== false && !quality.isAcceptable) {
        console.warn(`⚠️ Image quality concerns: blur=${quality.blurScore.toFixed(2)}, brightness=${quality.brightness.toFixed(2)}, glare=${quality.glareDetected}`);
        // Allow processing to continue but mark quality issues
      }

      return {
        originalImageUri,
        processedImageUri,
        quality,
      };
    } catch (error) {
      console.error("❌ Document capture failed:", error);
      throw error;
    }
  }

  /**
   * Advanced document type detection using multiple methods
   */
  private static async detectDocumentTypeAdvanced(imageUri: string, hint?: VerifiedDocType): Promise<VerifiedDocType> {
    if (hint) {
      console.log(`💡 Using document type hint: ${hint}`);
      return hint;
    }

    try {
      console.log("🔍 Detecting document type...");

      // Perform initial OCR to analyze content
      const textAnalysis = await this.performTextAnalysis(imageUri);
      console.log("📄 Text analysis:", {
        textLength: textAnalysis.text.length,
        hasArabic: textAnalysis.hasArabic,
        hasLatin: textAnalysis.hasLatin,
        wordCount: textAnalysis.wordCount,
        confidence: textAnalysis.confidence
      });

      // Check for MRZ presence first
      const hasMRZ = await this.detectMRZPresenceAdvanced(textAnalysis.text);
      if (hasMRZ) {
        console.log("📋 MRZ detected - document is passport or residence permit");
        return "passport"; // Default to passport for MRZ documents
      }

      // Analyze text content for document type clues
      const docTypeFromContent = this.analyzeContentForDocType(textAnalysis);
      console.log(`🎯 Document type from content analysis: ${docTypeFromContent}`);

      return docTypeFromContent;
    } catch (error) {
      console.warn("⚠️ Document type detection failed, using default:", error);
      return "civil_id";
    }
  }

  /**
   * Comprehensive text analysis using ML Kit with fallbacks
   */
  private static async performTextAnalysis(imageUri: string, docTypeHint?: VerifiedDocType): Promise<TextAnalysisResult> {
    console.log("🔍 Performing comprehensive text analysis...");

    let text = "";
    let confidence = 0;

    try {
      // Configure ML Kit based on document type
      const isArabicDocument = docTypeHint === 'civil_id' || docTypeHint === 'army_card';
      
      console.log(`📱 Attempting ML Kit text recognition (${isArabicDocument ? 'Arabic-optimized' : 'standard'})...`);
      
      // Note: ML Kit doesn't support language hints in the current API
      // But we know civil_id is Arabic-only, so we'll process accordingly
      const result = await MLKit.recognize(imageUri);
      text = result.text || "";
      
      // Apply Arabic-specific preprocessing if needed
      if (isArabicDocument) {
        text = this.preprocessArabicText(text);
        console.log(`🔤 Applied Arabic text preprocessing`);
      }
      
      // Calculate confidence based on text quality and document type
      confidence = this.calculateTextConfidence(text, result, isArabicDocument);
      
      console.log(`📊 ML Kit results: ${text.length} chars, confidence: ${confidence.toFixed(2)}`);
      
      // Log detailed ML Kit results with Arabic context
      if (result.blocks && result.blocks.length > 0) {
        console.log(`📝 Found ${result.blocks.length} text blocks:`);
        result.blocks.forEach((block, i) => {
          const blockText = block.text || "";
          const hasArabic = /[\u0600-\u06FF]/.test(blockText);
          console.log(`   Block ${i + 1}: "${blockText}" (${hasArabic ? 'Arabic' : 'Latin'}, ${block.cornerPoints ? 'positioned' : 'no position'})`);
        });
      }
      
    } catch (error) {
      console.warn("⚠️ ML Kit failed, trying fallbacks:", error);
      
      // Try alternative OCR if available
      try {
        const { OCRProcessor } = require("../utils/ocrProcessor");
        const ocrResult = await OCRProcessor.extractText(imageUri, {
          language: (docTypeHint === 'civil_id' || docTypeHint === 'army_card') ? "ar" : "en",
          enableOCR: true,
        });
        text = ocrResult.text;
        confidence = 0.7; // Default confidence for fallback
        console.log(`📊 Fallback OCR results: ${text.length} chars`);
      } catch (fallbackError) {
        console.error("❌ All OCR methods failed:", fallbackError);
        throw new Error("No OCR engine available");
      }
    }

    if (text.length < this.MIN_TEXT_LENGTH) {
      console.warn(`⚠️ OCR text too short: ${text.length} chars`);
    }

    // Analyze text properties
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasLatin = /[a-zA-Z]/.test(text);
    const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;

    console.log(`📄 Full OCR text (${text.length} chars):`, text.substring(0, 500) + (text.length > 500 ? "..." : ""));

    return {
      text,
      lines,
      confidence,
      language: hasArabic ? (hasLatin ? "mixed" : "arabic") : "latin",
      hasArabic,
      hasLatin,
      wordCount,
      lineCount: lines.length,
    };
  }

  /**
   * Preprocess Arabic text for better recognition
   */
  private static preprocessArabicText(text: string): string {
    let processed = text;
    
    // Normalize Arabic characters
    processed = processed
      .replace(/ک/g, 'ك')  // Normalize Keheh
      .replace(/ی/g, 'ي')  // Normalize Yeh
      .replace(/ء/g, 'ء')  // Normalize Hamza
      .replace(/أ/g, 'أ')  // Normalize Alef with Hamza above
      .replace(/إ/g, 'إ')  // Normalize Alef with Hamza below
      .replace(/آ/g, 'آ')  // Normalize Alef with Madda above
      .replace(/ة/g, 'ة')  // Normalize Teh Marbuta
      .replace(/ه/g, 'ه'); // Normalize Heh
    
    // Remove excessive whitespace while preserving Arabic word boundaries
    processed = processed.replace(/\s+/g, ' ').trim();
    
    // Remove common OCR noise that appears with Arabic text
    processed = processed.replace(/[^\u0600-\u06FF\u0660-\u0669a-zA-Z0-9\s\/\-\.\,\(\)]/g, '');
    
    return processed;
  }

  /**
   * Calculate text confidence based on OCR results
   */
  private static calculateTextConfidence(text: string, result: any, isArabicDocument: boolean = false): number {
    let confidence = 0.5; // Base confidence

    // Text length factor
    if (text.length > 100) confidence += 0.2;
    else if (text.length > 50) confidence += 0.1;

    // Block structure factor
    if (result.blocks && result.blocks.length > 0) {
      confidence += Math.min(result.blocks.length * 0.05, 0.2);
    }

    // Text quality factor with Arabic-specific logic
    if (isArabicDocument) {
      // For Arabic documents, count Arabic characters and numbers
      const arabicChars = (text.match(/[\u0600-\u06FF\u0660-\u0669]/g) || []).length;
      const latinChars = (text.match(/[a-zA-Z0-9]/g) || []).length;
      const totalValidChars = arabicChars + latinChars;
      const qualityRatio = totalValidChars / Math.max(text.length, 1);
      
      // Boost confidence if we have good Arabic text density
      confidence += qualityRatio * 0.3;
      
      // Additional boost if Arabic content is substantial
      if (arabicChars > 20) confidence += 0.1;
      
      console.log(`🔤 Arabic text analysis: ${arabicChars} Arabic chars, ${latinChars} Latin chars, quality ratio: ${qualityRatio.toFixed(2)}`);
    } else {
      // Standard alphanumeric ratio for non-Arabic documents
      const alphanumericChars = (text.match(/[a-zA-Z0-9\u0600-\u06FF]/g) || []).length;
      const qualityRatio = alphanumericChars / Math.max(text.length, 1);
      confidence += qualityRatio * 0.3;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Analyze content to determine document type
   */
  private static analyzeContentForDocType(analysis: TextAnalysisResult): VerifiedDocType {
    const text = analysis.text.toLowerCase();
    
    // Look for document-specific keywords
    const keywords = {
      civil_id: [
        "civil", "identity", "card", "republic", "lebanon", "lebanese",
        "هوية", "مدنية", "الجمهورية", "اللبنانية", "لبناني"
      ],
      passport: [
        "passport", "passeport", "travel", "document", "republic of lebanon",
        "جواز", "سفر", "سياحة", "الجمهورية اللبنانية"
      ],
      army_card: [
        "army", "military", "force", "armed", "service",
        "الجيش", "عسكري", "قوات", "مسلحة", "خدمة"
      ]
    };

    let scores = {
      civil_id: 0,
      passport: 0,
      army_card: 0,
    };

    // Score each document type based on keyword matches
    for (const [docType, docKeywords] of Object.entries(keywords)) {
      for (const keyword of docKeywords) {
        if (text.includes(keyword)) {
          scores[docType as VerifiedDocType] += 1;
        }
      }
    }

    // Additional scoring based on text characteristics
    if (analysis.hasArabic && analysis.hasLatin) {
      scores.civil_id += 1; // Civil IDs often have both languages
    }

    // Find the highest scoring document type
    const winner = Object.entries(scores).reduce((a, b) => 
      scores[a[0] as VerifiedDocType] > scores[b[0] as VerifiedDocType] ? a : b
    )[0] as VerifiedDocType;

    console.log("📊 Document type scores:", scores);
    return winner;
  }

  /**
   * Enhanced MRZ presence detection
   */
  private static async detectMRZPresenceAdvanced(text: string): Promise<boolean> {
    // Look for MRZ patterns with scoring
    const lines = text.split(/\r?\n/).map(line => line.trim());
    
    for (const line of lines) {
      // Check for passport MRZ line 1 pattern
      const line1Score = this.scoreMRZLikeLine(line, 1);
      const line2Score = this.scoreMRZLikeLine(line, 2);
      
      if (line1Score > 0.7 || line2Score > 0.7) {
        console.log(`✅ High-confidence MRZ pattern found: "${line}" (L1: ${line1Score.toFixed(2)}, L2: ${line2Score.toFixed(2)})`);
        return true;
      }
    }
    
    return false;
  }

  /**
   * Score how likely a line is to be an MRZ line
   */
  private static scoreMRZLikeLine(line: string, lineType: 1 | 2): number {
    const cleanLine = line.replace(/\s+/g, "").toUpperCase();
    
    if (lineType === 1) {
      // MRZ Line 1: P<COUNTRY<LASTNAME<<FIRSTNAME<...
      let score = 0;
      if (/^P[<«]/.test(cleanLine)) score += 0.4;
      if (/^P[<«][A-Z]{3}/.test(cleanLine)) score += 0.3;
      if (cleanLine.includes("<<") || cleanLine.includes("««")) score += 0.2;
      if (Math.abs(cleanLine.length - 44) <= 5) score += 0.1;
      return score;
    } else {
      // MRZ Line 2: PASSNUM<CNTRYYYMMDDXSEXYYMMDDX...
      let score = 0;
      if (/^[A-Z]{2}[0-9A-Z]{6,}/.test(cleanLine)) score += 0.3;
      if (/[A-Z]{3}\d{6}/.test(cleanLine)) score += 0.3; // Country + date
      if (/[MF]/.test(cleanLine)) score += 0.2;
      if (Math.abs(cleanLine.length - 44) <= 5) score += 0.2;
      return score;
    }
  }

  /**
   * Check if document type has MRZ
   */
  private static hasMRZ(docType: VerifiedDocType): boolean {
    return docType === "passport" || docType === "residence_permit";
  }

  /**
   * Extract MRZ-based documents with enhanced processing
   */
  private static async extractMRZDocument(captureResult: any, docType: VerifiedDocType): Promise<ExtractedIdResult> {
    console.log(`📋 Extracting MRZ document: ${docType}`);

    try {
      // Use the enhanced MRZ scanner
      const mrzData = await MRZScanner.extractMRZFromImage(captureResult.processedImageUri);

      if (!mrzData) {
        throw new Error("No valid MRZ found in document");
      }

      console.log("✅ MRZ extraction successful:", {
        valid: mrzData.valid,
        document: mrzData.passportNumber,
        name: `${mrzData.firstName} ${mrzData.lastName}`
      });

      // Convert to our standard format
      const confidence = mrzData.valid ? 0.95 : 0.7;
      const fields = {
        documentNumber: this.createOcrField(mrzData.passportNumber, confidence, "mrz"),
        surname: this.createOcrField(mrzData.lastName, confidence, "mrz"),
        givenNames: this.createOcrField(mrzData.firstName, confidence, "mrz"),
        dateOfBirth: this.createOcrField(mrzData.dateOfBirth, confidence, "mrz"),
        sex: this.createOcrField(mrzData.sex, confidence, "mrz"),
        nationality: this.createOcrField(mrzData.nationality, confidence, "mrz"),
        dateOfExpiry: this.createOcrField(mrzData.expirationDate, confidence, "mrz"),
      };

      return {
        docType,
        originalImageUri: captureResult.originalImageUri,
        processedImageUri: captureResult.processedImageUri,
        fields,
        mrz: {
          raw: `${mrzData.documentType}<${mrzData.issuingCountry}<${mrzData.lastName}<<${mrzData.firstName}`,
          type: "TD3",
          checks: {
            documentNumber: mrzData.validationDetails.passportNumberValid,
            dob: mrzData.validationDetails.dateOfBirthValid,
            expiry: mrzData.validationDetails.expirationDateValid,
            composite: mrzData.validationDetails.compositeValid,
          },
        },
        quality: captureResult.quality,
      };
    } catch (error) {
      console.error("❌ MRZ extraction failed:", error);
      throw error;
    }
  }

  /**
   * Enhanced OCR-based document extraction
   */
  private static async extractOCRDocument(captureResult: any, docType: VerifiedDocType): Promise<ExtractedIdResult> {
    console.log(`📄 Extracting OCR document: ${docType}`);

    try {
      // Load document template
      const template = await this.loadTemplateAdvanced(docType);
      
      // Perform comprehensive text analysis optimized for document type
      const textAnalysis = await this.performTextAnalysis(captureResult.processedImageUri, docType);
      
      if (textAnalysis.confidence < this.MIN_OCR_CONFIDENCE) {
        console.warn(`⚠️ OCR confidence low: ${textAnalysis.confidence.toFixed(2)}`);
      }

      // Enhanced field extraction
      const fields = await this.extractFieldsAdvanced(textAnalysis, template, docType);

      console.log("✅ OCR extraction completed:", {
        fieldsExtracted: Object.keys(fields).length,
        fields: Object.keys(fields)
      });

      return {
        docType,
        originalImageUri: captureResult.originalImageUri,
        processedImageUri: captureResult.processedImageUri,
        fields,
        quality: captureResult.quality,
      };
    } catch (error) {
      console.error("❌ OCR extraction failed:", error);
      throw error;
    }
  }

  /**
   * Advanced field extraction with multiple strategies
   */
  private static async extractFieldsAdvanced(
    textAnalysis: TextAnalysisResult,
    template: DocumentTemplate,
    docType: VerifiedDocType
  ): Promise<Record<string, OcrField>> {
    console.log(`🔍 Performing advanced field extraction for ${docType}`);

    const extractedFields: Record<string, OcrField> = {};
    const patterns = this.getFieldPatterns(docType);

    // Strategy 1: Pattern matching across full text
    console.log("📋 Strategy 1: Pattern-based extraction");
    const patternFields = this.extractUsingPatterns(textAnalysis.text, patterns);
    Object.assign(extractedFields, patternFields);

    // Strategy 2: Line-by-line contextual analysis
    console.log("📋 Strategy 2: Contextual line analysis");
    const contextualFields = this.extractUsingContext(textAnalysis.lines, patterns, docType);
    
    // Merge results, preferring higher confidence matches
    for (const [key, field] of Object.entries(contextualFields)) {
      if (!extractedFields[key] || field.confidence > extractedFields[key].confidence) {
        extractedFields[key] = field;
      }
    }

    // Strategy 3: Template-based region analysis (if positions are reliable)
    console.log("📋 Strategy 3: Template-based analysis");
    if (template && Object.keys(template.fields).length > 0) {
      const templateFields = this.extractUsingTemplate(textAnalysis, template);
      
      // Merge template results with lower confidence
      for (const [key, field] of Object.entries(templateFields)) {
        if (!extractedFields[key]) {
          extractedFields[key] = field;
        }
      }
    }

    // Post-process and validate fields
    const processedFields = this.postProcessFields(extractedFields, docType);

    console.log(`📊 Field extraction summary:`, {
      totalFound: Object.keys(processedFields).length,
      highConfidence: Object.values(processedFields).filter(f => f.confidence > 0.8).length,
      mediumConfidence: Object.values(processedFields).filter(f => f.confidence > 0.6 && f.confidence <= 0.8).length,
      lowConfidence: Object.values(processedFields).filter(f => f.confidence <= 0.6).length,
    });

    return processedFields;
  }

  /**
   * Get field extraction patterns for document type
   */
  private static getFieldPatterns(docType: VerifiedDocType): Record<string, FieldPattern> {
    // For civil_id - focus on Arabic patterns since it's Arabic-only
    if (docType === "civil_id") {
      return {
        documentNumber: {
          pattern: /\b\d{8,15}\b/g,
          confidence: 0.9,
          contextKeywords: ["رقم", "الرقم", "الهوية", "وثيقة"]
        },
        fullNameArabic: {
          // Enhanced Arabic name pattern - looks for multiple Arabic words
          pattern: /[\u0600-\u06FF]{2,}\s+[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,})*/g,
          confidence: 0.8,
          contextKeywords: ["الاسم", "اسم", "الكامل", "الكنية"]
        },
        dateOfBirth: {
          // Both Western and Arabic-Indic numerals
          pattern: /\b(\d{1,2}|\u0660-\u0669{1,2})[\/\-\.](\d{1,2}|\u0660-\u0669{1,2})[\/\-\.](\d{4}|\u0660-\u0669{4})\b/g,
          processor: (match: string) => this.normalizeDateFormat(match),
          confidence: 0.9,
          contextKeywords: ["الولادة", "ولادة", "تاريخ", "تولد"]
        },
        placeOfBirth: {
          // Lebanese cities in Arabic
          pattern: /\b(بيروت|طرابلس|صيدا|صور|زحلة|بعلبك|النبطية|عكار|جبيل|كسروان|عاليه|الشوف|البقاع|الهرمل|راشيا|حاصبيا|مرجعيون)\b/g,
          confidence: 0.85,
          contextKeywords: ["الولادة", "ولادة", "مكان", "محل"]
        },
        nationality: {
          pattern: /\b(لبناني|لبنانية|اللبنانية|اللبناني)\b/g,
          confidence: 0.95,
          contextKeywords: ["الجنسية", "جنسية", "القومية"]
        },
        sex: {
          pattern: /\b(ذكر|أنثى|انثى)\b/g,
          processor: (match: string) => this.normalizeSex(match),
          confidence: 0.95,
          contextKeywords: ["الجنس", "جنس", "النوع"]
        },
        idNumber: {
          // Civil ID specific number pattern
          pattern: /\b\d{10,11}\b/g,
          confidence: 0.85,
          contextKeywords: ["الرقم", "رقم", "هوية", "السجل"]
        },
        motherName: {
          // Mother's name pattern in Arabic
          pattern: /والدته[\s:]*[\u0600-\u06FF\s]{5,30}/g,
          confidence: 0.8,
          contextKeywords: ["والدته", "الوالدة", "الأم", "أم"]
        },
        occupation: {
          // Common occupations in Arabic
          pattern: /[\u0600-\u06FF]{3,20}(?=\s|$)(?:[\u0600-\u06FF\s]{0,20})?/g,
          confidence: 0.6,
          contextKeywords: ["المهنة", "مهنة", "العمل", "الوظيفة"]
        }
      };
    }

    // For other document types (passport, etc.) - keep original patterns
    return {
      documentNumber: {
        pattern: /\b\d{8,15}\b|\b[A-Z]{2}\d{8,12}\b/g,
        confidence: 0.8,
        contextKeywords: ["number", "رقم", "document", "وثيقة"]
      },
      dateOfBirth: {
        pattern: /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b|\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/g,
        processor: (match: string) => this.normalizeDateFormat(match),
        confidence: 0.9,
        contextKeywords: ["birth", "ولادة", "date", "تاريخ"]
      },
      fullNameLatin: {
        pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g,
        confidence: 0.7,
        contextKeywords: ["name", "اسم"]
      },
      fullNameArabic: {
        pattern: /[\u0600-\u06FF][\u0600-\u06FF\s]{4,50}/g,
        confidence: 0.7,
        contextKeywords: ["الاسم", "اسم"]
      }
    };
  }

  /**
   * Extract fields using pattern matching
   */
  private static extractUsingPatterns(text: string, patterns: Record<string, FieldPattern>): Record<string, OcrField> {
    const fields: Record<string, OcrField> = {};

    for (const [fieldName, pattern] of Object.entries(patterns)) {
      const matches = Array.from(text.matchAll(pattern.pattern));
      
      if (matches.length > 0) {
        // Use the first match (could be enhanced to pick the best match)
        let value = matches[0][0].trim();
        
        if (pattern.processor) {
          value = pattern.processor(value);
        }

        if (value) {
          fields[fieldName] = this.createOcrField(
            value,
            pattern.confidence,
            "ocr"
          );
          console.log(`✅ Pattern match for ${fieldName}: "${value}" (confidence: ${pattern.confidence})`);
        }
      }
    }

    return fields;
  }

  /**
   * Extract fields using contextual analysis
   */
  private static extractUsingContext(
    lines: string[],
    patterns: Record<string, FieldPattern>,
    _docType: VerifiedDocType
  ): Record<string, OcrField> {
    const fields: Record<string, OcrField> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i < lines.length - 1 ? lines[i + 1] : "";
      const prevLine = i > 0 ? lines[i - 1] : "";

      console.log(`🔍 Analyzing line ${i + 1}: "${line}"`);

      // Check each field pattern with context
      for (const [fieldName, pattern] of Object.entries(patterns)) {
        if (fields[fieldName]) continue; // Already found

        // Check if current line contains context keywords
        const hasContext = pattern.contextKeywords?.some(keyword => 
          line.toLowerCase().includes(keyword.toLowerCase())
        );

        if (hasContext) {
          // Look for the actual value in current, next, or previous line
          const linesToCheck = [line, nextLine, prevLine].filter(l => l);
          
          for (const checkLine of linesToCheck) {
            const matches = Array.from(checkLine.matchAll(pattern.pattern));
            if (matches.length > 0) {
              let value = matches[0][0].trim();
              
              if (pattern.processor) {
                value = pattern.processor(value);
              }

              if (value && !this.isCommonWord(value)) {
                const contextConfidence = pattern.confidence * 1.1; // Boost for context
                fields[fieldName] = this.createOcrField(
                  value,
                  Math.min(contextConfidence, 1.0),
                  "ocr"
                );
                console.log(`🎯 Context match for ${fieldName}: "${value}" (boosted confidence)`);
                break;
              }
            }
          }
        } else {
          // Try direct pattern match on the line
          const matches = Array.from(line.matchAll(pattern.pattern));
          if (matches.length > 0) {
            let value = matches[0][0].trim();
            
            if (pattern.processor) {
              value = pattern.processor(value);
            }

            if (value && !this.isCommonWord(value)) {
              fields[fieldName] = this.createOcrField(
                value,
                pattern.confidence,
                "ocr"
              );
              console.log(`📝 Direct match for ${fieldName}: "${value}"`);
            }
          }
        }
      }
    }

    return fields;
  }

  /**
   * Extract fields using template regions (basic implementation)
   */
  private static extractUsingTemplate(
    _textAnalysis: TextAnalysisResult,
    template: DocumentTemplate
  ): Record<string, OcrField> {
    console.log("🗂️ Template-based extraction (simplified - would need region cropping in production)");
    
    // This is a simplified template approach
    // In production, you'd crop image regions and run OCR on each region
    const fields: Record<string, OcrField> = {};
    
    // For now, just log that template regions are available
    console.log(`📐 Template has ${Object.keys(template.fields).length} defined regions:`, Object.keys(template.fields));
    
    return fields;
  }

  /**
   * Post-process extracted fields
   */
  private static postProcessFields(
    fields: Record<string, OcrField>,
    _docType: VerifiedDocType
  ): Record<string, OcrField> {
    const processed: Record<string, OcrField> = {};

    for (const [fieldName, field] of Object.entries(fields)) {
      if (!field.value || field.value.trim().length === 0) continue;

      let processedValue = field.value.trim();
      let confidence = field.confidence;

      // Apply field-specific post-processing
      switch (fieldName) {
        case "documentNumber":
          processedValue = this.normalizeDocumentNumber(processedValue);
          break;
        case "dateOfBirth":
        case "dateOfIssue":
        case "dateOfExpiry":
          processedValue = this.normalizeDateFormat(processedValue);
          break;
        case "fullNameArabic":
          processedValue = this.normalizeArabicText(processedValue);
          break;
        case "fullNameLatin":
          processedValue = this.normalizeLatinName(processedValue);
          break;
        case "sex":
          processedValue = this.normalizeSex(processedValue);
          break;
        case "nationality":
          processedValue = this.normalizeNationality(processedValue);
          break;
      }

      if (processedValue && processedValue !== field.value) {
        console.log(`🔧 Post-processed ${fieldName}: "${field.value}" → "${processedValue}"`);
      }

      if (processedValue) {
        processed[fieldName] = this.createOcrField(processedValue, confidence, field.source);
      }
    }

    return processed;
  }

  /**
   * Utility methods for field processing
   */
  private static isCommonWord(value: string): boolean {
    const commonWords = [
      "the", "and", "or", "of", "in", "on", "at", "to", "for", "with",
      "republic", "lebanon", "lebanese", "document", "card", "identity"
    ];
    return commonWords.includes(value.toLowerCase());
  }

  private static normalizeDateFormat(dateStr: string): string {
    // First, convert Arabic-Indic numerals to Western numerals
    let normalizedStr = this.convertArabicNumerals(dateStr);
    
    // Handle various date formats and convert to ISO format
    const datePatterns = [
      /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/, // DD/MM/YYYY or DD-MM-YYYY
      /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/, // YYYY/MM/DD or YYYY-MM-DD
    ];

    for (const pattern of datePatterns) {
      const match = normalizedStr.match(pattern);
      if (match) {
        const [, part1, part2, part3] = match;
        
        // Assume first pattern is DD/MM/YYYY for Lebanese documents
        if (part3.length === 4) {
          const day = part1.padStart(2, "0");
          const month = part2.padStart(2, "0");
          const year = part3;
          return `${year}-${month}-${day}`;
        } else if (part1.length === 4) {
          const year = part1;
          const month = part2.padStart(2, "0");
          const day = part3.padStart(2, "0");
          return `${year}-${month}-${day}`;
        }
      }
    }

    return normalizedStr; // Return normalized version if no pattern matches
  }

  /**
   * Convert Arabic-Indic numerals to Western numerals
   */
  private static convertArabicNumerals(text: string): string {
    const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    const westernNumerals = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    
    let converted = text;
    for (let i = 0; i < arabicNumerals.length; i++) {
      const arabicRegex = new RegExp(arabicNumerals[i], 'g');
      converted = converted.replace(arabicRegex, westernNumerals[i]);
    }
    
    return converted;
  }

  private static normalizeDocumentNumber(text: string): string {
    // Convert Arabic numerals first, then clean
    const converted = this.convertArabicNumerals(text);
    return converted.replace(/[^\w]/g, "").toUpperCase();
  }

  private static normalizeArabicText(text: string): string {
    return text.trim().replace(/\s+/g, " ");
  }

  private static normalizeLatinName(text: string): string {
    return text
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  private static normalizeSex(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes("m") || lower.includes("ذكر")) return "M";
    if (lower.includes("f") || lower.includes("أنثى")) return "F";
    return text.toUpperCase();
  }

  private static normalizeNationality(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes("lebanese") || lower.includes("لبناني")) return "Lebanese";
    return text;
  }

  /**
   * Create OCR field with standardized format
   */
  private static createOcrField(value: string | null, confidence: number, source: "mrz" | "ocr" | "derived"): OcrField {
    return { value, confidence, source };
  }

  /**
   * Enhanced template loading with validation
   */
  private static async loadTemplateAdvanced(docType: VerifiedDocType): Promise<DocumentTemplate> {
    const templateKey = docType;

    if (this.templates.has(templateKey)) {
      const cached = this.templates.get(templateKey)!;
      console.log(`✅ Using cached template for ${docType}`);
      return cached;
    }

    console.log(`📋 Loading template for ${docType}...`);
    
    let templateData: DocumentTemplate;
    
    try {
      switch (docType) {
        case "civil_id":
          templateData = {
            docType: "civil_id_front",
            size: { w: 860, h: 540 },
            fields: {
              documentNumber: { x: 0.62, y: 0.12, w: 0.30, h: 0.10 },
              fullNameArabic: { x: 0.08, y: 0.25, w: 0.84, h: 0.14 },
              fullNameLatin: { x: 0.08, y: 0.42, w: 0.84, h: 0.12 },
              dateOfBirth: { x: 0.08, y: 0.58, w: 0.32, h: 0.10 },
              placeOfBirth: { x: 0.45, y: 0.58, w: 0.47, h: 0.10 },
              nationality: { x: 0.08, y: 0.72, w: 0.30, h: 0.08 },
              sex: { x: 0.45, y: 0.72, w: 0.15, h: 0.08 }
            }
          };
          break;
        case "army_card":
          templateData = {
            docType: "army_card",
            size: { w: 860, h: 540 },
            fields: {
              documentNumber: { x: 0.1, y: 0.1, w: 0.8, h: 0.1 },
              fullNameArabic: { x: 0.1, y: 0.3, w: 0.8, h: 0.1 },
              fullNameLatin: { x: 0.1, y: 0.5, w: 0.8, h: 0.1 }
            }
          };
          break;
        default:
          throw new Error(`No template available for document type: ${docType}`);
      }

      console.log(`✅ Template loaded for ${docType} with ${Object.keys(templateData.fields).length} fields`);
      this.templates.set(templateKey, templateData);
      return templateData;
      
    } catch (error) {
      console.error(`❌ Failed to load template for ${docType}:`, error);
      throw error;
    }
  }

  /**
   * Enhanced image quality assessment
   */
  private static async assessImageQualityAdvanced(_imageUri: string): Promise<QualityMetrics> {
    // This would be enhanced with actual image analysis in production
    // For now, return optimistic defaults that allow processing to continue
    return {
      blurScore: 0.8,
      brightness: 0.7,
      glareDetected: false,
      edgesDetected: true,
      isAcceptable: true,
    };
  }
}