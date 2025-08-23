import TesseractOcr from '@devinikhiya/react-native-tesseractocr';

export interface TesseractNativeResult {
  text: string;
  confidence: number;
  success: boolean;
}

export class TesseractNativeOCR {
  static async extractText(imageUri: string): Promise<TesseractNativeResult> {
    try {
      // Try multiple languages for better Lebanese passport detection
      const languages = ['eng', 'ara', 'fra'];
      let bestResult = { text: '', confidence: 0 };

      for (const language of languages) {
        try {
          const result = await TesseractOcr.recognize(imageUri, language, {
            whitelist: null,
            blacklist: null
          });

          if (result && result.length > bestResult.text.length) {
            bestResult = { 
              text: result, 
              confidence: 85 // Tesseract doesn't provide confidence, using default
            };
          }

        } catch (langError) {
          continue;
        }
      }

      if (bestResult.text.trim().length === 0) {
        return {
          text: '',
          confidence: 0,
          success: false
        };
      }

      return {
        text: bestResult.text,
        confidence: bestResult.confidence,
        success: true
      };

    } catch (error) {

      return {
        text: '',
        confidence: 0,
        success: false
      };
    }
  }

  static async isAvailable(): Promise<boolean> {
    try {
      // Simple availability check by trying to access the TesseractOcr module
      return typeof TesseractOcr.recognize === 'function';
    } catch (error) {
      return false;
    }
  }
}