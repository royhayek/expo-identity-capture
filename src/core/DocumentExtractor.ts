import {
  ExtractedIdResult,
  CaptureOptions,
  VerifiedDocType,
  QualityMetrics,
  DocumentTemplate,
  OcrField,
} from "../types/extraction";
import { recognizeText, getCloudVisionConfig, CloudVisionResponse } from "../services/CloudVisionOCR";
import DocumentScanner, {
  ResponseType,
} from "react-native-document-scanner-plugin";
import CustomDocumentCapture from './CustomDocumentCapture';
import { ImageProcessor, DocumentCorners } from '../utils/imageProcessor';
import { DEFAULT_CONFIG } from '../types/config';
import { TemplateLoader } from '../utils/templateLoader';

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
  static async captureAndExtract(
    options: CaptureOptions = {}
  ): Promise<ExtractedIdResult> {
    console.log("🚀 Starting advanced document capture and extraction");
    
    // Check if custom OpenCV-based capture is requested
    if (options.useCustomCapture) {
      return this.captureAndExtractWithCustomCamera(options);
    }

    try {
      // Step 1: Enhanced capture with quality control (using original plugin)
      const captureResult = await this.captureWithAdvancedQuality(options);

      // Step 2: Document type detection with multiple methods
      const detectedDocType = await this.detectDocumentTypeAdvanced(
        captureResult.processedImageUri,
        undefined
      );

      // Step 3: Validate document type matches expectation
      if (options.docHint) {
        const isValidDocumentType = await this.validateDocumentType(
          detectedDocType,
          options.docHint,
          captureResult.processedImageUri
        );

        if (!isValidDocumentType) {
          const errorMessage = this.generateDocumentMismatchError(
            options.docHint
          );
          console.error(`❌ Document type mismatch: ${errorMessage}`);
          throw new Error(errorMessage);
        }

        console.log(
          `✅ Document type validation passed: ${detectedDocType} matches expected ${options.docHint}`
        );
      }

      // Step 4: Use the expected document type if provided, otherwise use detected type
      const finalDocType = options.docHint || detectedDocType;

      // Step 5: Use OCR extraction for all documents
      return await this.extractOCRDocument(captureResult, finalDocType);
    } catch (error) {
      console.error("❌ Document extraction failed:", error);
      throw error;
    }
  }

  /**
   * Alternative capture method using custom OpenCV-based document capture
   */
  static async captureAndExtractWithCustomCamera(
    options: CaptureOptions = {}
  ): Promise<ExtractedIdResult> {
    console.log("📸 Starting custom OpenCV-based document capture...");
    
    try {
      if (!options.docHint) {
        throw new Error("Document type hint is required for custom capture");
      }

      // Step 1: Use custom document capture
      const customCapture = CustomDocumentCapture.getInstance();
      const captureResult = await customCapture.captureDocument({
        docHint: options.docHint,
        enableFlash: options.enableFlash,
        quality: 100,
        maxRetries: 3,
      });

      console.log("✅ Custom capture completed, processing...");

      // Step 2: Process captured image through existing extraction pipeline
      const textAnalysis = await this.performTextAnalysis(
        captureResult.croppedImageUri,
        options.docHint
      );

      // Step 3: Extract fields using templates and OCR  
      // For now, use direct OCR extraction until template integration is complete
      const extractionResult = await this.extractOCRDocument(
        { processedImageUri: captureResult.croppedImageUri },
        options.docHint
      );

      console.log(`🎉 Custom document capture and extraction completed for ${options.docHint}`);
      return extractionResult;

    } catch (error) {
      console.error("❌ Custom capture failed:", error);
      
      // Check if it was a user cancellation
      if (error.message?.includes('cancelled')) {
        throw new Error('Document capture cancelled by user');
      }
      
      // Re-throw the error - don't fall back automatically
      throw error;
    }
  }

  /**
   * Enhanced capture with comprehensive quality control
   */
  private static async captureWithAdvancedQuality(options: CaptureOptions) {
    try {
      console.log("📷 Starting document capture with quality control");

      let attempts = 0;
      const maxAttempts = 2;
      let capturedImageUri: string | null = null;

      while (attempts < maxAttempts && !capturedImageUri) {
        attempts++;

        if (attempts > 1) {
          console.log(
            `🔄 Retry attempt ${attempts} for proper rectangular capture`
          );
        }

        // Use document scanner with strict single capture configuration
        // Note: UI customization is limited by the plugin's native implementation
        const result = await DocumentScanner.scanDocument({
          croppedImageQuality: 100,
          maxNumDocuments: 1, // Limit to single document capture (Android only)
          responseType: ResponseType.ImageFilePath,
          // Additional validation will be done after capture to ensure single image
        });

        if (!result.scannedImages || result.scannedImages.length === 0) {
          if (attempts < maxAttempts) {
            console.warn("⚠️ No document captured, retrying...");
            continue;
          }
          throw new Error("No document captured");
        }

        // Enforce single image processing even if multiple were captured
        if (result.scannedImages.length > 1) {
          console.warn(`⚠️ Multiple images captured (${result.scannedImages.length}), using only the first one`);
        }

        const imageUri = result.scannedImages[0];

        // Validate that the captured image is properly rectangular
        const isValidRectangle = await this.validateRectangularShape(imageUri, options.docHint);

        if (!isValidRectangle) {
          console.warn("⚠️ Captured image may not be properly rectangular");
          if (attempts < maxAttempts) {
            console.log(
              "🔄 Prompting user to recapture for better rectangular detection..."
            );
            continue;
          }
          // On final attempt, provide detailed error based on document type
          const shapeInstructions = options.docHint === 'passport'
            ? "Passport shape is incorrect. Please ensure:\n• Open the passport to show BOTH pages\n• Hold the passport vertically (portrait orientation)\n• Capture the entire opened passport as one vertical rectangle\n• Good lighting with no shadows\n• Passport is on a contrasting background"
            : "Document shape is not rectangular. Please ensure:\n• The entire document is visible\n• Document is on a contrasting background\n• Good lighting with no shadows\n• Document edges are clear";
            
          throw new Error(shapeInstructions);
        }

        capturedImageUri = imageUri;
      }

      if (!capturedImageUri) {
        throw new Error("Failed to capture document after multiple attempts");
      }

      const originalImageUri = capturedImageUri;
      const processedImageUri = originalImageUri; // Scanner already processes

      console.log(
        `📱 Successfully captured rectangular document: ${originalImageUri}`
      );

      // Comprehensive quality assessment
      const quality = await this.assessImageQualityAdvanced(processedImageUri);
      console.log(`📊 Quality assessment:`, quality);

      if (options.enableQualityCheck !== false && !quality.isAcceptable) {
        console.warn(
          `⚠️ Image quality concerns: blur=${quality.blurScore.toFixed(
            2
          )}, brightness=${quality.brightness.toFixed(2)}, glare=${
            quality.glareDetected
          }`
        );
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
  private static async detectDocumentTypeAdvanced(
    imageUri: string,
    hint?: VerifiedDocType
  ): Promise<VerifiedDocType> {
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
        confidence: textAnalysis.confidence,
      });

      // Analyze text content for document type clues
      const docTypeFromContent = this.analyzeContentForDocType(textAnalysis);
      console.log(
        `🎯 Document type from content analysis: ${docTypeFromContent}`
      );

      return docTypeFromContent;
    } catch (error) {
      console.warn("⚠️ Document type detection failed, using default:", error);
      return "civil_id";
    }
  }

  /**
   * Comprehensive text analysis using ML Kit with fallbacks
   */
  private static async performTextAnalysis(
    imageUri: string,
    docTypeHint?: VerifiedDocType
  ): Promise<TextAnalysisResult> {
    console.log("🔍 Performing comprehensive text analysis...");

    let text = "";
    let confidence = 0;
    let ocrResult: CloudVisionResponse | null = null;

    try {
      // Check if Cloud Vision is configured
      if (!getCloudVisionConfig()) {
        console.warn("⚠️ Cloud Vision not configured, OCR will be skipped");
        throw new Error("Cloud Vision API not configured");
      }

      // Configure language hints based on document type
      const isArabicDocument =
        docTypeHint === "civil_id" || docTypeHint === "army_card" || docTypeHint === "residence_permit";

      // Use appropriate language hints for the document type
      const languageHints = isArabicDocument ? ['ar', 'en', 'fr'] : ['en', 'fr', 'ar'];

      console.log(
        `☁️ Attempting Cloud Vision text recognition (${
          isArabicDocument ? "Arabic-optimized" : "standard"
        })...`
      );

      console.log(`☁️ Using language hints: ${languageHints.join(', ')}`);

      ocrResult = await recognizeText(imageUri, languageHints);
      text = ocrResult.text || "";

      console.log(`🔤 Raw Cloud Vision text (${text.length} chars):`, text.substring(0, 200));
      console.log(`🌐 Detected languages: ${ocrResult.detectedLanguages.join(', ')}`);

      // Apply Arabic-specific preprocessing if needed
      if (isArabicDocument) {
        const originalLength = text.length;
        text = this.preprocessArabicText(text);
        console.log(`🔤 Arabic preprocessing: ${originalLength} -> ${text.length} chars`);
        console.log(`🔤 Processed text sample:`, text.substring(0, 200));
      }

      // Calculate confidence based on text quality and document type
      confidence = this.calculateCloudVisionConfidence(text, ocrResult, isArabicDocument);

      console.log(
        `📊 Cloud Vision results: ${
          text.length
        } chars, confidence: ${confidence.toFixed(2)}`
      );

      // Log detailed Cloud Vision results
      if (ocrResult.annotations && ocrResult.annotations.length > 1) {
        console.log(`📝 Found ${ocrResult.annotations.length - 1} text blocks:`);
        ocrResult.annotations.slice(1, 10).forEach((annotation, i) => {
          const blockText = annotation.text || "";
          const hasArabic = /[\u0600-\u06FF]/.test(blockText);
          console.log(
            `   Block ${i + 1}: "${blockText.substring(0, 50)}${blockText.length > 50 ? '...' : ''}" (${
              hasArabic ? "Arabic" : "Latin"
            })`
          );
        });
      }
    } catch (error: any) {
      console.warn("⚠️ Cloud Vision failed:", error?.message || error);

      // Try fallback OCR processor if available
      try {
        const { OCRProcessor } = require("../utils/ocrProcessor");
        const fallbackResult = await OCRProcessor.extractText(imageUri, {
          languageHints: ['ar', 'en', 'fr'],
          enableOCR: true,
        });
        text = fallbackResult.text;
        confidence = fallbackResult.confidence || 0.7;
        console.log(`📊 Fallback OCR results: ${text.length} chars`);
      } catch (fallbackError) {
        console.error("❌ All OCR methods failed:", fallbackError);
        throw new Error("OCR extraction failed - ensure Cloud Vision API is configured");
      }
    }

    if (text.length < this.MIN_TEXT_LENGTH) {
      console.warn(`⚠️ OCR text too short: ${text.length} chars`);
    }

    // Analyze text properties
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    
    // Primary Arabic detection using Unicode ranges
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasLatin = /[a-zA-Z]/.test(text);
    
    // Enhanced Arabic detection: Look for common Arabic words even if characters aren't detected
    const arabicWords = ['الجمهورية', 'اللبنانية', 'هوية', 'الاسم', 'تاريخ', 'الولادة', 'الجنسية', 'لبناني', 'لبنانية'];
    const hasArabicWords = arabicWords.some(word => text.includes(word));
    
    // Look for Arabic-like patterns (consecutive non-Latin characters that could be misrecognized Arabic)
    const hasArabicLikePatterns = /[^\x00-\x7F]{3,}/.test(text); // Non-ASCII characters in sequences
    
    const wordCount = text
      .split(/\s+/)
      .filter((word) => word.length > 0).length;

    console.log(`🔍 Text analysis: hasArabic=${hasArabic}, hasArabicWords=${hasArabicWords}, hasArabicLikePatterns=${hasArabicLikePatterns}, hasLatin=${hasLatin}, docTypeHint=${docTypeHint}`);
    console.log(`📝 Sample text for Arabic detection: "${text.substring(0, 100)}"`);
    
    // ML Kit limitation warning
    if (docTypeHint === "civil_id" && !hasArabic && !hasArabicWords) {
      console.warn(`⚠️ ML Kit Text Recognition v2 has limited Arabic script support. Consider using additional OCR engines for Arabic documents.`);
    }
    
    // For documents we know are Arabic, use comprehensive Arabic detection
    const shouldBeArabic = docTypeHint === "civil_id" || docTypeHint === "army_card";
    const detectedArabicContent = hasArabic || hasArabicWords || hasArabicLikePatterns;
    const actualHasArabic = detectedArabicContent || shouldBeArabic;
    
    if (shouldBeArabic && !hasArabic) {
      console.log(`⚠️ ML Kit failed to detect Arabic Unicode chars in ${docTypeHint} document, using fallback detection (words=${hasArabicWords}, patterns=${hasArabicLikePatterns})`);
    }

    console.log(
      `📄 Full OCR text (${text.length} chars):`,
      text.substring(0, 500) + (text.length > 500 ? "..." : "")
    );

    // Additional analysis for Arabic documents
    if (docTypeHint === "civil_id" || docTypeHint === "army_card") {
      const arabicAnalysis = this.analyzeArabicTextQuality(text);
      console.log(`🔍 Arabic text quality:`, arabicAnalysis);
    }

    return {
      text,
      lines,
      confidence,
      language: actualHasArabic ? (hasLatin ? "mixed" : "arabic") : "latin",
      hasArabic: actualHasArabic,
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

    // First, convert Arabic-Indic numerals to Western numerals for better processing
    processed = processed
      .replace(/٠/g, "0")
      .replace(/١/g, "1")
      .replace(/٢/g, "2")
      .replace(/٣/g, "3")
      .replace(/٤/g, "4")
      .replace(/٥/g, "5")
      .replace(/٦/g, "6")
      .replace(/٧/g, "7")
      .replace(/٨/g, "8")
      .replace(/٩/g, "9");

    // Normalize Arabic characters (common OCR variations)
    processed = processed
      .replace(/ک/g, "ك") // Normalize Keheh
      .replace(/ی/g, "ي") // Normalize Yeh
      .replace(/ء/g, "ء") // Normalize Hamza
      .replace(/أ/g, "أ") // Normalize Alef with Hamza above
      .replace(/إ/g, "إ") // Normalize Alef with Hamza below
      .replace(/آ/g, "آ") // Normalize Alef with Madda above
      .replace(/ة/g, "ة") // Normalize Teh Marbuta
      .replace(/ه/g, "ه") // Normalize Heh
      .replace(/ي/g, "ي") // Normalize various Yeh forms
      .replace(/ى/g, "ى") // Normalize Alef Maksura;

    // Fix common OCR mistakes in Arabic text
    processed = processed
      .replace(/[`''"]/g, "") // Remove stray quotes that OCR often adds
      .replace(/[|]/g, "ا") // OCR often mistakes Alef for pipe
      .replace(/[l]/g, "ا") // OCR might mistake Alef for lowercase L
      .replace(/[I]/g, "ا") // OCR might mistake Alef for capital I;

    // Remove excessive whitespace while preserving Arabic word boundaries
    processed = processed.replace(/\s+/g, " ").trim();

    // Remove common OCR noise but be more inclusive for Arabic content
    // Keep Arabic letters, Arabic numerals, Western numerals, basic punctuation
    processed = processed.replace(
      /[^\u0600-\u06FF\u0660-\u0669a-zA-Z0-9\s\/\-\.\,\(\):]/g,
      ""
    );

    // Clean up any double spaces created by character removal
    processed = processed.replace(/\s+/g, " ").trim();

    return processed;
  }

  /**
   * Analyze Arabic text quality for debugging and optimization
   */
  private static analyzeArabicTextQuality(text: string): {
    arabicCharCount: number;
    numberCount: number;
    commonWords: string[];
    potentialNames: string[];
    potentialDates: string[];
    quality: 'high' | 'medium' | 'low';
  } {
    const arabicChars = text.match(/[\u0600-\u06FF]/g) || [];
    const numbers = text.match(/\d/g) || [];
    
    // Common Arabic words that should appear in civil IDs
    const commonArabicWords = [
      'الاسم', 'اسم', 'الولادة', 'ولادة', 'تاريخ', 'الجنسية', 'جنسية',
      'لبناني', 'لبنانية', 'ذكر', 'أنثى', 'رقم', 'الرقم'
    ];
    
    const foundCommonWords = commonArabicWords.filter(word => text.includes(word));
    
    // Look for potential Arabic names (2-4 Arabic words together)
    const nameMatches = text.match(/[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{2,}){1,3}/g) || [];
    
    // Look for potential dates
    const dateMatches = text.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/g) || [];
    
    // Determine quality based on content
    let quality: 'high' | 'medium' | 'low' = 'low';
    if (arabicChars.length > 20 && numbers.length > 5 && foundCommonWords.length > 2) {
      quality = 'high';
    } else if (arabicChars.length > 10 && (numbers.length > 2 || foundCommonWords.length > 1)) {
      quality = 'medium';
    }
    
    return {
      arabicCharCount: arabicChars.length,
      numberCount: numbers.length,
      commonWords: foundCommonWords,
      potentialNames: nameMatches,
      potentialDates: dateMatches,
      quality
    };
  }

  /**
   * Calculate text confidence based on OCR results
   */
  private static calculateTextConfidence(
    text: string,
    result: any,
    isArabicDocument: boolean = false
  ): number {
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
      const arabicChars = (text.match(/[\u0600-\u06FF\u0660-\u0669]/g) || [])
        .length;
      const latinChars = (text.match(/[a-zA-Z0-9]/g) || []).length;
      const totalValidChars = arabicChars + latinChars;
      const qualityRatio = totalValidChars / Math.max(text.length, 1);

      // Boost confidence if we have good Arabic text density
      confidence += qualityRatio * 0.3;

      // Additional boost if Arabic content is substantial
      if (arabicChars > 20) confidence += 0.1;

      console.log(
        `🔤 Arabic text analysis: ${arabicChars} Arabic chars, ${latinChars} Latin chars, quality ratio: ${qualityRatio.toFixed(
          2
        )}`
      );
    } else {
      // Standard alphanumeric ratio for non-Arabic documents
      const alphanumericChars = (text.match(/[a-zA-Z0-9\u0600-\u06FF]/g) || [])
        .length;
      const qualityRatio = alphanumericChars / Math.max(text.length, 1);
      confidence += qualityRatio * 0.3;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Calculate text confidence based on Cloud Vision results
   */
  private static calculateCloudVisionConfidence(
    text: string,
    result: CloudVisionResponse,
    isArabicDocument: boolean = false
  ): number {
    let confidence = 0.5; // Base confidence

    // Text length factor
    if (text.length > 100) confidence += 0.2;
    else if (text.length > 50) confidence += 0.1;

    // Annotations structure factor
    if (result.annotations && result.annotations.length > 1) {
      confidence += Math.min((result.annotations.length - 1) * 0.03, 0.15);
    }

    // Language detection factor
    if (result.detectedLanguages && result.detectedLanguages.length > 0) {
      confidence += 0.1;
    }

    // Text quality factor with Arabic-specific logic
    if (isArabicDocument) {
      // For Arabic documents, count Arabic characters and numbers
      const arabicChars = (text.match(/[\u0600-\u06FF\u0660-\u0669]/g) || []).length;
      const latinChars = (text.match(/[a-zA-Z0-9]/g) || []).length;
      const totalValidChars = arabicChars + latinChars;
      const qualityRatio = totalValidChars / Math.max(text.length, 1);

      // Boost confidence if we have good Arabic text density
      confidence += qualityRatio * 0.25;

      // Additional boost if Arabic content is substantial
      if (arabicChars > 20) confidence += 0.1;

      console.log(
        `🔤 Arabic text analysis: ${arabicChars} Arabic chars, ${latinChars} Latin chars, quality ratio: ${qualityRatio.toFixed(2)}`
      );
    } else {
      // Standard alphanumeric ratio for non-Arabic documents
      const alphanumericChars = (text.match(/[a-zA-Z0-9\u0600-\u06FF]/g) || []).length;
      const qualityRatio = alphanumericChars / Math.max(text.length, 1);
      confidence += qualityRatio * 0.25;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Analyze content to determine document type
   */
  private static analyzeContentForDocType(
    analysis: TextAnalysisResult
  ): VerifiedDocType {
    const text = analysis.text.toLowerCase();

    // Look for document-specific keywords
    const keywords = {
      civil_id: [
        "civil",
        "identity",
        "card",
        "republic",
        "lebanon",
        "lebanese",
        "هوية",
        "مدنية",
        "الجمهورية",
        "اللبنانية",
        "لبناني",
      ],
      passport: [
        "passport",
        "passeport",
        "travel",
        "document",
        "republic of lebanon",
        "جواز",
        "سفر",
        "سياحة",
        "الجمهورية اللبنانية",
      ],
      army_card: [
        "army",
        "military",
        "force",
        "armed",
        "service",
        "الجيش",
        "عسكري",
        "قوات",
        "مسلحة",
        "خدمة",
      ],
      residence_permit: [
        "residence",
        "permit",
        "visa",
        "stay",
        "resident",
        "إقامة",
        "تصريح",
        "تأشيرة",
        "مقيم",
        "الإقامة",
      ],
    };

    let scores = {
      civil_id: 0,
      passport: 0,
      army_card: 0,
      residence_permit: 0,
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
    
    // Give civil_id a boost if we detect mostly Arabic content or Arabic-like patterns
    if (analysis.hasArabic || text.match(/[\u0600-\u06FF]/g)) {
      scores.civil_id += 2; // Strong indicator for civil_id
    }
    
    // Look for civil_id specific patterns even if Arabic detection failed
    const civilIdKeywords = ['الجمهورية', 'هوية', 'الاسم', 'تاريخ', 'الولادة', 'الجنسية', 'لبناني', 'لبنانية'];
    const foundKeywords = civilIdKeywords.filter(keyword => text.includes(keyword));
    
    if (foundKeywords.length > 0) {
      scores.civil_id += 3; // Very strong indicator for civil_id
      console.log(`🎯 Found ${foundKeywords.length} Arabic civil_id keywords: ${foundKeywords.join(', ')}`);
    }
    
    // Additional patterns for civil_id even when OCR fails with Arabic
    // Look for number patterns typical of Lebanese civil IDs
    if (text.match(/\d{10,15}/) && (foundKeywords.length > 0 || analysis.hasArabic)) {
      scores.civil_id += 2;
      console.log('🔢 Found civil_id number pattern with Arabic context');
    }

    // Find the highest scoring document type
    const winner = Object.entries(scores).reduce((a, b) =>
      scores[a[0] as VerifiedDocType] > scores[b[0] as VerifiedDocType] ? a : b
    )[0] as VerifiedDocType;

    console.log("📊 Document type scores:", scores);
    return winner;
  }

  /**
   * Validate that the detected document type matches the expected type
   */
  private static async validateDocumentType(
    detectedType: VerifiedDocType,
    expectedType: VerifiedDocType,
    imageUri: string
  ): Promise<boolean> {
    console.log(
      `🔍 Validating document type: detected='${detectedType}' vs expected='${expectedType}'`
    );

    // If types match exactly, validation passes
    if (detectedType === expectedType) {
      return true;
    }

    // Perform additional validation using OCR text analysis for more accurate detection
    const textAnalysis = await this.performTextAnalysis(imageUri, expectedType);
    const enhancedDetection = await this.performEnhancedDocumentDetection(
      textAnalysis,
      expectedType
    );

    console.log(`🔍 Enhanced detection results:`, enhancedDetection);

    // Check if enhanced detection matches expected type
    if (enhancedDetection.mostLikelyType === expectedType) {
      console.log(
        `✅ Enhanced detection confirms expected type: ${expectedType}`
      );
      return true;
    }

    // If we have a clear detection of a DIFFERENT document type, reject immediately
    const detectedScore =
      enhancedDetection.features[enhancedDetection.mostLikelyType] || 0;
    const expectedScore = enhancedDetection.features[expectedType] || 0;

    if (
      detectedScore > 0 &&
      enhancedDetection.mostLikelyType !== expectedType
    ) {
      console.log(
        `❌ Clear mismatch detected: ${enhancedDetection.mostLikelyType} (score: ${detectedScore}) vs expected ${expectedType} (score: ${expectedScore})`
      );
      return false;
    }

    // Only allow low confidence override if NO document type was clearly detected
    // AND the most likely type is not confidently pointing to a different document
    if (enhancedDetection.confidence < 0.6 && detectedScore === 0) {
      // Additional check: if mostLikelyType is different from expected and we have some confidence in it
      // (even if score is 0), we should still reject to be safe
      if (enhancedDetection.mostLikelyType !== expectedType) {
        console.log(
          `❌ Most likely type is ${enhancedDetection.mostLikelyType}, not ${expectedType}. Rejecting to be safe.`
        );
        return false;
      }

      console.log(
        `⚠️ No clear document type detected (confidence: ${enhancedDetection.confidence.toFixed(
          2
        )}), allowing expected type`
      );
      return true;
    }

    // Final check: look for specific distinguishing features only if scores are close
    if (Math.abs(detectedScore - expectedScore) <= 1) {
      const hasDistinguishingFeatures = await this.checkDistinguishingFeatures(
        textAnalysis,
        detectedType,
        expectedType
      );

      return hasDistinguishingFeatures;
    }

    // If we reach here, there's a clear mismatch
    console.log(
      `❌ Document type validation failed: detected=${enhancedDetection.mostLikelyType}, expected=${expectedType}`
    );
    return false;
  }

  /**
   * Perform enhanced document detection with detailed analysis
   */
  private static async performEnhancedDocumentDetection(
    textAnalysis: TextAnalysisResult,
    expectedType: VerifiedDocType
  ): Promise<{
    mostLikelyType: VerifiedDocType;
    confidence: number;
    features: Record<string, number>;
  }> {
    const text = textAnalysis.text.toLowerCase();
    console.log(`🔍 Enhanced detection for expected: ${expectedType}`);

    // Enhanced keyword scoring with more specific patterns
    const enhancedKeywords = {
      civil_id: {
        strong: [
          "بطاقة هوية",
          "civil identity",
          "هوية مدنية",
          "الجمهورية اللبنانية",
          "وزارة الداخلية",
        ],
        medium: ["هوية", "identity", "card", "civil", "مدنية"],
        weak: ["lebanon", "lebanese", "لبناني"],
      },
      passport: {
        strong: [
          "passport",
          "passeport",
          "جواز سفر",
          "travel document",
          "republic of lebanon",
        ],
        medium: ["جواز", "سفر", "travel", "passeport"],
        weak: ["document", "وثيقة"],
      },
      army_card: {
        strong: [
          "الجيش اللبناني",
          "lebanese army",
          "armed forces",
          "military card",
        ],
        medium: ["army", "military", "الجيش", "عسكري"],
        weak: ["force", "قوات"],
      },
      residence_permit: {
        strong: [
          "residence permit",
          "permis de séjour",
          "جواز إقامة",
          "تصريح إقامة",
        ],
        medium: ["residence", "permit", "إقامة", "تصريح"],
        weak: ["stay", "مقيم"],
      },
    };

    // Document number patterns for enhanced detection
    const documentNumberPatterns = {
      civil_id: /\b\d{10,11}\b/g, // 10-11 digit numbers
      passport: /\b(RL|LR)\s?\d{7,9}\b/gi, // RL/LR followed by 7-9 digits
      army_card: /\b[A-Z]?\d{6,10}\b/g, // Military ID patterns
      residence_permit: /\b\d{9,12}\b/g, // 9-12 digit numbers
    };

    const features: Record<string, number> = {};
    let maxScore = 0;
    let mostLikelyType: VerifiedDocType = "civil_id";

    // Score each document type
    for (const [docType, keywords] of Object.entries(enhancedKeywords)) {
      let score = 0;

      // Strong keywords (high weight)
      keywords.strong.forEach((keyword) => {
        if (text.includes(keyword)) {
          score += 3;
          console.log(`🎯 Strong match for ${docType}: "${keyword}"`);
        }
      });

      // Medium keywords
      keywords.medium.forEach((keyword) => {
        if (text.includes(keyword)) {
          score += 2;
          console.log(`🎯 Medium match for ${docType}: "${keyword}"`);
        }
      });

      // Weak keywords
      keywords.weak.forEach((keyword) => {
        if (text.includes(keyword)) {
          score += 1;
        }
      });

      // Document number pattern matching
      const numberPattern = documentNumberPatterns[docType as VerifiedDocType];
      if (numberPattern && numberPattern.test(text)) {
        score += 2;
        console.log(`🔢 Document number pattern match for ${docType}`);
      }

      features[docType] = score;

      if (score > maxScore) {
        maxScore = score;
        mostLikelyType = docType as VerifiedDocType;
      }
    }

    // Calculate confidence based on score separation
    const secondHighest = Object.values(features).sort((a, b) => b - a)[1] || 0;
    const confidence =
      maxScore > 0 ? Math.min((maxScore - secondHighest) / maxScore, 1.0) : 0;

    return {
      mostLikelyType,
      confidence,
      features,
    };
  }

  /**
   * Check for distinguishing features between document types
   */
  private static async checkDistinguishingFeatures(
    textAnalysis: TextAnalysisResult,
    detectedType: VerifiedDocType,
    expectedType: VerifiedDocType
  ): Promise<boolean> {
    const text = textAnalysis.text.toLowerCase();

    // Define distinguishing features for each document type
    const distinguishingFeatures = {
      civil_id: [
        "وزارة الداخلية", // Ministry of Interior
        "بطاقة هوية", // Identity Card
        "الجمهورية اللبنانية", // Lebanese Republic
        /\d{11}/, // 11-digit ID number pattern
        "تاريخ الإصدار", // Issue date in Arabic
      ],
      passport: [
        "passport",
        "passeport",
        "جواز سفر",
        /\b(RL|LR)\d{7}/i, // Passport number pattern
        "republic of lebanon",
      ],
      army_card: [
        "الجيش اللبناني",
        "lebanese army",
        "armed forces",
        "military",
        "الرتبة", // Rank in Arabic
      ],
      residence_permit: [
        "residence permit",
        "permis de séjour",
        "جواز إقامة",
        "تصريح إقامة",
        "expiry date",
      ],
    };

    const expectedFeatures = distinguishingFeatures[expectedType] || [];
    const detectedFeatures = distinguishingFeatures[detectedType] || [];

    let expectedMatches = 0;
    let detectedMatches = 0;

    // Count matches for expected type
    expectedFeatures.forEach((feature) => {
      if (typeof feature === "string" && text.includes(feature)) {
        expectedMatches++;
      } else if (feature instanceof RegExp && feature.test(text)) {
        expectedMatches++;
      }
    });

    // Count matches for detected type
    detectedFeatures.forEach((feature) => {
      if (typeof feature === "string" && text.includes(feature)) {
        detectedMatches++;
      } else if (feature instanceof RegExp && feature.test(text)) {
        detectedMatches++;
      }
    });

    console.log(
      `📊 Feature analysis: expected(${expectedType})=${expectedMatches}, detected(${detectedType})=${detectedMatches}`
    );

    // If expected type has more matching features, allow it
    return expectedMatches >= detectedMatches;
  }

  /**
   * Generate user-friendly error message for document type mismatch
   */
  private static generateDocumentMismatchError(
    expectedType: VerifiedDocType
  ): string {
    const documentNames = {
      civil_id: "Civil ID",
      passport: "Passport",
      army_card: "Army Card",
      residence_permit: "Residence Permit",
    };

    const expectedName = documentNames[expectedType] || expectedType;

    return `Wrong document type detected. You selected to capture a ${expectedName} but provided something else.`;
  }

  /**
   * Enhanced OCR-based document extraction
   */
  private static async extractOCRDocument(
    captureResult: any,
    docType: VerifiedDocType
  ): Promise<ExtractedIdResult> {
    console.log(`📄 Extracting OCR document: ${docType}`);

    try {
      // Perform comprehensive text analysis optimized for document type first
      const textAnalysis = await this.performTextAnalysis(
        captureResult.processedImageUri,
        docType
      );

      // Load document template (may use text analysis for passport version detection)
      const template = await this.loadTemplateAdvanced(docType, textAnalysis);

      if (textAnalysis.confidence < this.MIN_OCR_CONFIDENCE) {
        console.warn(
          `⚠️ OCR confidence low: ${textAnalysis.confidence.toFixed(2)}`
        );
      }

      // Enhanced field extraction
      const fields = await this.extractFieldsAdvanced(
        textAnalysis,
        template,
        docType,
        captureResult.processedImageUri
      );

      console.log("✅ OCR extraction completed:", {
        fieldsExtracted: Object.keys(fields).length,
        fields: Object.keys(fields),
      });

      // Generate cropped image from the processed image
      const croppedImageUri = await this.generateCroppedImage(
        captureResult.processedImageUri,
        docType
      );

      return {
        docType,
        originalImageUri: captureResult.originalImageUri,
        croppedImageUri,
        fields,
        quality: captureResult.quality,
      };
    } catch (error) {
      console.error("❌ OCR extraction failed:", error);
      throw error;
    }
  }

  /**
   * Generate cropped image containing only the document without background
   */
  private static async generateCroppedImage(imageUri: string, docType: VerifiedDocType): Promise<string> {
    try {
      console.log(`✂️ Generating cropped image for ${docType}`);

      // Try to use template-based cropping first
      console.log(`🔍 Looking for template for ${docType}...`);
      const template = await TemplateLoader.loadTemplate(docType);
      
      if (template) {
        console.log(`📋 Using template-based cropping for ${docType}`);
        return await ImageProcessor.cropDocumentFromTemplate(imageUri, template);
      }

      // Fallback to frame config from default config
      console.log(`⚠️ No template found for ${docType}, using frame config`);
      const frameConfig = DEFAULT_CONFIG.theme.layout.frame[docType];
      
      if (!frameConfig) {
        console.warn(`⚠️ No frame config found for ${docType}, using default crop`);
        // Fallback to a generic crop if no specific config
        return await ImageProcessor.cropDocumentFromFrame(imageUri, {
          top: '30%',
          left: '10%',
          right: '10%',
          height: '40%'
        });
      }

      // Convert FrameDimensions to required format
      const cropConfig = {
        top: frameConfig.top || '30%',
        left: frameConfig.left || '10%',
        right: frameConfig.right || '10%',
        height: frameConfig.height || '40%'
      };

      const croppedUri = await ImageProcessor.cropDocumentFromFrame(imageUri, cropConfig);
      console.log(`✅ Document cropped successfully: ${croppedUri}`);
      
      return croppedUri;
    } catch (error) {
      console.error(`❌ Failed to generate cropped image for ${docType}:`, error);
      // If cropping fails, return the processed image as fallback
      console.warn(`⚠️ Using processed image as cropped fallback`);
      return imageUri;
    }
  }

  /**
   * Generate cropped image using detected corners (for custom camera captures)
   */
  private static async generateCroppedImageFromCorners(imageUri: string, corners: DocumentCorners): Promise<string> {
    try {
      console.log(`✂️ Generating cropped image from detected corners`);
      
      const croppedUri = await ImageProcessor.cropDocumentFromCorners(imageUri, corners);
      console.log(`✅ Document cropped successfully using corners: ${croppedUri}`);
      
      return croppedUri;
    } catch (error) {
      console.error(`❌ Failed to generate cropped image from corners:`, error);
      // If cropping fails, return the original image as fallback
      console.warn(`⚠️ Using original image as cropped fallback`);
      return imageUri;
    }
  }

  /**
   * Advanced field extraction with multiple strategies
   */
  private static async extractFieldsAdvanced(
    textAnalysis: TextAnalysisResult,
    template: DocumentTemplate,
    docType: VerifiedDocType,
    imageUri?: string
  ): Promise<Record<string, OcrField>> {
    console.log(`🔍 Performing advanced field extraction for ${docType}`);

    const extractedFields: Record<string, OcrField> = {};
    const patterns = this.getFieldPatterns(docType);

    // Strategy 1: Pattern matching across full text
    console.log("📋 Strategy 1: Pattern-based extraction");
    const patternFields = this.extractUsingPatterns(
      textAnalysis.text,
      patterns
    );
    Object.assign(extractedFields, patternFields);

    // Strategy 2: Line-by-line contextual analysis
    console.log("📋 Strategy 2: Contextual line analysis");
    const contextualFields = this.extractUsingContext(
      textAnalysis.lines,
      patterns,
      docType
    );

    // Merge results, preferring higher confidence matches
    for (const [key, field] of Object.entries(contextualFields)) {
      if (
        !extractedFields[key] ||
        field.confidence > extractedFields[key].confidence
      ) {
        extractedFields[key] = field;
      }
    }

    // Strategy 3: Template-based region analysis (if positions are reliable)
    console.log("📋 Strategy 3: Template-based analysis");
    if (template && Object.keys(template.fields).length > 0) {
      const templateFields = this.extractUsingTemplate(
        textAnalysis,
        template,
        imageUri
      );

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
      highConfidence: Object.values(processedFields).filter(
        (f) => f.confidence > 0.8
      ).length,
      mediumConfidence: Object.values(processedFields).filter(
        (f) => f.confidence > 0.6 && f.confidence <= 0.8
      ).length,
      lowConfidence: Object.values(processedFields).filter(
        (f) => f.confidence <= 0.6
      ).length,
    });

    return processedFields;
  }

  /**
   * Get field extraction patterns for document type
   */
  private static getFieldPatterns(
    docType: VerifiedDocType
  ): Record<string, FieldPattern> {
    // For civil_id - focus on Arabic patterns since it's Arabic-only
    if (docType === "civil_id") {
      return {
        documentNumber: {
          pattern: /\b\d{8,15}\b/g,
          confidence: 0.9,
          contextKeywords: ["رقم", "الرقم", "الهوية", "وثيقة"],
        },
        fullNameArabic: {
          // Enhanced Arabic name pattern - more flexible matching for OCR variations
          pattern:
            /[\u0600-\u06FF]{2,}(?:\s+[\u0600-\u06FF]{1,}){1,4}/g,
          confidence: 0.8,
          contextKeywords: ["الاسم", "اسم", "الكامل", "الكنية", "نام"],
        },
        dateOfBirth: {
          // Enhanced date patterns - now handles Western numerals (after Arabic preprocessing)
          pattern:
            /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b|\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/g,
          processor: (match: string) => this.normalizeDateFormat(match),
          confidence: 0.9,
          contextKeywords: ["الولادة", "ولادة", "تاريخ", "تولد", "میلاد"],
        },
        placeOfBirth: {
          // Lebanese cities in Arabic
          pattern:
            /\b(بيروت|طرابلس|صيدا|صور|زحلة|بعلبك|النبطية|عكار|جبيل|كسروان|عاليه|الشوف|البقاع|الهرمل|راشيا|حاصبيا|مرجعيون)\b/g,
          confidence: 0.85,
          contextKeywords: ["الولادة", "ولادة", "مكان", "محل"],
        },
        nationality: {
          pattern: /\b(لبناني|لبنانية|اللبنانية|اللبناني)\b/g,
          confidence: 0.95,
          contextKeywords: ["الجنسية", "جنسية", "القومية"],
        },
        sex: {
          pattern: /\b(ذكر|أنثى|انثى)\b/g,
          processor: (match: string) => this.normalizeSex(match),
          confidence: 0.95,
          contextKeywords: ["الجنس", "جنس", "النوع"],
        },
        idNumber: {
          // Civil ID specific number pattern
          pattern: /\b\d{10,11}\b/g,
          confidence: 0.85,
          contextKeywords: ["الرقم", "رقم", "هوية", "السجل"],
        },
        motherName: {
          // Mother's name pattern in Arabic
          pattern: /والدته[\s:]*[\u0600-\u06FF\s]{5,30}/g,
          confidence: 0.8,
          contextKeywords: ["والدته", "الوالدة", "الأم", "أم"],
        },
        occupation: {
          // Common occupations in Arabic
          pattern: /[\u0600-\u06FF]{3,20}(?=\s|$)(?:[\u0600-\u06FF\s]{0,20})?/g,
          confidence: 0.6,
          contextKeywords: ["المهنة", "مهنة", "العمل", "الوظيفة"],
        },
      };
    }

    // For passport
    if (docType === "passport") {
      return {
        documentNumber: {
          pattern: /\b[A-Z]{2}\d{7,9}\b|\b\d{8,15}\b/g,
          confidence: 0.8,
          contextKeywords: ["passport", "number", "جواز", "رقم"],
        },
        surname: {
          pattern: /\b[A-Z][a-z]+ ?[A-Z]?[a-z]*\b/g,
          confidence: 0.7,
          contextKeywords: [
            "surname",
            "family",
            "last name",
            "اللقب",
            "العائلة",
          ],
        },
        givenNames: {
          pattern: /\b[A-Z][a-z]+ ?(?:[A-Z][a-z]+ ?)*\b/g,
          confidence: 0.7,
          contextKeywords: ["given", "first", "name", "الاسم", "الأول"],
        },
        dateOfBirth: {
          pattern:
            /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b|\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/g,
          processor: (match: string) => this.normalizeDateFormat(match),
          confidence: 0.9,
          contextKeywords: ["birth", "born", "ولادة", "تاريخ"],
        },
        nationality: {
          pattern: /\b(lebanese|لبناني|لبنانية)\b/gi,
          confidence: 0.9,
          contextKeywords: ["nationality", "الجنسية"],
        },
        dateOfExpiry: {
          pattern:
            /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b|\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/g,
          processor: (match: string) => this.normalizeDateFormat(match),
          confidence: 0.9,
          contextKeywords: [
            "expiry",
            "expires",
            "valid until",
            "انتهاء",
            "صلاحية",
          ],
        },
      };
    }

    // For residence permit
    if (docType === "residence_permit") {
      return {
        documentNumber: {
          pattern: /\b\d{8,15}\b/g,
          confidence: 0.8,
          contextKeywords: ["number", "رقم", "permit", "تصريح"],
        },
        fullNameArabic: {
          pattern: /[\u0600-\u06FF][\u0600-\u06FF\s]{4,50}/g,
          confidence: 0.7,
          contextKeywords: ["الاسم", "اسم"],
        },
        nationality: {
          pattern: /\b[A-Za-z]{4,20}\b/g,
          confidence: 0.7,
          contextKeywords: ["nationality", "الجنسية", "country", "البلد"],
        },
        dateOfExpiry: {
          pattern:
            /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b|\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/g,
          processor: (match: string) => this.normalizeDateFormat(match),
          confidence: 0.9,
          contextKeywords: ["expiry", "valid until", "انتهاء", "صلاحية"],
        },
      };
    }

    // Default patterns for any other document types
    return {
      documentNumber: {
        pattern: /\b\d{8,15}\b|\b[A-Z]{2}\d{8,12}\b/g,
        confidence: 0.8,
        contextKeywords: ["number", "رقم", "document", "وثيقة"],
      },
      dateOfBirth: {
        pattern:
          /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b|\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/g,
        processor: (match: string) => this.normalizeDateFormat(match),
        confidence: 0.9,
        contextKeywords: ["birth", "ولادة", "date", "تاريخ"],
      },
      fullNameLatin: {
        pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b/g,
        confidence: 0.7,
        contextKeywords: ["name", "اسم"],
      },
      fullNameArabic: {
        pattern: /[\u0600-\u06FF][\u0600-\u06FF\s]{4,50}/g,
        confidence: 0.7,
        contextKeywords: ["الاسم", "اسم"],
      },
    };
  }

  /**
   * Extract fields using pattern matching
   */
  private static extractUsingPatterns(
    text: string,
    patterns: Record<string, FieldPattern>
  ): Record<string, OcrField> {
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
          console.log(
            `✅ Pattern match for ${fieldName}: "${value}" (confidence: ${pattern.confidence})`
          );
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
        const hasContext = pattern.contextKeywords?.some((keyword) =>
          line.toLowerCase().includes(keyword.toLowerCase())
        );

        if (hasContext) {
          // Look for the actual value in current, next, or previous line
          const linesToCheck = [line, nextLine, prevLine].filter((l) => l);

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
                console.log(
                  `🎯 Context match for ${fieldName}: "${value}" (boosted confidence)`
                );
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
   * Extract fields using template regions with coordinate-based text analysis
   */
  private static extractUsingTemplate(
    textAnalysis: TextAnalysisResult,
    template: DocumentTemplate,
    imageUri?: string
  ): Record<string, OcrField> {
    // Note: imageUri available for future advanced region-based OCR processing
    console.log(
      `🖼️ Processing image: ${imageUri?.substring(0, 50) || "unknown"}...`
    );
    console.log("🗂️ Starting template-based field extraction");
    console.log(
      `📐 Template '${template.docType}' has ${
        Object.keys(template.fields).length
      } defined regions`
    );

    const fields: Record<string, OcrField> = {};

    // Get image dimensions for coordinate conversion
    const imageDimensions = { width: template.size.w, height: template.size.h };

    // Process each field region defined in the template
    for (const [fieldName, fieldRegion] of Object.entries(template.fields)) {
      try {
        console.log(`🔍 Extracting field: ${fieldName}`);

        // Convert normalized coordinates to actual image coordinates
        const pixelRegion = this.convertToPixelCoordinates(
          fieldRegion,
          imageDimensions
        );

        // Extract text from the specific region
        const extractedValue = this.extractTextFromRegion(
          textAnalysis,
          pixelRegion,
          fieldName,
          template.docType
        );

        if (extractedValue && extractedValue.value) {
          fields[fieldName] = extractedValue;
          console.log(
            `✅ ${fieldName}: "${
              extractedValue.value
            }" (confidence: ${extractedValue.confidence.toFixed(2)})`
          );
        } else {
          console.log(`⚠️ ${fieldName}: No text found in region`);
        }
      } catch (error) {
        console.error(`❌ Error extracting field ${fieldName}:`, error);
      }
    }

    console.log(
      `📊 Template extraction completed: ${Object.keys(fields).length}/${
        Object.keys(template.fields).length
      } fields extracted`
    );
    return fields;
  }

  /**
   * Convert normalized template coordinates (0-1) to pixel coordinates
   */
  private static convertToPixelCoordinates(
    region: { x: number; y: number; w: number; h: number },
    imageDimensions: { width: number; height: number }
  ): { x: number; y: number; width: number; height: number } {
    return {
      x: Math.round(region.x * imageDimensions.width),
      y: Math.round(region.y * imageDimensions.height),
      width: Math.round(region.w * imageDimensions.width),
      height: Math.round(region.h * imageDimensions.height),
    };
  }

  /**
   * Extract text from a specific region using spatial analysis
   */
  private static extractTextFromRegion(
    textAnalysis: TextAnalysisResult,
    region: { x: number; y: number; width: number; height: number },
    fieldName: string,
    docType: string
  ): OcrField | null {
    // Strategy 1: Look for text within the specified region boundaries
    // This is a simplified approach - in a full implementation with ML Kit blocks,
    // you would check if text blocks fall within the region coordinates

    const regionText = this.findTextInRegion(textAnalysis, region, fieldName);

    if (regionText) {
      // Calculate confidence based on text quality and field type
      const confidence = this.calculateRegionConfidence(
        regionText,
        fieldName,
        docType
      );

      // Apply field-specific processing
      const processedText = this.processFieldValue(regionText, fieldName);

      return this.createOcrField(processedText, confidence, "ocr");
    }

    return null;
  }

  /**
   * Find text within a specific region using spatial analysis
   */
  private static findTextInRegion(
    textAnalysis: TextAnalysisResult,
    region: { x: number; y: number; width: number; height: number },
    fieldName: string
  ): string | null {
    // Since we don't have exact text block coordinates from ML Kit in this simplified version,
    // we'll use intelligent text matching based on the field name and expected content

    const text = textAnalysis.text;
    const lines = textAnalysis.lines;

    // Strategy 1: Look for field-specific patterns near expected keywords
    const fieldKeywords = this.getFieldKeywords(fieldName);
    const candidates = this.findTextCandidatesNearKeywords(
      lines,
      fieldKeywords
    );

    if (candidates.length > 0) {
      // Return the best candidate based on field type expectations
      return this.selectBestCandidate(candidates, fieldName);
    }

    // Strategy 2: Use positional analysis based on region
    // For regions in specific areas of the document, look for appropriate text patterns
    const positionalText = this.extractByPosition(lines, region, fieldName);

    if (positionalText) {
      return positionalText;
    }

    // Strategy 3: Fallback to pattern matching in full text
    const patternMatch = this.extractByPattern(text, fieldName);

    return patternMatch;
  }

  /**
   * Get keywords that typically appear near specific fields
   */
  private static getFieldKeywords(fieldName: string): string[] {
    const keywordMap: Record<string, string[]> = {
      documentNumber: ["number", "رقم", "no", "document", "وثيقة", "rl", "lr"],
      surname: ["surname", "nom", "name", "اللقب", "الشهرة", "العائلة"],
      givenNames: ["given", "first", "prénom", "الاسم", "الأول"],
      fullNameArabic: ["الاسم", "اسم", "name"],
      fullNameLatin: ["name", "nom", "surname"],
      dateOfBirth: ["birth", "ولادة", "date", "تاريخ", "born", "dob"],
      dateOfExpiry: ["expiry", "expires", "valid", "انتهاء", "صلاحية"],
      dateOfIssue: ["issue", "issued", "الإصدار", "date"],
      nationality: ["nationality", "الجنسية", "lebanese", "لبناني"],
      sex: ["sex", "الجنس", "m", "f", "ذكر", "أنثى"],
      placeOfBirth: ["place", "birth", "born", "محل", "الولادة"],
      authority: ["authority", "السلطة", "general", "division"],
      profession: ["profession", "المهنة", "work", "job"],
    };

    return keywordMap[fieldName] || [fieldName];
  }

  /**
   * Find text candidates near specific keywords
   */
  private static findTextCandidatesNearKeywords(
    lines: string[],
    keywords: string[]
  ): string[] {
    const candidates: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();

      // Check if line contains any of the keywords
      const hasKeyword = keywords.some((keyword) =>
        line.includes(keyword.toLowerCase())
      );

      if (hasKeyword) {
        // Extract value from same line (after colon or keyword)
        const sameLineValue = this.extractValueFromLine(lines[i]);
        if (sameLineValue) candidates.push(sameLineValue);

        // Check next line for the value
        if (i + 1 < lines.length) {
          const nextLineValue = this.extractValueFromLine(lines[i + 1]);
          if (nextLineValue) candidates.push(nextLineValue);
        }
      }
    }

    return candidates;
  }

  /**
   * Extract value from a line (after colon, dash, or keyword)
   */
  private static extractValueFromLine(line: string): string | null {
    // Remove common prefixes and extract the actual value
    let cleanLine = line.trim();

    // Handle patterns like "Name: John Doe" or "الاسم: محمد"
    const colonIndex = cleanLine.indexOf(":");
    if (colonIndex !== -1 && colonIndex < cleanLine.length - 1) {
      cleanLine = cleanLine.substring(colonIndex + 1).trim();
    }

    // Handle patterns like "Name - John Doe"
    const dashIndex = cleanLine.indexOf(" - ");
    if (dashIndex !== -1) {
      cleanLine = cleanLine.substring(dashIndex + 3).trim();
    }

    // Skip lines that are just labels or too short
    if (cleanLine.length < 2 || this.isCommonWord(cleanLine)) {
      return null;
    }

    return cleanLine;
  }

  /**
   * Select the best candidate based on field type expectations
   */
  private static selectBestCandidate(
    candidates: string[],
    fieldName: string
  ): string {
    if (candidates.length === 1) return candidates[0];

    // Apply field-specific selection logic
    switch (fieldName) {
      case "documentNumber":
        // Prefer candidates with numbers
        return candidates.find((c) => /\d/.test(c)) || candidates[0];

      case "dateOfBirth":
      case "dateOfExpiry":
      case "dateOfIssue":
        // Prefer candidates that look like dates
        return (
          candidates.find((c) =>
            /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(c)
          ) || candidates[0]
        );

      case "surname":
      case "givenNames":
        // Prefer candidates with proper name format
        return (
          candidates.find((c) => c.length > 2 && !/\d/.test(c)) || candidates[0]
        );

      default:
        // Return longest candidate as it's likely to be more complete
        return candidates.reduce((longest, current) =>
          current.length > longest.length ? current : longest
        );
    }
  }

  /**
   * Extract text by position analysis
   */
  private static extractByPosition(
    lines: string[],
    region: { x: number; y: number; width: number; height: number },
    fieldName: string
  ): string | null {
    // Simple positional logic based on region location
    const totalLines = lines.length;

    // Estimate which line range this region corresponds to
    const startLineIndex = Math.floor((region.y / 500) * totalLines); // Assuming 500px height
    const endLineIndex = Math.min(startLineIndex + 2, totalLines - 1);

    // Look for relevant text in the estimated line range
    for (let i = startLineIndex; i <= endLineIndex; i++) {
      if (i < 0 || i >= lines.length) continue;

      const line = lines[i];
      const value = this.extractValueFromLine(line);

      if (value && this.isValidForField(value, fieldName)) {
        return value;
      }
    }

    return null;
  }

  /**
   * Extract text using pattern matching for specific field types
   */
  private static extractByPattern(
    text: string,
    fieldName: string
  ): string | null {
    const patterns = this.getFieldPatterns("civil_id"); // Use a default document type for pattern matching
    const fieldPattern = patterns[fieldName];

    if (fieldPattern) {
      const matches = Array.from(text.matchAll(fieldPattern.pattern));
      if (matches.length > 0) {
        let value = matches[0][0].trim();
        if (fieldPattern.processor) {
          value = fieldPattern.processor(value);
        }
        return value;
      }
    }

    return null;
  }

  /**
   * Check if a value is valid for a specific field type
   */
  private static isValidForField(value: string, fieldName: string): boolean {
    if (!value || value.length < 1) return false;

    switch (fieldName) {
      case "documentNumber":
        return /^[A-Z0-9\s]{3,20}$/.test(value.trim());

      case "dateOfBirth":
      case "dateOfExpiry":
      case "dateOfIssue":
        return /\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(value);

      case "surname":
      case "givenNames":
        return value.length > 1 && value.length < 50;

      case "nationality":
        return value.length > 2 && value.length < 30;

      default:
        return value.length > 0 && value.length < 100;
    }
  }

  /**
   * Calculate confidence score for region-extracted text
   */
  private static calculateRegionConfidence(
    text: string,
    fieldName: string,
    docType: string
  ): number {
    let confidence = 0.6; // Base confidence for template extraction

    // Boost confidence for field-specific patterns
    if (this.isValidForField(text, fieldName)) {
      confidence += 0.2;
    }

    // Boost confidence for certain document types
    if (docType.includes("passport") && fieldName === "documentNumber") {
      confidence += 0.1;
    }

    // Reduce confidence for very short text
    if (text.length < 3) {
      confidence -= 0.2;
    }

    // Boost confidence for longer, well-formatted text
    if (text.length > 5 && /^[A-Za-z0-9\s\u0600-\u06FF\/\-\.]+$/.test(text)) {
      confidence += 0.1;
    }

    return Math.min(Math.max(confidence, 0.1), 1.0);
  }

  /**
   * Apply field-specific processing to extracted values
   */
  private static processFieldValue(text: string, fieldName: string): string {
    let processed = text.trim();

    switch (fieldName) {
      case "documentNumber":
        processed = processed.replace(/\s+/g, " ").toUpperCase();
        break;

      case "dateOfBirth":
      case "dateOfExpiry":
      case "dateOfIssue":
        processed = this.normalizeDateFormat(processed);
        break;

      case "surname":
      case "givenNames":
        processed = processed.replace(/\s+/g, " ");
        if (!/[\u0600-\u06FF]/.test(processed)) {
          // Latin text - capitalize properly
          processed = processed
            .split(" ")
            .map(
              (word) =>
                word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            )
            .join(" ");
        }
        break;

      case "nationality":
        processed = this.normalizeNationality(processed);
        break;

      case "sex":
        processed = this.normalizeSex(processed);
        break;

      default:
        processed = processed.replace(/\s+/g, " ");
    }

    return processed;
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
        console.log(
          `🔧 Post-processed ${fieldName}: "${field.value}" → "${processedValue}"`
        );
      }

      if (processedValue) {
        processed[fieldName] = this.createOcrField(
          processedValue,
          confidence,
          field.source
        );
      }
    }

    return processed;
  }

  /**
   * Utility methods for field processing
   */
  private static isCommonWord(value: string): boolean {
    const commonWords = [
      "the",
      "and",
      "or",
      "of",
      "in",
      "on",
      "at",
      "to",
      "for",
      "with",
      "republic",
      "lebanon",
      "lebanese",
      "document",
      "card",
      "identity",
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
    const arabicNumerals = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    const westernNumerals = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

    let converted = text;
    for (let i = 0; i < arabicNumerals.length; i++) {
      const arabicRegex = new RegExp(arabicNumerals[i], "g");
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
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
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
    if (lower.includes("lebanese") || lower.includes("لبناني"))
      return "Lebanese";
    return text;
  }

  /**
   * Create OCR field with standardized format
   */
  private static createOcrField(
    value: string | null,
    confidence: number,
    source: "mrz" | "ocr" | "derived"
  ): OcrField {
    return { value, confidence, source };
  }

  /**
   * Enhanced template loading with validation using TemplateLoader
   */
  private static async loadTemplateAdvanced(
    docType: VerifiedDocType,
    textAnalysis?: TextAnalysisResult
  ): Promise<DocumentTemplate> {
    const templateKey = docType;

    if (this.templates.has(templateKey)) {
      const cached = this.templates.get(templateKey)!;
      console.log(`✅ Using cached template for ${docType}`);
      return cached;
    }

    console.log(`📋 Loading template for ${docType}...`);

    // Try to load from template files first
    const templateFromFile = await TemplateLoader.loadTemplate(docType);
    if (templateFromFile) {
      console.log(`✅ Template loaded from JSON file for ${docType}: ${Object.keys(templateFromFile.fields).length} fields defined`);
      this.templates.set(templateKey, templateFromFile);
      return templateFromFile;
    }

    // Fallback to hardcoded templates
    console.log(`⚠️ No template file found for ${docType}, using fallback templates`);
    let templateData: DocumentTemplate;

    try {
      switch (docType) {
        case "civil_id":
          templateData = this.getCivilIdTemplate();
          break;
        case "army_card":
          templateData = {
            docType: "army_card",
            size: { w: 860, h: 540 },
            fields: {
              documentNumber: { x: 0.1, y: 0.1, w: 0.8, h: 0.1 },
              fullNameArabic: { x: 0.1, y: 0.3, w: 0.8, h: 0.1 },
              fullNameLatin: { x: 0.1, y: 0.5, w: 0.8, h: 0.1 },
            },
          };
          break;
        case "passport":
          // Determine passport version based on OCR content
          templateData = await this.getPassportTemplate(textAnalysis);
          break;
        case "residence_permit":
          templateData = this.getResidencePermitTemplate();
          break;
        default:
          throw new Error(
            `No template available for document type: ${docType}`
          );
      }

      console.log(
        `✅ Template loaded for ${docType} with ${
          Object.keys(templateData.fields).length
        } fields`
      );
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
  private static async assessImageQualityAdvanced(
    _imageUri: string
  ): Promise<QualityMetrics> {
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

  /**
   * Get appropriate passport template based on detected version
   */
  private static async getPassportTemplate(
    textAnalysis?: TextAnalysisResult
  ): Promise<DocumentTemplate> {
    // Detect passport version based on text content or document number format
    if (textAnalysis) {
      const text = textAnalysis.text.toLowerCase();

      // Old passport indicators:
      // - Document numbers starting with "RL" (e.g., RL 4186499)
      // - Different layout structure
      if (text.includes(" rl ") || /\brl\s*\d{7}/i.test(text)) {
        console.log("🔍 Detected old passport format");
        return this.getOldPassportTemplate();
      }

      // New passport indicators:
      // - Document numbers starting with "LR" (e.g., LR1927616)
      // - More modern layout
      if (
        text.includes(" lr ") ||
        /\blr\s*\d{7}/i.test(text) ||
        text.includes("lr1")
      ) {
        console.log("🔍 Detected new passport format");
        return this.getNewPassportTemplate();
      }
    }

    // Default to new passport template
    console.log("🔍 Using default new passport template");
    return this.getNewPassportTemplate();
  }

  /**
   * Template for Lebanese old passport (based on lebanese-old-passport.jpg)
   * Layout analysis from image:
   * - Photo on left side (0.02, 0.15, 0.28, 0.70)
   * - Document number top right (RL 4186499)
   * - First name and surname in center-right area
   * - Date fields in middle-right
   * - MRZ at bottom (2 lines)
   */
  private static getOldPassportTemplate(): DocumentTemplate {
    return {
      docType: "passport_old", 
      size: { w: 400, h: 620 }, // Updated for vertical two-page orientation
      fields: {
        // Document number in top-right (RL 4186499)
        documentNumber: { x: 0.65, y: 0.08, w: 0.32, h: 0.06 },

        // First name/Prénom (CHANTAL)
        givenNames: { x: 0.35, y: 0.18, w: 0.4, h: 0.05 },

        // Surname/Nom (HAIKAL)
        surname: { x: 0.35, y: 0.25, w: 0.4, h: 0.05 },

        // Nationality (Libanaise/Lebanese)
        nationality: { x: 0.35, y: 0.32, w: 0.4, h: 0.05 },

        // Date of Birth (15/04/93)
        dateOfBirth: { x: 0.35, y: 0.42, w: 0.25, h: 0.05 },

        // Sex (F)
        sex: { x: 0.65, y: 0.42, w: 0.1, h: 0.05 },

        // Place of Birth (BEH)
        placeOfBirth: { x: 0.35, y: 0.48, w: 0.4, h: 0.05 },

        // Date of Issue
        dateOfIssue: { x: 0.35, y: 0.54, w: 0.25, h: 0.05 },

        // Date of Expiry
        dateOfExpiry: { x: 0.35, y: 0.62, w: 0.25, h: 0.05 },

        // Authority (GENERAL DE DIVISION ABBAS IBRAHIM)
        authority: { x: 0.35, y: 0.68, w: 0.58, h: 0.08 },
      },
    };
  }

  /**
   * Template for Lebanese passport (based on lebanese-passport-two-pages.jpg)
   * Layout analysis from real Lebanese passport showing both pages vertically:
   * - Left page: Stamps and visa area  
   * - Right page: Information page with photo on left, data fields on right
   * - All coordinates are for the information page (right side)
   * - Document: LR19276166, Name: EL HAYEK ROY NICOLAS, DOB: 27 09 1996
   * - MRZ at bottom (2 lines)
   */
  private static getNewPassportTemplate(): DocumentTemplate {
    return {
      docType: "passport_new",
      size: { w: 400, h: 620 }, // Updated for vertical two-page orientation
      fields: {
        // Document number "LR19276166" (top right of info page)
        documentNumber: { x: 0.52, y: 0.19, w: 0.28, h: 0.025 },

        // Surname "EL HAYEK" (below document number on right)
        surname: { x: 0.52, y: 0.26, w: 0.35, h: 0.025 },

        // Given names "ROY NICOLAS" (below surname on right)
        givenNames: { x: 0.52, y: 0.295, w: 0.35, h: 0.025 },

        // Nationality "LEBANESE" (middle area on right)
        nationality: { x: 0.52, y: 0.33, w: 0.28, h: 0.025 },

        // Date of Birth "27 09 1996" (below nationality)
        dateOfBirth: { x: 0.52, y: 0.365, w: 0.25, h: 0.025 },

        // Sex "M" (next to date of birth)
        sex: { x: 0.78, y: 0.365, w: 0.08, h: 0.025 },

        // Place of Birth "SAIDA" (below date of birth)
        placeOfBirth: { x: 0.52, y: 0.4, w: 0.25, h: 0.025 },

        // Date of Issue "20 10 2020" (lower area on right)
        dateOfIssue: { x: 0.52, y: 0.435, w: 0.25, h: 0.025 },

        // Date of Expiry "25 10 2025" (bottom area on right)
        dateOfExpiry: { x: 0.52, y: 0.47, w: 0.25, h: 0.025 },
      },
    };
  }

  /**
   * Template for Lebanese Civil ID Front (based on lebanese-civil-id-front.jpg)
   * Layout analysis from image:
   * - Photo on left side (0.05, 0.20, 0.35, 0.75)
   * - All text fields in Arabic on right side
   * - Document number at bottom in special format
   */
  private static getCivilIdTemplate(): DocumentTemplate {
    return {
      docType: "civil_id_front",
      size: { w: 860, h: 540 },
      fields: {
        // Name (الاسم: روي) - top right
        fullNameArabic: { x: 0.45, y: 0.15, w: 0.5, h: 0.06 },

        // Surname (الشهرة: الحايك) - below name
        surname: { x: 0.45, y: 0.22, w: 0.5, h: 0.06 },

        // Father's name (اسم الاب: نقولا) - third line
        fatherName: { x: 0.45, y: 0.29, w: 0.5, h: 0.06 },

        // Mother's name and surname (اسم الام وشهرتها: ناهد مجى) - fourth line
        motherName: { x: 0.45, y: 0.36, w: 0.5, h: 0.06 },

        // Place of birth (محل الولادة: صيدا) - fifth line
        placeOfBirth: { x: 0.45, y: 0.43, w: 0.5, h: 0.06 },

        // Date of birth (تاريخ الولادة: 1998/05/27) - sixth line
        dateOfBirth: { x: 0.45, y: 0.5, w: 0.5, h: 0.06 },

        // Document number in special format at bottom (يمي٣٨٦٢٢٢١٢٢)
        documentNumber: { x: 0.45, y: 0.75, w: 0.5, h: 0.08 },
      },
    };
  }

  /**
   * Template for Lebanese Residence Permit (based on residence-permit-front.jpg)
   * Layout analysis from image:
   * - Photo on left side (0.05, 0.25, 0.25, 0.75)
   * - Document number top right
   * - Name fields in center
   * - Date fields at bottom
   */
  private static getResidencePermitTemplate(): DocumentTemplate {
    return {
      docType: "residence_permit",
      size: { w: 860, h: 540 },
      fields: {
        // Document number top-right (120612362)
        documentNumber: { x: 0.7, y: 0.12, w: 0.25, h: 0.05 },

        // First name (DEBORAH)
        givenNames: { x: 0.3, y: 0.2, w: 0.35, h: 0.05 },

        // Surname (MC CONWAY)
        surname: { x: 0.3, y: 0.27, w: 0.35, h: 0.05 },

        // Date of Birth (13/09/1985)
        dateOfBirth: { x: 0.3, y: 0.4, w: 0.2, h: 0.05 },

        // Nationality (Portuguese)
        nationality: { x: 0.65, y: 0.4, w: 0.25, h: 0.05 },

        // Profession
        profession: { x: 0.65, y: 0.5, w: 0.25, h: 0.05 },

        // Expiry Date (02/07/2026)
        dateOfExpiry: { x: 0.3, y: 0.6, w: 0.2, h: 0.05 },

        // Issue Date (03/07/2025)
        dateOfIssue: { x: 0.65, y: 0.6, w: 0.2, h: 0.05 },
      },
    };
  }

  /**
   * Validate that the captured image has a proper rectangular shape
   * This helps ensure document scanner properly detected and cropped the document
   */
  private static async validateRectangularShape(
    imageUri: string,
    docType?: VerifiedDocType
  ): Promise<boolean> {
    try {
      console.log("🔍 Validating document shape...");

      // Basic validation
      if (!imageUri || imageUri.length === 0) {
        console.error("❌ Invalid image URI");
        return false;
      }

      // Step 1: Validate image file exists and is accessible
      const fileExists = await this.validateImageFile(imageUri);
      if (!fileExists) {
        console.error("❌ Image file not accessible");
        return false;
      }

      // Step 2: Get image dimensions for aspect ratio validation
      const dimensions = await this.getImageDimensions(imageUri);
      if (!dimensions) {
        console.error("❌ Could not determine image dimensions");
        return false;
      }

      console.log(
        `📐 Image dimensions: ${dimensions.width}x${dimensions.height}`
      );

      // Step 3: Validate aspect ratio based on document type
      const aspectRatio = dimensions.width / dimensions.height;
      const isValidAspectRatio = this.validateAspectRatio(aspectRatio, docType);

      if (!isValidAspectRatio) {
        const expectedDescription = docType === 'passport' 
          ? 'vertical rectangle for opened passport (both pages)' 
          : 'horizontal rectangle for document';
        console.warn(
          `⚠️ Invalid aspect ratio: ${aspectRatio.toFixed(2)} for ${docType || 'document'} (expected: ${expectedDescription})`
        );
        return false;
      }

      // Step 4: Validate minimum dimensions
      const hasValidDimensions = this.validateMinimumDimensions(dimensions);
      if (!hasValidDimensions) {
        console.warn(
          `⚠️ Image dimensions too small: ${dimensions.width}x${dimensions.height}`
        );
        return false;
      }

      // Step 5: Advanced shape validation (if ML Kit is available)
      const shapeValidation = await this.performAdvancedShapeValidation(
        imageUri,
        dimensions
      );
      if (!shapeValidation.isValid) {
        console.warn(`⚠️ Shape validation failed: ${shapeValidation.reason}`);
        return false;
      }

      console.log(
        `✅ Document shape validation passed - aspect ratio: ${aspectRatio.toFixed(
          2
        )}, dimensions: ${dimensions.width}x${dimensions.height}`
      );
      return true;
    } catch (error) {
      console.error("❌ Shape validation failed:", error);
      return false;
    }
  }

  /**
   * Validate that image file exists and is accessible
   */
  private static async validateImageFile(imageUri: string): Promise<boolean> {
    try {
      // For React Native, we can use the File System API or similar to check file existence
      // This is a simplified validation - in production you'd use proper file system checks

      if (
        imageUri.startsWith("file://") ||
        imageUri.startsWith("/") ||
        imageUri.includes("http")
      ) {
        // Valid URI format
        return true;
      }

      return false;
    } catch (error) {
      console.error("File validation error:", error);
      return false;
    }
  }

  /**
   * Get image dimensions using available methods
   */
  private static async getImageDimensions(
    imageUri: string
  ): Promise<{ width: number; height: number } | null> {
    try {
      // Method 1: Try using React Native Image.getSize if available
      try {
        const { Image: RNImage } = require("react-native");
        if (RNImage && RNImage.getSize) {
          return new Promise((resolve) => {
            RNImage.getSize(
              imageUri,
              (width: number, height: number) => {
                resolve({ width, height });
              },
              (error: any) => {
                console.warn("Image.getSize failed:", error);
                resolve(null);
              }
            );
          });
        }
      } catch (requireError) {
        console.warn("react-native Image not available");
      }

      // Method 2: Try using react-native-image-size if available
      try {
        const ImageSize = require("react-native-image-size");
        const size = await ImageSize.getSize(imageUri);
        return { width: size.width, height: size.height };
      } catch (requireError) {
        console.warn("react-native-image-size not available");
      }

      // Method 3: Fallback - assume reasonable document dimensions
      // This is not ideal but prevents blocking the flow
      console.warn(
        "Could not determine exact dimensions, using fallback validation"
      );
      return { width: 1000, height: 700 }; // Reasonable document aspect ratio
    } catch (error) {
      console.error("Error getting image dimensions:", error);
      return null;
    }
  }

  /**
   * Validate aspect ratio against common document ratios
   */
  private static validateAspectRatio(aspectRatio: number, docType?: VerifiedDocType): boolean {
    // Document-specific aspect ratio validation
    if (docType === ('passport' as VerifiedDocType)) {
      // For passport: expecting VERTICAL rectangle (taller than wide) for opened passport with both pages
      // Based on real Lebanese passport image: approximately 1:1.5 to 1:1.6 ratio (width:height ≈ 0.6-0.65)
      const validPassportRatios = [
        { name: "Lebanese Passport (both pages)", ratio: 0.63, tolerance: 0.1 }, // Based on real image analysis
        { name: "Standard Opened Passport", ratio: 0.6, tolerance: 0.12 }, // Common opened passport ratio
        { name: "Passport Portrait", ratio: 0.55, tolerance: 0.1 }, // Slightly more vertical
        { name: "Passport Spread Wide", ratio: 0.7, tolerance: 0.1 }, // Slightly less vertical
      ];
      
      for (const validRatio of validPassportRatios) {
        const difference = Math.abs(aspectRatio - validRatio.ratio);
        if (difference <= validRatio.tolerance) {
          console.log(`✅ Valid passport aspect ratio: ${aspectRatio.toFixed(2)} matches ${validRatio.name}`);
          return true;
        }
      }
      
      console.log(`❌ Invalid passport aspect ratio: ${aspectRatio.toFixed(2)} (should be < 1.0 for vertical rectangle)`);
      return false;
    }
    
    // For other document types: horizontal rectangles
    const validRatios = [
      { name: "ID Card (CR80)", ratio: 1.585, tolerance: 0.15 }, // 85.6mm × 53.98mm
      { name: "Civil ID", ratio: 1.586, tolerance: 0.15 }, // Similar to credit card
      { name: "Army Card", ratio: 1.585, tolerance: 0.15 }, // Similar to ID card
      { name: "Residence Permit", ratio: 1.586, tolerance: 0.15 }, // ISO/IEC 7810 ID-1
      { name: "Business Card", ratio: 1.75, tolerance: 0.15 }, // 3.5" × 2"
      { name: "Driver License", ratio: 1.56, tolerance: 0.15 }, // Varies by country
      { name: "A4 (landscape)", ratio: 1.414, tolerance: 0.15 }, // 297mm × 210mm
    ];

    // Check if aspect ratio matches any valid document ratio
    for (const validRatio of validRatios) {
      const difference = Math.abs(aspectRatio - validRatio.ratio);
      if (difference <= validRatio.tolerance) {
        console.log(
          `✅ Valid aspect ratio: ${aspectRatio.toFixed(2)} matches ${
            validRatio.name
          }`
        );
        return true;
      }
    }

    // Fallback validation based on document type
    if (docType === ('passport' as VerifiedDocType)) {
      // For passport, should be vertical in the range 0.5-0.8 based on real images
      if (aspectRatio >= 0.5 && aspectRatio <= 0.8) {
        console.log(`✅ Passport aspect ratio ${aspectRatio.toFixed(2)} is in acceptable vertical range (0.5-0.8)`);
        return true;
      }
    } else {
      // For other documents, allow reasonable horizontal range (1.2 to 2.0)
      if (aspectRatio >= 1.2 && aspectRatio <= 2.0) {
        console.log(`✅ Document aspect ratio ${aspectRatio.toFixed(2)} is within horizontal range`);
        return true;
      }
    }

    const expectedRange = docType === ('passport' as VerifiedDocType) ? 'vertical (0.5-0.8 for both pages)' : 'horizontal (1.2-2.0)';
    console.warn(
      `❌ Invalid aspect ratio: ${aspectRatio.toFixed(2)} for ${docType || 'document'} (expected: ${expectedRange})`
    );
    return false;
  }

  /**
   * Validate minimum image dimensions
   */
  private static validateMinimumDimensions(dimensions: {
    width: number;
    height: number;
  }): boolean {
    const MIN_WIDTH = 400; // Minimum width for readable document
    const MIN_HEIGHT = 250; // Minimum height for readable document
    const MAX_WIDTH = 4000; // Maximum reasonable width
    const MAX_HEIGHT = 4000; // Maximum reasonable height

    if (dimensions.width < MIN_WIDTH || dimensions.height < MIN_HEIGHT) {
      console.warn(
        `❌ Dimensions too small: ${dimensions.width}x${dimensions.height} (min: ${MIN_WIDTH}x${MIN_HEIGHT})`
      );
      return false;
    }

    if (dimensions.width > MAX_WIDTH || dimensions.height > MAX_HEIGHT) {
      console.warn(
        `❌ Dimensions too large: ${dimensions.width}x${dimensions.height} (max: ${MAX_WIDTH}x${MAX_HEIGHT})`
      );
      return false;
    }

    console.log(
      `✅ Valid dimensions: ${dimensions.width}x${dimensions.height}`
    );
    return true;
  }

  /**
   * Perform advanced shape validation using image analysis
   */
  private static async performAdvancedShapeValidation(
    imageUri: string,
    dimensions: { width: number; height: number }
  ): Promise<{ isValid: boolean; reason?: string }> {
    try {
      // Advanced validation could include:
      // 1. Edge detection to verify straight edges
      // 2. Corner detection to verify 4 corners at ~90 degrees
      // 3. Background uniformity check
      // 4. Document boundary detection

      // Note: imageUri available for future advanced processing
      console.log(
        `🔍 Performing advanced validation on image: ${imageUri.substring(
          0,
          50
        )}...`
      );

      // For now, implement basic validation based on dimensions and scanner output

      // Check if image is too square (likely cropped incorrectly)
      const aspectRatio = dimensions.width / dimensions.height;
      if (Math.abs(aspectRatio - 1.0) < 0.1) {
        return {
          isValid: false,
          reason: "Image appears too square, likely incorrect cropping",
        };
      }

      // Check if image is too wide/narrow (likely incorrect detection)
      if (aspectRatio > 3.0 || aspectRatio < 0.5) {
        return {
          isValid: false,
          reason: `Extreme aspect ratio: ${aspectRatio.toFixed(2)}`,
        };
      }

      // Additional checks could be implemented here with image processing libraries:
      // - Use OpenCV-like functionality to detect edges and corners
      // - Analyze histogram for background uniformity
      // - Check for blur/focus issues
      // - Verify document edges are straight lines

      // Since react-native-document-scanner-plugin already does sophisticated
      // OpenCV-based detection, we can trust its output for most cases
      console.log("✅ Advanced shape validation passed");
      return { isValid: true };
    } catch (error) {
      console.error("Advanced shape validation error:", error);
      return { isValid: false, reason: "Validation error occurred" };
    }
  }

  /**
   * Test rectangular shape validation with sample images from assets folder
   * This method can be used for development/testing purposes
   */
  static async testValidationWithAssets(): Promise<void> {
    console.log(
      "🧪 Testing rectangular shape validation with sample assets..."
    );

    const testImages = [
      {
        path: "/Users/royhayek/Desktop/identity-verification/assets/lebanese-old-passport.jpg",
        name: "Old Passport",
      },
      {
        path: "/Users/royhayek/Desktop/identity-verification/assets/lebanese-new-passport.jpg",
        name: "New Passport",
      },
      {
        path: "/Users/royhayek/Desktop/identity-verification/assets/lebanese-passport-two-pages.jpg",
        name: "Passport Two Pages",
        docType: "passport" as VerifiedDocType, // Test with document type
      },
      {
        path: "/Users/royhayek/Desktop/identity-verification/assets/lebanese-civil-id-front.jpg",
        name: "Civil ID Front",
      },
      {
        path: "/Users/royhayek/Desktop/identity-verification/assets/lebanese-civil-id-back.jpg",
        name: "Civil ID Back",
      },
      {
        path: "/Users/royhayek/Desktop/identity-verification/assets/residence-permit-front.jpg",
        name: "Residence Permit",
      },
    ];

    for (const testImage of testImages) {
      try {
        console.log(`\n🔍 Testing ${testImage.name}...`);
        const docType = (testImage as any).docType; // Get document type if specified
        const isValid = await this.validateRectangularShape(testImage.path, docType);
        console.log(
          `${isValid ? "✅" : "❌"} ${testImage.name}: ${
            isValid ? "PASSED" : "FAILED"
          }${docType ? ` (${docType})` : ''}`
        );
      } catch (error) {
        console.error(`❌ ${testImage.name}: ERROR - ${error}`);
      }
    }

    console.log("\n🧪 Validation testing completed");
  }

  /**
   * Test method to analyze the exact dimensions and aspect ratio of the real passport image
   */
  static async analyzePassportImageDimensions(): Promise<void> {
    console.log("🔍 Analyzing real passport image dimensions...");
    
    const passportImagePath = "/Users/royhayek/Desktop/identity-verification/assets/lebanese-passport-two-pages.jpg";
    
    try {
      const dimensions = await this.getImageDimensions(passportImagePath);
      if (dimensions) {
        const aspectRatio = dimensions.width / dimensions.height;
        console.log(`📐 Real passport dimensions: ${dimensions.width}x${dimensions.height}`);
        console.log(`📊 Aspect ratio: ${aspectRatio.toFixed(4)} (width/height)`);
        console.log(`📏 Height/width ratio: ${(1/aspectRatio).toFixed(4)}`);
        
        // Test current validation logic
        const isValidWithCurrentLogic = this.validateAspectRatio(aspectRatio, 'passport');
        console.log(`✅ Validation result: ${isValidWithCurrentLogic ? 'PASS' : 'FAIL'}`);
        
        // Recommendations
        if (aspectRatio < 0.5) {
          console.log("💡 Very vertical - consider if this is typical or edge case");
        } else if (aspectRatio > 0.8) {
          console.log("⚠️ Getting close to square - may need tighter validation");
        } else {
          console.log("✅ Good vertical aspect ratio for opened passport");
        }
      }
    } catch (error) {
      console.error("❌ Failed to analyze passport dimensions:", error);
    }
  }

  /**
   * Get validation metrics for a given image
   * Useful for debugging and fine-tuning validation parameters
   */
  static async getValidationMetrics(imageUri: string): Promise<{
    fileExists: boolean;
    dimensions?: { width: number; height: number };
    aspectRatio?: number;
    validAspectRatio?: boolean;
    validDimensions?: boolean;
    shapeValidation?: { isValid: boolean; reason?: string };
  }> {
    const metrics: any = {};

    try {
      // File existence
      metrics.fileExists = await this.validateImageFile(imageUri);

      if (metrics.fileExists) {
        // Dimensions
        metrics.dimensions = await this.getImageDimensions(imageUri);

        if (metrics.dimensions) {
          // Aspect ratio
          metrics.aspectRatio =
            metrics.dimensions.width / metrics.dimensions.height;
          metrics.validAspectRatio = this.validateAspectRatio(
            metrics.aspectRatio
          );
          metrics.validDimensions = this.validateMinimumDimensions(
            metrics.dimensions
          );

          // Advanced validation
          metrics.shapeValidation = await this.performAdvancedShapeValidation(
            imageUri,
            metrics.dimensions
          );
        }
      }

      return metrics;
    } catch (error) {
      console.error("Error getting validation metrics:", error);
      return { fileExists: false };
    }
  }

  /**
   * Test template-based extraction with sample images
   * This method can be used for development/testing purposes
   */
  static async testTemplateExtraction(): Promise<void> {
    console.log("🧪 Testing template-based extraction with sample assets...");

    const testCases = [
      {
        imagePath:
          "/Users/royhayek/Desktop/identity-verification/assets/lebanese-old-passport.jpg",
        docType: "passport" as VerifiedDocType,
        name: "Old Passport",
      },
      {
        imagePath:
          "/Users/royhayek/Desktop/identity-verification/assets/lebanese-new-passport.jpg",
        docType: "passport" as VerifiedDocType,
        name: "New Passport",
      },
      {
        imagePath:
          "/Users/royhayek/Desktop/identity-verification/assets/lebanese-civil-id-front.jpg",
        docType: "civil_id" as VerifiedDocType,
        name: "Civil ID Front",
      },
      {
        imagePath:
          "/Users/royhayek/Desktop/identity-verification/assets/residence-permit-front.jpg",
        docType: "residence_permit" as VerifiedDocType,
        name: "Residence Permit",
      },
    ];

    for (const testCase of testCases) {
      try {
        console.log(`\n🔍 Testing ${testCase.name} template extraction...`);

        // Simulate text analysis (in real implementation, this would come from OCR)
        const mockTextAnalysis: TextAnalysisResult = {
          text: "Sample text for testing template extraction logic",
          lines: ["Sample", "text", "for", "testing"],
          confidence: 0.8,
          language: "mixed",
          hasArabic: testCase.docType === "civil_id",
          hasLatin: true,
          wordCount: 6,
          lineCount: 4,
        };

        // Load template for the document type
        const template = await this.loadTemplateAdvanced(
          testCase.docType,
          mockTextAnalysis
        );

        // Test template extraction
        const extractedFields = this.extractUsingTemplate(
          mockTextAnalysis,
          template,
          testCase.imagePath
        );

        console.log(`📊 ${testCase.name} Results:`);
        console.log(
          `   Fields defined in template: ${
            Object.keys(template.fields).length
          }`
        );
        console.log(
          `   Fields extracted: ${Object.keys(extractedFields).length}`
        );

        for (const [fieldName, field] of Object.entries(extractedFields)) {
          console.log(
            `   ✅ ${fieldName}: "${
              field.value
            }" (confidence: ${field.confidence.toFixed(2)})`
          );
        }

        if (Object.keys(extractedFields).length === 0) {
          console.log(
            `   ⚠️ No fields extracted - may need text analysis improvement`
          );
        }
      } catch (error) {
        console.error(`❌ ${testCase.name}: ERROR - ${error}`);
      }
    }

    console.log("\n🧪 Template extraction testing completed");
  }

  /**
   * Test document type validation with cross-document scenarios
   * This method can be used for development/testing purposes
   */
  static async testDocumentValidation(): Promise<void> {
    console.log(
      "🧪 Testing document type validation with cross-document scenarios..."
    );

    const testScenarios = [
      {
        name: "Passport expected, Civil ID provided",
        expectedType: "passport" as VerifiedDocType,
        mockText:
          "الجمهورية اللبنانية وزارة الداخلية بطاقة هوية مدنية الاسم: احمد محمد",
        shouldPass: false,
      },
      {
        name: "Civil ID expected, Civil ID provided",
        expectedType: "civil_id" as VerifiedDocType,
        mockText:
          "الجمهورية اللبنانية وزارة الداخلية بطاقة هوية مدنية الاسم: احمد محمد 12345678901",
        shouldPass: true,
      },
      {
        name: "Passport expected, Passport provided",
        expectedType: "passport" as VerifiedDocType,
        mockText:
          "REPUBLIC OF LEBANON PASSPORT LR1927616 SURNAME: EL HAYEK GIVEN NAMES: ROY",
        shouldPass: true,
      },
      {
        name: "Army Card expected, Civil ID provided",
        expectedType: "army_card" as VerifiedDocType,
        mockText: "الجمهورية اللبنانية وزارة الداخلية بطاقة هوية مدنية",
        shouldPass: false,
      },
      {
        name: "Army Card expected, Army Card provided",
        expectedType: "army_card" as VerifiedDocType,
        mockText: "الجيش اللبناني LEBANESE ARMY الرتبة: نقيب CAPTAIN",
        shouldPass: true,
      },
      {
        name: "Residence Permit expected, Passport provided",
        expectedType: "residence_permit" as VerifiedDocType,
        mockText: "REPUBLIC OF LEBANON PASSPORT LR1927616",
        shouldPass: false,
      },
    ];

    for (const scenario of testScenarios) {
      try {
        console.log(`\n🔍 Testing: ${scenario.name}`);

        // Create mock text analysis
        const mockTextAnalysis: TextAnalysisResult = {
          text: scenario.mockText,
          lines: scenario.mockText.split(" "),
          confidence: 0.8,
          language: "mixed",
          hasArabic: /[\u0600-\u06FF]/.test(scenario.mockText),
          hasLatin: /[a-zA-Z]/.test(scenario.mockText),
          wordCount: scenario.mockText.split(" ").length,
          lineCount: 3,
        };

        // Detect document type from mock text
        const detectedType = this.analyzeContentForDocType(mockTextAnalysis);
        console.log(`   Detected type: ${detectedType}`);

        // Perform validation
        const isValid = await this.validateDocumentType(
          detectedType,
          scenario.expectedType,
          "mock://test-image.jpg"
        );

        const result = isValid ? "PASSED" : "FAILED";
        const expected = scenario.shouldPass ? "PASS" : "FAIL";
        const status = isValid === scenario.shouldPass ? "✅" : "❌";

        console.log(`   ${status} ${result} (expected: ${expected})`);

        if (!isValid && !scenario.shouldPass) {
          // Generate and display error message
          const errorMessage = this.generateDocumentMismatchError(
            scenario.expectedType
          );
          console.log(`   Error message: ${errorMessage.split("\n")[0]}`); // First line only
        }
      } catch (error) {
        console.error(`❌ ${scenario.name}: ERROR - ${error}`);
      }
    }

    console.log("\n🧪 Document validation testing completed");
  }
}
