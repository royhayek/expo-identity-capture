import MLKit from "@react-native-ml-kit/text-recognition";

export interface OCRResult {
  text: string;
  confidence: number;
  blocks?: any[];
  processingTime: number;
}

export interface OCROptions {
  language?: string;
  enableOCR?: boolean;
  timeout?: number;
}

/**
 * Comprehensive OCR processor with multiple engine support and fallbacks
 */
export class OCRProcessor {
  private static readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private static readonly MAX_RETRIES = 2;

  /**
   * Extract text from image using best available OCR engine
   */
  static async extractText(imageUri: string, options: OCROptions = {}): Promise<OCRResult> {
    const startTime = Date.now();
    const timeout = options.timeout || this.DEFAULT_TIMEOUT;
    
    console.log(`🔍 OCRProcessor: Starting text extraction from ${imageUri}`);
    console.log(`⚙️ Options:`, options);

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`OCR timeout after ${timeout}ms`)), timeout);
    });

    try {
      // Try ML Kit first (primary engine)
      const result = await Promise.race([
        this.extractWithMLKit(imageUri, options),
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
   * Extract text using Google ML Kit with retries
   */
  private static async extractWithMLKit(imageUri: string, options: OCROptions): Promise<OCRResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        console.log(`📱 ML Kit attempt ${attempt}/${this.MAX_RETRIES}`);
        
        const result = await MLKit.recognize(imageUri);
        const text = result.text || "";
        
        // Calculate confidence based on result quality
        const confidence = this.calculateMLKitConfidence(text, result);
        
        console.log(`📊 ML Kit results: ${text.length} chars, confidence: ${confidence.toFixed(2)}`);
        
        // Log blocks for debugging
        if (result.blocks && result.blocks.length > 0) {
          console.log(`📝 Found ${result.blocks.length} text blocks`);
          result.blocks.forEach((block, i) => {
            console.log(`   Block ${i + 1}: "${block.text?.substring(0, 50)}${(block.text?.length || 0) > 50 ? '...' : ''}"`);
          });
        }
        
        return {
          text,
          confidence,
          blocks: result.blocks,
          processingTime: 0 // Will be set by parent function
        };
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ ML Kit attempt ${attempt} failed:`, error);
        
        if (attempt < this.MAX_RETRIES) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    throw lastError || new Error("ML Kit failed after all retries");
  }

  /**
   * Calculate ML Kit confidence based on result quality
   */
  private static calculateMLKitConfidence(text: string, result: any): number {
    let confidence = 0.5; // Base confidence

    // Text length factor
    if (text.length > 200) confidence += 0.2;
    else if (text.length > 100) confidence += 0.15;
    else if (text.length > 50) confidence += 0.1;

    // Block structure factor
    if (result.blocks && result.blocks.length > 0) {
      confidence += Math.min(result.blocks.length * 0.05, 0.2);
      
      // Check for block-level confidence if available
      const blockConfidences = result.blocks
        .map((b: any) => b.confidence)
        .filter((c: any) => typeof c === 'number');
      
      if (blockConfidences.length > 0) {
        const avgBlockConfidence = blockConfidences.reduce((a: number, b: number) => a + b, 0) / blockConfidences.length;
        confidence += avgBlockConfidence * 0.2;
      }
    }

    // Text quality factor (ratio of valid characters)
    const validChars = (text.match(/[a-zA-Z0-9\u0600-\u06FF\s]/g) || []).length;
    const qualityRatio = validChars / Math.max(text.length, 1);
    confidence += qualityRatio * 0.1;

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
    
    // Check for reasonable character distribution
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
    
    // Fix common OCR artifacts
    cleaned = cleaned.replace(/[^\w\s\u0600-\u06FF<>«»‹›''"".,:;!?()[\]{}\-_=+*/\\|~`@#$%^&]/g, '');
    
    // Normalize line breaks
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    return cleaned;
  }
}