import { isSupported, extractTextFromImage } from 'expo-text-extractor';

export interface ExpoTextExtractorResult {
  text: string;
  confidence: number;
  success: boolean;
}

export class ExpoTextExtractorOCR {
  static async extractText(imageUri: string): Promise<ExpoTextExtractorResult> {
    try {
      // Extract text using Expo Text Extractor
      const textArray = await extractTextFromImage(imageUri);

      if (!textArray || textArray.length === 0 || !textArray.some(text => text.trim().length > 0)) {
        return {
          text: '',
          confidence: 0,
          success: false
        };
      }

      const extractedText = textArray.join(' ').trim();
      const confidence = 85; // Default confidence since the package doesn't provide it

      return {
        text: extractedText,
        confidence: confidence,
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
      // Check if Expo Text Extractor is available
      return isSupported;
    } catch (error) {
      return false;
    }
  }

  static async getSupportedLanguages(): Promise<string[]> {
    try {
      // expo-text-extractor doesn't provide language support info
      return ['en']; // Default to English
    } catch (error) {
      return [];
    }
  }
}