import { recognizeText, getCloudVisionConfig } from "../services/CloudVisionOCR";

export interface OCRResult {
  text: string;
  confidence: number;
  blocks?: any[];
  processingTime: number;
  detectedLanguages?: string[];
}

export interface OCROptions {
  language?: string;
  languageHints?: string[];
  enableOCR?: boolean;
  timeout?: number;
}

/**
 * Comprehensive OCR processor using Google Cloud Vision API
 * Supports Arabic, English, French and other languages
 */
export class OCRProcessor {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly MAX_RETRIES = 2;

  /**
   * Extract text from image using Cloud Vision API
   */
  static async extractText(imageUri: string, options: OCROptions = {}): Promise<OCRResult> {
    const startTime = Date.now();
    const timeout = options.timeout || this.DEFAULT_TIMEOUT;

    console.log(`🔍 OCRProcessor: Starting text extraction from ${imageUri}`);
    console.log(`⚙️ Options:`, options);

    // Check if Cloud Vision is configured
    if (!getCloudVisionConfig()) {
      console.warn('⚠️ Cloud Vision not configured, returning empty result');
      return {
        text: "",
        confidence: 0,
        processingTime: Date.now() - startTime
      };
    }

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`OCR timeout after ${timeout}ms`)), timeout);
    });

    try {
      // Use Cloud Vision API
      const result = await Promise.race([
        this.extractWithCloudVision(imageUri, options),
        timeoutPromise
      ]);

      const processingTime = Date.now() - startTime;
      console.log(`✅ OCR completed successfully in ${processingTime}ms`);

      return {
        ...result,
        processingTime
      };
    } catch (error) {
      console.error("❌ OCR extraction failed:", error);

      // Return minimal result to prevent complete failure
      return {
        text: "",
        confidence: 0,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Extract text using Google Cloud Vision API with retries
   */
  private static async extractWithCloudVision(imageUri: string, options: OCROptions): Promise<OCRResult> {
    let lastError: Error | null = null;

    // Default language hints for identity documents (Arabic, English, French)
    const languageHints = options.languageHints ?? ['ar', 'en', 'fr'];

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`☁️ Cloud Vision attempt ${attempt}/${this.MAX_RETRIES}`);

        const result = await recognizeText(imageUri, languageHints);
        const text = result.text || "";

        // Calculate confidence based on result quality
        const confidence = this.calculateConfidence(text, result);

        console.log(`📊 Cloud Vision results: ${text.length} chars, confidence: ${confidence.toFixed(2)}`);
        console.log(`🌐 Detected languages: ${result.detectedLanguages.join(', ')}`);

        // Log annotations for debugging
        if (result.annotations && result.annotations.length > 1) {
          console.log(`📝 Found ${result.annotations.length - 1} text blocks`);
          // First annotation is full text, rest are individual blocks
          result.annotations.slice(1, 6).forEach((annotation, i) => {
            console.log(`   Block ${i + 1}: "${annotation.text?.substring(0, 50)}${(annotation.text?.length || 0) > 50 ? '...' : ''}"`);
          });
        }

        return {
          text,
          confidence,
          blocks: result.annotations?.slice(1), // Skip first (full text) annotation
          detectedLanguages: result.detectedLanguages,
          processingTime: 0 // Will be set by parent function
        };

      } catch (error: any) {
        lastError = error as Error;
        console.warn(`⚠️ Cloud Vision attempt ${attempt} failed:`, error?.message || error);

        if (attempt < this.MAX_RETRIES) {
          // Wait before retrying
          await new Promise<void>(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error("Cloud Vision failed after all retries");
  }

  /**
   * Calculate confidence based on result quality
   */
  private static calculateConfidence(text: string, result: any): number {
    let confidence = 0.5; // Base confidence

    // Text length factor
    if (text.length > 200) confidence += 0.2;
    else if (text.length > 100) confidence += 0.15;
    else if (text.length > 50) confidence += 0.1;

    // Annotations structure factor
    if (result.annotations && result.annotations.length > 1) {
      confidence += Math.min((result.annotations.length - 1) * 0.03, 0.15);
    }

    // Language detection factor (if languages detected, more confidence)
    if (result.detectedLanguages && result.detectedLanguages.length > 0) {
      confidence += 0.1;
    }

    // Text quality factor (ratio of valid characters including Arabic)
    const validChars = (text.match(/[a-zA-Z0-9\u0600-\u06FF\s]/g) || []).length;
    const qualityRatio = validChars / Math.max(text.length, 1);
    confidence += qualityRatio * 0.15;

    return Math.min(confidence, 1.0);
  }

  /**
   * Validate OCR result quality
   */
  static validateResult(result: OCRResult): boolean {
    // Basic validation criteria
    if (result.confidence < 0.3) {
      console.warn(`⚠️ Low OCR confidence: ${result.confidence.toFixed(2)}`);
      return false;
    }

    if (result.text.length < 10) {
      console.warn(`⚠️ OCR text too short: ${result.text.length} characters`);
      return false;
    }

    // Check for reasonable character distribution (including Arabic)
    const alphanumericCount = (result.text.match(/[a-zA-Z0-9\u0600-\u06FF]/g) || []).length;
    const alphanumericRatio = alphanumericCount / result.text.length;

    if (alphanumericRatio < 0.5) {
      console.warn(`⚠️ Low alphanumeric ratio: ${alphanumericRatio.toFixed(2)}`);
      return false;
    }

    return true;
  }

  /**
   * Clean and preprocess OCR text
   */
  static preprocessText(text: string): string {
    // Remove excessive whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();

    // Fix common OCR artifacts (preserve Arabic characters \u0600-\u06FF)
    cleaned = cleaned.replace(/[^\w\s\u0600-\u06FF<>«»‹›''"".,:;!?()[\]{}\-_=+*/\\|~`@#$%^&]/g, '');

    // Normalize line breaks
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    return cleaned;
  }
}
