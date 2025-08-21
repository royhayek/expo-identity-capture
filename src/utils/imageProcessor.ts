import { manipulateAsync, SaveFormat, FlipType } from 'expo-image-manipulator';
import { CaptureConfig } from '../types';

export interface ProcessImageOptions {
  uri: string;
  config: CaptureConfig;
}

export class ImageProcessor {
  static async processImage({ uri, config }: ProcessImageOptions): Promise<string> {
    const { quality = 0.8, maxWidth = 1920, maxHeight = 1080, output = 'uri' } = config;

    try {
      const result = await manipulateAsync(
        uri,
        [
          {
            resize: {
              width: maxWidth,
              height: maxHeight,
            },
          },
        ],
        {
          compress: quality,
          format: SaveFormat.JPEG,
          base64: output === 'base64',
        }
      );

      return output === 'base64' ? `data:image/jpeg;base64,${result.base64}` : result.uri;
    } catch (error) {
      throw new Error(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async compressImage(uri: string, quality: number = 0.8): Promise<string> {
    try {
      const result = await manipulateAsync(
        uri,
        [],
        {
          compress: quality,
          format: SaveFormat.JPEG,
        }
      );

      return result.uri;
    } catch (error) {
      throw new Error(`Failed to compress image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static getTimestamp(): string {
    return new Date().toISOString();
  }
}