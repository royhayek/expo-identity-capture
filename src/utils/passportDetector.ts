import { TesseractNativeOCR, TesseractNativeResult } from "./tesseractNativeOCR";
import { MLKitOCR, MLKitResult } from "./mlKitOCR";
import { ExpoTextExtractorOCR, ExpoTextExtractorResult } from "./expoTextExtractorOCR";
import { logger } from "./logger";

export interface PassportDetectionResult {
  isLebanese: boolean;
  confidence: number;
  detectedKeywords: string[];
  providers: {
    tesseract: { success: boolean; text: string; confidence: number };
    mlKit: { success: boolean; text: string; confidence: number };
    expoText: { success: boolean; text: string; confidence: number };
  };
}

export class PassportDetector {
  // Lebanese keywords to search for
  private static readonly LEBANESE_KEYWORDS = [
    // English variations
    "LBN",
    "LEBANON",
    "LEBANESE",
    "EBANISE",
    "REPUBLIC OF LEBANON",

    // Arabic variations (romanized and Arabic script)
    "LIBAN",
    "LUBNAN",
    "لبنان",
    "الجمهورية اللبنانية",

    // French variations
    "LIBAN",
    "LIBANAIS",
    "REPUBLIQUE LIBANAISE",

    // Additional variations
    "LB",
    "BEIRUT",
    "بيروت",
  ];

  static async detectLebanesePassport(imageUri: string): Promise<PassportDetectionResult> {
    try {
      // Run all three OCR providers in parallel
      const [tesseractResult, mlKitResult, expoResult] = await Promise.all([
        this.runTesseractOCR(imageUri),
        this.runMLKitOCR(imageUri),
        this.runExpoTextOCR(imageUri),
      ]);

      // Collect all extracted text for analysis
      const allTexts = [
        tesseractResult.text,
        mlKitResult.text,
        expoResult.text,
      ].filter((text) => text && text.length > 0);

      // Analyze all texts for Lebanese keywords
      const detectedKeywords = this.findLebaneseKeywords(allTexts);
      const isLebanese = detectedKeywords.length > 0;

      // Calculate overall confidence based on successful extractions and keyword matches
      const successfulProviders = [tesseractResult, mlKitResult, expoResult].filter((r) => r.success).length;
      const averageConfidence = successfulProviders > 0 ? 
        (tesseractResult.confidence + mlKitResult.confidence + expoResult.confidence) / successfulProviders : 0;

      // Boost confidence if multiple providers found keywords
      let finalConfidence = averageConfidence;
      if (isLebanese && successfulProviders > 1) {
        finalConfidence = Math.min(95, averageConfidence + detectedKeywords.length * 5);
      }

      const result: PassportDetectionResult = {
        isLebanese,
        confidence: finalConfidence,
        detectedKeywords,
        providers: {
          tesseract: {
            success: tesseractResult.success,
            text: tesseractResult.text.substring(0, 100),
            confidence: tesseractResult.confidence,
          },
          mlKit: {
            success: mlKitResult.success,
            text: mlKitResult.text.substring(0, 100),
            confidence: mlKitResult.confidence,
          },
          expoText: {
            success: expoResult.success,
            text: expoResult.text.substring(0, 100),
            confidence: expoResult.confidence,
          },
        },
      };

      // Single summary log
      logger.info("Passport Detection", 
        `${isLebanese ? "Lebanese" : "Non-Lebanese"} passport (${finalConfidence}% confidence, ${detectedKeywords.length} keywords found)`
      );

      return result;
    } catch (error) {
      logger.error("Passport Detection", `Detection failed`);

      // Return safe default (non-Lebanese) on error
      return {
        isLebanese: false,
        confidence: 0,
        detectedKeywords: [],
        providers: {
          tesseract: { success: false, text: "", confidence: 0 },
          mlKit: { success: false, text: "", confidence: 0 },
          expoText: { success: false, text: "", confidence: 0 },
        },
      };
    }
  }

  private static async runTesseractOCR(imageUri: string): Promise<TesseractNativeResult> {
    try {
      const available = await TesseractNativeOCR.isAvailable();
      if (!available) {
        return { text: "", confidence: 0, success: false };
      }
      return await TesseractNativeOCR.extractText(imageUri);
    } catch (error) {
      return { text: "", confidence: 0, success: false };
    }
  }

  private static async runMLKitOCR(imageUri: string): Promise<MLKitResult> {
    try {
      const available = await MLKitOCR.isAvailable();
      if (!available) {
        return { text: "", confidence: 0, success: false };
      }
      return await MLKitOCR.extractText(imageUri);
    } catch (error) {
      return { text: "", confidence: 0, success: false };
    }
  }

  private static async runExpoTextOCR(imageUri: string): Promise<ExpoTextExtractorResult> {
    try {
      const available = await ExpoTextExtractorOCR.isAvailable();
      if (!available) {
        return { text: "", confidence: 0, success: false };
      }
      return await ExpoTextExtractorOCR.extractText(imageUri);
    } catch (error) {
      return { text: "", confidence: 0, success: false };
    }
  }

  private static findLebaneseKeywords(texts: string[]): string[] {
    const detectedKeywords = new Set<string>();

    for (const text of texts) {
      if (!text) continue;

      const upperText = text.toUpperCase();

      for (const keyword of this.LEBANESE_KEYWORDS) {
        const upperKeyword = keyword.toUpperCase();

        if (upperText.includes(upperKeyword)) {
          detectedKeywords.add(keyword);
        }
      }
    }

    return Array.from(detectedKeywords);
  }

  // Backward compatibility function
  static async isLebanesePassport(imageUri: string): Promise<boolean> {
    const result = await this.detectLebanesePassport(imageUri);
    return result.isLebanese;
  }

  // Utility function to check OCR provider availability
  static async checkProviderAvailability(): Promise<{
    tesseract: boolean;
    mlKit: boolean;
    expoText: boolean;
  }> {
    const [tesseract, mlKit, expoText] = await Promise.all([
      TesseractNativeOCR.isAvailable(),
      MLKitOCR.isAvailable(),
      ExpoTextExtractorOCR.isAvailable(),
    ]);

    const availableCount = [tesseract, mlKit, expoText].filter(Boolean).length;
    logger.info("OCR Providers", `${availableCount}/3 available`);

    return { tesseract, mlKit, expoText };
  }
}
