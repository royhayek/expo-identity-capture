import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';

export interface MLKitResult {
  text: string;
  confidence: number;
  success: boolean;
}

export class MLKitOCR {
  static async extractText(imageUri: string): Promise<MLKitResult> {
    try {
      // Try multiple scripts for better Lebanese passport detection
      const scripts = [
        { script: TextRecognitionScript.LATIN, name: 'Latin' },
        { script: TextRecognitionScript.DEVANAGARI, name: 'Devanagari' }, // For potential Arabic text
      ];
      
      let bestResult = { text: '', confidence: 0 };

      for (const { script } of scripts) {
        try {
          const result = await TextRecognition.recognize(imageUri, script);

          if (result && result.text && result.text.length > bestResult.text.length) {
            // ML Kit provides high accuracy, using 90 as default confidence
            bestResult = { 
              text: result.text, 
              confidence: 90
            };
          }

        } catch (scriptError) {
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
      // ML Kit is generally available on devices with Google Play Services
      // Simple check by verifying the module exists
      return typeof TextRecognition.recognize === 'function';
    } catch (error) {
      return false;
    }
  }
}