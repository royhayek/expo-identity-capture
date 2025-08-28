import { manipulateAsync, SaveFormat, FlipType, ImageResult } from 'expo-image-manipulator';
import * as ImageManipulator from 'expo-image-manipulator';
import { CaptureConfig } from '../types';
import { DocumentTemplate } from '../types/extraction';

export interface ProcessImageOptions {
  uri: string;
  config: CaptureConfig;
}

export interface CropImageOptions {
  uri: string;
  cropX: number;      // X coordinate (0-1, normalized)
  cropY: number;      // Y coordinate (0-1, normalized) 
  cropWidth: number;  // Width (0-1, normalized)
  cropHeight: number; // Height (0-1, normalized)
  quality?: number;   // Compression quality (0-1)
}

export interface DocumentCorners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
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

  /**
   * Crop image based on normalized coordinates (0-1)
   */
  static async cropImage(options: CropImageOptions): Promise<string> {
    const { uri, cropX, cropY, cropWidth, cropHeight, quality = 0.8 } = options;

    try {
      console.log(`🖼️ Cropping image with normalized bounds: x=${cropX}, y=${cropY}, w=${cropWidth}, h=${cropHeight}`);
      
      // First, get the image dimensions
      const imageInfo = await this.getImageInfo(uri);
      const { width: imageWidth, height: imageHeight } = imageInfo;
      
      console.log(`📏 Image dimensions: ${imageWidth}x${imageHeight}`);
      
      // Convert normalized coordinates to pixel coordinates
      const pixelX = Math.round(cropX * imageWidth);
      const pixelY = Math.round(cropY * imageHeight);
      const pixelWidth = Math.round(cropWidth * imageWidth);
      const pixelHeight = Math.round(cropHeight * imageHeight);
      
      console.log(`🖼️ Converting to pixel bounds: x=${pixelX}, y=${pixelY}, w=${pixelWidth}, h=${pixelHeight}`);
      
      const result = await manipulateAsync(
        uri,
        [
          {
            crop: {
              originX: pixelX,
              originY: pixelY,
              width: pixelWidth,
              height: pixelHeight,
            },
          },
        ],
        {
          compress: quality,
          format: SaveFormat.JPEG,
        }
      );

      console.log(`✅ Image cropped successfully: ${result.uri}`);
      return result.uri;
    } catch (error) {
      console.error('❌ Failed to crop image:', error);
      throw new Error(`Failed to crop image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get image dimensions
   */
  static async getImageInfo(uri: string): Promise<{ width: number; height: number }> {
    try {
      // Use manipulateAsync with no actions to get image info
      const result = await manipulateAsync(uri, []);
      return { width: result.width, height: result.height };
    } catch (error) {
      console.error('❌ Failed to get image info:', error);
      throw new Error(`Failed to get image info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Crop document from detected corners using perspective correction
   */
  static async cropDocumentFromCorners(uri: string, corners: DocumentCorners, quality: number = 0.8): Promise<string> {
    try {
      console.log(`📐 Cropping document from detected corners`);
      
      // Calculate bounding rectangle from corners
      const minX = Math.min(corners.topLeft.x, corners.topRight.x, corners.bottomLeft.x, corners.bottomRight.x);
      const maxX = Math.max(corners.topLeft.x, corners.topRight.x, corners.bottomLeft.x, corners.bottomRight.x);
      const minY = Math.min(corners.topLeft.y, corners.topRight.y, corners.bottomLeft.y, corners.bottomRight.y);
      const maxY = Math.max(corners.topLeft.y, corners.topRight.y, corners.bottomLeft.y, corners.bottomRight.y);

      // Add small padding to ensure document edges are included
      const padding = 0.02; // 2% padding
      const cropX = Math.max(0, minX - padding);
      const cropY = Math.max(0, minY - padding);
      const cropWidth = Math.min(1, (maxX - minX) + (2 * padding));
      const cropHeight = Math.min(1, (maxY - minY) + (2 * padding));

      console.log(`📏 Calculated crop bounds: x=${cropX.toFixed(3)}, y=${cropY.toFixed(3)}, w=${cropWidth.toFixed(3)}, h=${cropHeight.toFixed(3)}`);

      return await this.cropImage({
        uri,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        quality,
      });
    } catch (error) {
      console.error('❌ Failed to crop document from corners:', error);
      throw new Error(`Failed to crop document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Crop document using frame-based detection (fallback method)
   */
  static async cropDocumentFromFrame(uri: string, frameConfig: { top: string; left: string; right: string; height: string }, quality: number = 0.8): Promise<string> {
    try {
      console.log(`📱 Cropping document using frame configuration`);

      // Convert percentage strings to numbers
      const top = parseFloat(frameConfig.top.replace('%', '')) / 100;
      const left = parseFloat(frameConfig.left.replace('%', '')) / 100;
      const right = parseFloat(frameConfig.right.replace('%', '')) / 100;
      const height = parseFloat(frameConfig.height.replace('%', '')) / 100;

      // Add 5% buffer to ensure we capture the full document
      const buffer = 0.05; // 5% buffer
      console.log(`📏 Adding ${(buffer * 100).toFixed(0)}% buffer to frame configuration`);

      // Calculate crop dimensions with buffer
      const cropX = Math.max(0, left - buffer);
      const cropY = Math.max(0, top - buffer);
      const cropWidth = Math.min(1, (1 - left - right) + (2 * buffer));
      const cropHeight = Math.min(1, height + (2 * buffer));

      console.log(`📐 Frame-based crop bounds with buffer: x=${cropX.toFixed(3)}, y=${cropY.toFixed(3)}, w=${cropWidth.toFixed(3)}, h=${cropHeight.toFixed(3)}`);

      return await this.cropImage({
        uri,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        quality,
      });
    } catch (error) {
      console.error('❌ Failed to crop document from frame:', error);
      throw new Error(`Failed to crop document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate frame boundaries from template field positions
   */
  static calculateTemplateFrameBounds(template: DocumentTemplate): {
    top: string;
    left: string; 
    right: string;
    height: string;
  } {
    const fieldPositions = Object.values(template.fields);
    
    if (fieldPositions.length === 0) {
      // Fallback to default frame if no fields defined
      return { top: '30%', left: '10%', right: '10%', height: '40%' };
    }
    
    // Find bounding box of all fields
    const minX = Math.min(...fieldPositions.map(field => field.x));
    const maxX = Math.max(...fieldPositions.map(field => field.x + field.w));
    const minY = Math.min(...fieldPositions.map(field => field.y));
    const maxY = Math.max(...fieldPositions.map(field => field.y + field.h));
    
    // Add conservative padding around the bounding box
    const padding = 0.02; // 2% padding (reduced to avoid over-cropping)
    const top = Math.max(0, minY - padding);
    const left = Math.max(0, minX - padding);
    const right = Math.max(0, 1 - maxX - padding);
    const height = Math.min(1, (maxY + padding) - (minY - padding)); // Calculate actual height span with padding
    
    console.log(`📐 Calculated template frame bounds: fields bbox(${minX.toFixed(3)}, ${minY.toFixed(3)}, ${maxX.toFixed(3)}, ${maxY.toFixed(3)})`);
    console.log(`📐 With ${(padding*100).toFixed(0)}% padding: top=${(top*100).toFixed(1)}%, left=${(left*100).toFixed(1)}%, right=${(right*100).toFixed(1)}%, height=${(height*100).toFixed(1)}%`);
    console.log(`📊 Crop area covers: ${((1-left-right)*100).toFixed(1)}% width x ${(height*100).toFixed(1)}% height`);
    
    return {
      top: `${(top * 100).toFixed(1)}%`,
      left: `${(left * 100).toFixed(1)}%`,
      right: `${(right * 100).toFixed(1)}%`,
      height: `${(height * 100).toFixed(1)}%`
    };
  }

  /**
   * Crop document using template-based exact document dimensions with tight boundaries
   */
  static async cropDocumentFromTemplate(uri: string, template: DocumentTemplate, quality: number = 0.8): Promise<string> {
    try {
      console.log(`📋 Cropping document using template: ${template.docType}`);
      console.log(`📐 Template document size: ${template.size.w} x ${template.size.h}`);
      
      // Get the actual image dimensions
      const imageInfo = await this.getImageInfo(uri);
      const { width: imageWidth, height: imageHeight } = imageInfo;
      console.log(`📏 Image dimensions: ${imageWidth}x${imageHeight}`);
      
      // Calculate the expected document aspect ratio from template
      const templateAspectRatio = template.size.w / template.size.h;
      const imageAspectRatio = imageWidth / imageHeight;
      
      console.log(`📐 Template aspect ratio: ${templateAspectRatio.toFixed(3)}, Image aspect ratio: ${imageAspectRatio.toFixed(3)}`);
      
      // Define tight cropping margins with safety buffer to reduce boundaries
      // These margins will remove excess background space while preserving document edges
      // Use more aggressive margins for passports due to typical background space
      const isPassport = template.docType.toLowerCase().includes('passport');
      const marginPercent = isPassport ? 0.12 : 0.08; // 12% for passports, 8% for other documents (with safety buffer)
      
      let cropX: number, cropY: number, cropWidth: number, cropHeight: number;
      
      if (imageAspectRatio > templateAspectRatio) {
        // Image is wider than template - crop horizontally to match template ratio
        const targetWidth = imageHeight * templateAspectRatio;
        const baseCropX = (imageWidth - targetWidth) / (2 * imageWidth);
        
        // Apply additional margin reduction
        const additionalMargin = marginPercent * (targetWidth / imageWidth);
        cropX = baseCropX + additionalMargin;
        cropY = marginPercent; // Add vertical margins too
        cropWidth = (targetWidth / imageWidth) - (2 * additionalMargin);
        cropHeight = 1 - (2 * marginPercent);
        console.log(`📐 Image wider than template - cropping horizontally with ${(marginPercent*100).toFixed(0)}% margins + safety buffer${isPassport ? ' (passport mode)' : ''}`);
      } else {
        // Image is taller than template - crop vertically to match template ratio
        const targetHeight = imageWidth / templateAspectRatio;
        const baseCropY = (imageHeight - targetHeight) / (2 * imageHeight);
        
        // Apply additional margin reduction
        const additionalMargin = marginPercent * (targetHeight / imageHeight);
        cropX = marginPercent; // Add horizontal margins too
        cropY = baseCropY + additionalMargin;
        cropWidth = 1 - (2 * marginPercent);
        cropHeight = (targetHeight / imageHeight) - (2 * additionalMargin);
        console.log(`📐 Image taller than template - cropping vertically with ${(marginPercent*100).toFixed(0)}% margins + safety buffer${isPassport ? ' (passport mode)' : ''}`);
      }

      // Ensure crop bounds are valid (between 0 and 1) with safety buffer
      // Allow more aggressive cropping for passports but with safety limits
      const maxCropPercent = isPassport ? 0.35 : 0.25; // Allow up to 35% crop for passports, 25% for others
      const minSizePercent = isPassport ? 0.3 : 0.5; // Minimum 30% size for passports, 50% for others
      
      cropX = Math.max(0, Math.min(cropX, maxCropPercent));
      cropY = Math.max(0, Math.min(cropY, maxCropPercent));
      cropWidth = Math.max(minSizePercent, Math.min(cropWidth, 1 - cropX));
      cropHeight = Math.max(minSizePercent, Math.min(cropHeight, 1 - cropY));

      console.log(`📐 Template-based tight crop bounds: x=${cropX.toFixed(3)}, y=${cropY.toFixed(3)}, w=${cropWidth.toFixed(3)}, h=${cropHeight.toFixed(3)}`);
      console.log(`📐 This will crop tightly with safety buffer to preserve document edges${isPassport ? ' (passport optimized)' : ''}`);

      return await this.cropImage({
        uri,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        quality,
      });
    } catch (error) {
      console.error('❌ Failed to crop document from template:', error);
      throw new Error(`Failed to crop document using template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static getTimestamp(): string {
    return new Date().toISOString();
  }
}